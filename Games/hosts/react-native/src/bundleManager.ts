import {
  BundleSelectionError,
  base64ToBytes,
  bytesToHex,
  nobleCryptoAdapter,
  selectBundleForHost,
  verifyBundleBytes,
  verifyBundleDelta,
  verifyBundleSignature,
  type BundleSelection,
} from "@moongames/host-core";
import {
  DEFAULT_UPDATE_POLICY,
  compareSemver,
  type BundleDelta,
  type BundleUpdatePolicy,
  type GameBundleDescriptor,
  type ReleaseManifest,
  type TrustedBundleKeys,
} from "@moongames/game-sdk";
import RNFS from "react-native-fs";
import { unzip } from "react-native-zip-archive";

export interface BundledFallback {
  zipPath: string;
  descriptor: GameBundleDescriptor;
}

export interface BundleManagerOptions {
  gameId: string;
  manifestUrl?: string;
  hostProtocol: number;
  trustedKeys: TrustedBundleKeys;
  bundledFallback?: BundledFallback;
  updatePolicy?: BundleUpdatePolicy;
  onUpdateAvailable?: (descriptor: GameBundleDescriptor) => void;
  onLog?: (message: string) => void;
}

export interface ResolvedBundle {
  directory: string;
  entryPath: string;
  entryUri: string;
  descriptor: GameBundleDescriptor;
  source: "remote" | "delta" | "cache" | "bundled";
}

interface InstalledBundle {
  descriptor: GameBundleDescriptor;
  directory: string;
  source: ResolvedBundle["source"];
}

interface CachedManifest {
  etag?: string;
  fetchedAt: number;
  value: unknown;
}

const CACHE_ROOT = `${RNFS.DocumentDirectoryPath}/moongames`;

function join(...parts: string[]): string {
  return parts.join("/").replace(/\/+/g, "/");
}

async function ensureDirectory(directory: string): Promise<void> {
  if (!(await RNFS.exists(directory))) {
    await RNFS.mkdir(directory);
  }
}

async function readJson<T>(filePath: string): Promise<T | null> {
  if (!(await RNFS.exists(filePath))) {
    return null;
  }
  try {
    return JSON.parse(await RNFS.readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await RNFS.writeFile(filePath, JSON.stringify(value), "utf8");
}

async function readBytes(filePath: string): Promise<Uint8Array> {
  return base64ToBytes(await RNFS.readFile(filePath, "base64"));
}

function bytesToBase64(bytes: Uint8Array): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    const chunk = (first << 16) | (second << 8) | third;
    output += alphabet[(chunk >>> 18) & 63];
    output += alphabet[(chunk >>> 12) & 63];
    output += index + 1 < bytes.length ? alphabet[(chunk >>> 6) & 63] : "=";
    output += index + 2 < bytes.length ? alphabet[chunk & 63] : "=";
  }
  return output;
}

function bundleDirectory(descriptor: GameBundleDescriptor): string {
  return join(
    CACHE_ROOT,
    descriptor.gameId,
    `${descriptor.version}-${descriptor.sha256.slice(0, 12)}`,
  );
}

function deltaDirectory(descriptor: GameBundleDescriptor, fromVersion: string): string {
  return join(
    CACHE_ROOT,
    descriptor.gameId,
    `delta-${fromVersion}-${descriptor.version}-${Date.now()}`,
  );
}

function fileUri(filePath: string): string {
  const encoded = filePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `file://${encoded}`;
}

function resolved(
  descriptor: GameBundleDescriptor,
  directory: string,
  source: ResolvedBundle["source"],
): ResolvedBundle {
  const entryPath = join(directory, descriptor.entry);
  return {
    descriptor,
    directory,
    entryPath,
    entryUri: fileUri(entryPath),
    source,
  };
}

function safePath(root: string, relative: string): string {
  if (
    relative.startsWith("/") ||
    relative.includes("\\") ||
    relative.split("/").some((part) => part === ".." || part === "")
  ) {
    throw new Error(`Unsafe bundle path: ${relative}`);
  }
  return join(root, relative);
}

function policyFor(options: BundleManagerOptions): BundleUpdatePolicy {
  return { ...DEFAULT_UPDATE_POLICY, ...options.updatePolicy };
}

function manifestCachePath(gameId: string): string {
  return join(CACHE_ROOT, gameId, "release-manifest-cache.json");
}

async function readManifestCache(gameId: string): Promise<CachedManifest | null> {
  return readJson<CachedManifest>(manifestCachePath(gameId));
}

async function writeManifestCache(
  gameId: string,
  value: CachedManifest,
): Promise<void> {
  await ensureDirectory(join(CACHE_ROOT, gameId));
  await writeJson(manifestCachePath(gameId), value);
}

async function fetchJson<T>(
  url: string,
  headers: Record<string, string>,
): Promise<{ value: T; etag?: string; status: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", ...headers },
      signal: controller.signal,
    });
    if (response.status === 304) {
      return { value: undefined as T, etag: undefined, status: 304 };
    }
    if (!response.ok) {
      throw new Error(`Request failed: HTTP ${response.status}.`);
    }
    return {
      value: (await response.json()) as T,
      etag: response.headers.get("etag") ?? undefined,
      status: response.status,
    };
  } finally {
    clearTimeout(timer);
  }
}

function deltaUrlFor(
  descriptor: GameBundleDescriptor,
  manifestUrl: string,
  fromVersion: string,
): string {
  const target = new URL(descriptor.url, manifestUrl);
  const parts = target.pathname.split("/");
  parts.pop();
  parts.push("deltas");
  parts.push(
    `${encodeURIComponent(fromVersion)}-${encodeURIComponent(descriptor.version)}`,
  );
  parts.push("delta.json");
  target.pathname = parts.join("/");
  return target.toString();
}

async function isValidDirectory(
  descriptor: GameBundleDescriptor,
  directory: string,
): Promise<boolean> {
  return RNFS.exists(join(directory, descriptor.entry));
}

async function loadInstalled(
  options: BundleManagerOptions,
): Promise<InstalledBundle | null> {
  const metadataPath = join(CACHE_ROOT, options.gameId, "installed.json");
  const installed = await readJson<InstalledBundle>(metadataPath);
  if (installed === null) {
    return null;
  }
  if (installed.descriptor.gameId !== options.gameId) {
    return null;
  }
  const directory = bundleDirectory(installed.descriptor);
  if (!(await isValidDirectory(installed.descriptor, directory))) {
    return null;
  }
  const signature = await verifyBundleSignature(
    installed.descriptor,
    options.trustedKeys,
  );
  if (!signature.ok) {
    options.onLog?.(`Ignoring cached bundle: ${signature.error}`);
    return null;
  }
  return { ...installed, directory };
}

async function rememberInstalled(
  options: BundleManagerOptions,
  descriptor: GameBundleDescriptor,
  directory: string,
  source: ResolvedBundle["source"],
): Promise<void> {
  await writeJson(join(CACHE_ROOT, descriptor.gameId, "installed.json"), {
    descriptor,
    directory,
    source,
  } satisfies InstalledBundle);
  await pruneVersions(options, policyFor(options).keepVersions ?? 2);
}

async function pruneVersions(
  options: BundleManagerOptions,
  keep: number,
): Promise<void> {
  const gameRoot = join(CACHE_ROOT, options.gameId);
  if (!(await RNFS.exists(gameRoot))) {
    return;
  }
  const entries = await RNFS.readDir(gameRoot);
  const versions = entries
    .filter((entry) => entry.isDirectory() && /^\d+\.\d+\.\d+/.test(entry.name))
    .sort((left, right) => {
      const leftVersion = left.name.split("-")[0] ?? "";
      const rightVersion = right.name.split("-")[0] ?? "";
      return compareSemver(rightVersion, leftVersion);
    });
  for (const entry of versions.slice(Math.max(1, keep))) {
    await RNFS.unlink(join(gameRoot, entry.name)).catch(() => undefined);
  }
}

async function selectManifest(
  options: BundleManagerOptions,
  value: unknown,
): Promise<BundleSelection> {
  const selection = selectBundleForHost(
    value,
    options.gameId,
    options.hostProtocol,
    options.trustedKeys,
  );
  const signature = await verifyBundleSignature(
    selection.descriptor,
    options.trustedKeys,
  );
  if (!signature.ok) {
    throw new Error(signature.error ?? "The selected bundle is not signed.");
  }
  return selection;
}

async function fetchManifest(
  options: BundleManagerOptions,
): Promise<{ selection: BundleSelection; fromCache: boolean }> {
  const policy = policyFor(options);
  const cache = await readManifestCache(options.gameId);
  const fresh =
    cache !== null &&
    Date.now() - cache.fetchedAt <
      (policy.checkIntervalMs ?? DEFAULT_UPDATE_POLICY.checkIntervalMs ?? 0);
  if (policy.mode === "manual") {
    if (cache === null) {
      throw new Error("No cached release manifest is available.");
    }
    return { selection: await selectManifest(options, cache.value), fromCache: true };
  }
  if (fresh && policy.mode !== "forced") {
    return { selection: await selectManifest(options, cache.value), fromCache: true };
  }
  if (options.manifestUrl === undefined) {
    throw new Error("No remote release manifest is configured.");
  }
  try {
    const response = await fetchJson<unknown>(options.manifestUrl, {
      ...(cache?.etag === undefined ? {} : { "If-None-Match": cache.etag }),
      "Cache-Control": "no-cache",
    });
    let value: unknown;
    let etag: string | undefined;
    if (response.status === 304 && cache !== null) {
      value = cache.value;
      etag = cache.etag;
    } else {
      value = response.value;
      etag = response.etag;
    }
    const selection = await selectManifest(options, value);
    await writeManifestCache(options.gameId, {
      etag,
      fetchedAt: Date.now(),
      value,
    });
    return { selection, fromCache: response.status === 304 };
  } catch (cause) {
    if (cache !== null) {
      options.onLog?.("Using the cached release manifest.");
      return { selection: await selectManifest(options, cache.value), fromCache: true };
    }
    throw cause;
  }
}

async function copyDirectory(from: string, to: string): Promise<void> {
  await ensureDirectory(to);
  for (const entry of await RNFS.readDir(from)) {
    const source = join(from, entry.name);
    const destination = join(to, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(source, destination);
    } else {
      await RNFS.copyFile(source, destination);
    }
  }
}

async function installDelta(
  options: BundleManagerOptions,
  installed: InstalledBundle,
  descriptor: GameBundleDescriptor,
): Promise<ResolvedBundle> {
  if (options.manifestUrl === undefined) {
    throw new Error("A delta update requires a manifest URL.");
  }
  const url = deltaUrlFor(descriptor, options.manifestUrl, installed.descriptor.version);
  const response = await fetchJson<BundleDelta>(url, { "Cache-Control": "no-cache" });
  const delta = response.value;
  const verification = await verifyBundleDelta(delta, options.trustedKeys);
  if (!verification.ok) {
    throw new Error(verification.error ?? "The delta is not trusted.");
  }
  if (
    delta.gameId !== descriptor.gameId ||
    delta.baseVersion !== installed.descriptor.version ||
    delta.baseSha256 !== installed.descriptor.sha256 ||
    delta.targetVersion !== descriptor.version ||
    delta.targetSha256 !== descriptor.sha256
  ) {
    throw new Error("The delta does not match the installed or target release.");
  }

  const target = bundleDirectory(descriptor);
  const scratch = deltaDirectory(descriptor, installed.descriptor.version);
  await ensureDirectory(scratch);
  try {
    await copyDirectory(installed.directory, scratch);
    for (const file of delta.files) {
      const bytes = await readBytes(new URL(file.url, url).toString());
      if (bytes.byteLength !== file.size) {
        throw new Error(`Delta file ${file.path} has the wrong size.`);
      }
      const digest = bytesToHex(await nobleCryptoAdapter.sha256(bytes));
      if (digest !== file.sha256) {
        throw new Error(`Delta file ${file.path} has the wrong hash.`);
      }
      const destination = safePath(scratch, file.path);
      await ensureDirectory(destination.substring(0, destination.lastIndexOf("/")));
      await RNFS.writeFile(destination, bytesToBase64(bytes), "base64");
    }
    for (const relative of delta.removed) {
      const file = safePath(scratch, relative);
      if (await RNFS.exists(file)) {
        await RNFS.unlink(file);
      }
    }
    if (!(await isValidDirectory(descriptor, scratch))) {
      throw new Error(`The delta bundle entry ${descriptor.entry} is missing.`);
    }
    if (await RNFS.exists(target)) {
      await RNFS.unlink(target);
    }
    await RNFS.moveFile(scratch, target);
    await rememberInstalled(options, descriptor, target, "delta");
    return resolved(descriptor, target, "delta");
  } finally {
    await RNFS.unlink(scratch).catch(() => undefined);
  }
}

async function installRemote(
  options: BundleManagerOptions,
  descriptor: GameBundleDescriptor,
): Promise<ResolvedBundle> {
  const directory = bundleDirectory(descriptor);
  if (await isValidDirectory(descriptor, directory)) {
    await rememberInstalled(options, descriptor, directory, "cache");
    return resolved(descriptor, directory, "cache");
  }

  const manifestUrl = options.manifestUrl;
  if (manifestUrl === undefined) {
    throw new Error("A remote bundle URL requires a manifest URL.");
  }
  const downloadUrl = new URL(descriptor.url, manifestUrl).toString();
  const parent = join(CACHE_ROOT, descriptor.gameId);
  await ensureDirectory(parent);
  const stamp = `${Date.now()}`;
  const zipPath = join(parent, `download-${stamp}.zip`);
  const tempDirectory = join(parent, `extract-${stamp}`);

  try {
    options.onLog?.(`Downloading ${descriptor.gameId} ${descriptor.version}`);
    const download = await RNFS.downloadFile({
      fromUrl: downloadUrl,
      toFile: zipPath,
    }).promise;
    if (download.statusCode < 200 || download.statusCode >= 300) {
      throw new Error(`Bundle download failed: HTTP ${download.statusCode}.`);
    }

    const verification = await verifyBundleBytes(
      descriptor,
      await readBytes(zipPath),
      options.trustedKeys,
    );
    if (!verification.ok) {
      throw new Error(verification.error ?? "Bundle verification failed.");
    }

    await ensureDirectory(tempDirectory);
    await unzip(zipPath, tempDirectory);
    if (!(await isValidDirectory(descriptor, tempDirectory))) {
      throw new Error(`The bundle entry ${descriptor.entry} is missing.`);
    }

    if (await RNFS.exists(directory)) {
      await RNFS.unlink(directory);
    }
    await RNFS.moveFile(tempDirectory, directory);
    await rememberInstalled(options, descriptor, directory, "remote");
    return resolved(descriptor, directory, "remote");
  } finally {
    await RNFS.unlink(zipPath).catch(() => undefined);
    await RNFS.unlink(tempDirectory).catch(() => undefined);
  }
}

async function installBundled(
  options: BundleManagerOptions,
  fallback: BundledFallback,
): Promise<ResolvedBundle> {
  const directory = bundleDirectory(fallback.descriptor);
  if (!(await isValidDirectory(fallback.descriptor, directory))) {
    const verification = await verifyBundleBytes(
      fallback.descriptor,
      await readBytes(fallback.zipPath),
      options.trustedKeys,
    );
    if (!verification.ok) {
      throw new Error(verification.error ?? "The bundled fallback is invalid.");
    }
    if (await RNFS.exists(directory)) {
      await RNFS.unlink(directory);
    }
    await ensureDirectory(directory);
    await unzip(fallback.zipPath, directory);
  }
  await rememberInstalled(options, fallback.descriptor, directory, "bundled");
  return resolved(fallback.descriptor, directory, "bundled");
}

export async function resolveGameBundle(
  options: BundleManagerOptions,
): Promise<ResolvedBundle> {
  await ensureDirectory(CACHE_ROOT);
  await ensureDirectory(join(CACHE_ROOT, options.gameId));

  const policy = policyFor(options);
  const installed = await loadInstalled(options);
  let selection: BundleSelection | null = null;

  try {
    const result = await fetchManifest(options);
    selection = result.selection;
    options.onLog?.(
      `Selected ${selection.descriptor.gameId} ${selection.descriptor.version}${
        result.fromCache ? " from cache" : ""
      }`,
    );
  } catch (cause) {
    options.onLog?.(
      cause instanceof BundleSelectionError
        ? cause.message
        : `Remote bundle unavailable: ${
            cause instanceof Error ? cause.message : String(cause)
          }`,
    );
  }

  if (selection === null) {
    if (installed !== null) {
      return resolved(installed.descriptor, installed.directory, "cache");
    }
    if (options.bundledFallback !== undefined) {
      options.onLog?.("Using the app-bundled fallback.");
      return installBundled(options, options.bundledFallback);
    }
    throw new Error("No game bundle is available offline.");
  }

  const target = selection.descriptor;
  if (
    installed !== null &&
    compareSemver(installed.descriptor.version, target.version) > 0
  ) {
    options.onLog?.(
      `Keeping installed ${installed.descriptor.version}; the remote manifest offers an older signed build.`,
    );
    return resolved(installed.descriptor, installed.directory, "cache");
  }

  const upToDate =
    installed !== null &&
    installed.descriptor.version === target.version &&
    installed.descriptor.sha256 === target.sha256;
  if (upToDate) {
    return resolved(installed.descriptor, installed.directory, "cache");
  }

  if (installed !== null && (policy.mode === "prompt" || policy.mode === "manual")) {
    options.onUpdateAvailable?.(target);
    return resolved(installed.descriptor, installed.directory, "cache");
  }

  try {
    if (installed !== null) {
      options.onLog?.(
        `Applying delta ${installed.descriptor.version} -> ${target.version}`,
      );
      return await installDelta(options, installed, target);
    }
  } catch (cause) {
    options.onLog?.(
      `Delta unavailable: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }

  try {
    return await installRemote(options, target);
  } catch (cause) {
    if (policy.mode === "forced") {
      throw cause;
    }
    options.onLog?.(
      `Update failed: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }

  if (installed !== null) {
    return resolved(installed.descriptor, installed.directory, "cache");
  }
  if (options.bundledFallback !== undefined) {
    options.onLog?.("Using the app-bundled fallback.");
    return installBundled(options, options.bundledFallback);
  }
  throw new Error("No game bundle is available offline.");
}
