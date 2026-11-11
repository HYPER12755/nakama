import { BundleSelectionError, base64ToBytes, selectBundleForHost, verifyBundleBytes, verifyBundleSignature } from "@moongames/host-core";
import {
  compareSemver,
  type GameBundleDescriptor,
  type ReleaseManifest,
  type TrustedBundleKeys,
} from "@moongames/game-sdk";
import RNFS from "react-native-fs";
import { unzip } from "react-native-zip-archive";

export interface BundledFallback {
  /** Absolute path to a ZIP copied into the app bundle by the host build. */
  zipPath: string;
  descriptor: GameBundleDescriptor;
}

export interface BundleManagerOptions {
  gameId: string;
  manifestUrl?: string;
  hostProtocol: number;
  trustedKeys: TrustedBundleKeys;
  bundledFallback?: BundledFallback;
  onLog?: (message: string) => void;
}

export interface ResolvedBundle {
  directory: string;
  entryPath: string;
  entryUri: string;
  descriptor: GameBundleDescriptor;
  source: "remote" | "cache" | "bundled";
}

interface InstalledBundle {
  descriptor: GameBundleDescriptor;
  directory: string;
  source: ResolvedBundle["source"];
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

function bundleDirectory(descriptor: GameBundleDescriptor): string {
  return join(
    CACHE_ROOT,
    descriptor.gameId,
    `${descriptor.version}-${descriptor.sha256.slice(0, 12)}`,
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
  // Never trust a filesystem path from metadata. The signed descriptor and
  // content hash determine the only valid cache directory.
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
  descriptor: GameBundleDescriptor,
  directory: string,
  source: ResolvedBundle["source"],
): Promise<void> {
  await writeJson(join(CACHE_ROOT, descriptor.gameId, "installed.json"), {
    descriptor,
    directory,
    source,
  } satisfies InstalledBundle);
}

async function fetchManifest(
  options: BundleManagerOptions,
): Promise<{ manifest: ReleaseManifest; descriptor: GameBundleDescriptor }> {
  if (options.manifestUrl === undefined) {
    throw new Error("No remote release manifest is configured.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let response: Response;
  try {
    response = await fetch(options.manifestUrl, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw new Error(`Release manifest request failed: HTTP ${response.status}.`);
  }
  const manifest = (await response.json()) as ReleaseManifest;
  const selection = selectBundleForHost(
    manifest,
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
  await ensureDirectory(join(CACHE_ROOT, options.gameId));
  await writeJson(
    join(CACHE_ROOT, options.gameId, "release-manifest.json"),
    selection.manifest,
  );
  return { manifest: selection.manifest, descriptor: selection.descriptor };
}

async function installRemote(
  options: BundleManagerOptions,
  descriptor: GameBundleDescriptor,
): Promise<ResolvedBundle> {
  const directory = bundleDirectory(descriptor);
  if (await isValidDirectory(descriptor, directory)) {
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
    await rememberInstalled(descriptor, directory, "remote");
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
  await rememberInstalled(fallback.descriptor, directory, "bundled");
  return resolved(fallback.descriptor, directory, "bundled");
}

/**
 * Resolves a verified game bundle. Remote updates are preferred, then a
 * previously installed cache, then the app-bundled fallback. Every source is
 * checked against the host's pinned Ed25519 keys.
 */
export async function resolveGameBundle(
  options: BundleManagerOptions,
): Promise<ResolvedBundle> {
  await ensureDirectory(CACHE_ROOT);
  await ensureDirectory(join(CACHE_ROOT, options.gameId));

  const installed = await loadInstalled(options);

  try {
    const { descriptor, manifest } = await fetchManifest(options);
    options.onLog?.(
      `Selected ${descriptor.gameId} ${descriptor.version} from ${manifest.bundles.length} releases`,
    );
    if (
      installed !== null &&
      compareSemver(installed.descriptor.version, descriptor.version) > 0
    ) {
      options.onLog?.(
        `Keeping installed ${installed.descriptor.version}; the remote manifest offers an older signed build.`,
      );
      return resolved(installed.descriptor, installed.directory, "cache");
    }
    return await installRemote(options, descriptor);
  } catch (cause) {
    options.onLog?.(
      cause instanceof BundleSelectionError
        ? cause.message
        : `Remote bundle unavailable: ${
            cause instanceof Error ? cause.message : String(cause)
          }`,
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
