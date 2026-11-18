/**
 * A loader for the assets a game ships beside its entry file.
 *
 * On the web the page has an http origin and fetch() is enough. On a native
 * host the entry is opened from a file:// URL, where fetch() cannot read the
 * files beside it. There the loader asks the host, which reads from the
 * verified bundle directory and returns the bytes. A path can never escape
 * that directory: the host checks it too.
 */

import type { GameBridge } from "./bridge";
import { isHostToGameMessage } from "./protocol";

export interface AssetOptions {
  /** Return text instead of bytes. */
  text?: boolean;
  /** How long to wait for the host, in milliseconds. */
  timeoutMs?: number;
}

const bytes = new Map<string, Promise<ArrayBuffer | string>>();
const objectUrls = new Map<string, string>();
let bridge: GameBridge | null = null;
let defaultTimeout = 8000;
const pending = new Map<
  string,
  {
    resolve: (value: ArrayBuffer | null) => void;
    timer: number;
  }
>();

/** Give the loader the bridge of the host, when the game is hosted. */
export function configureAssets(
  host: GameBridge,
  options: { timeoutMs?: number } = {},
): void {
  bridge = host;
  if (options.timeoutMs !== undefined) {
    defaultTimeout = options.timeoutMs;
  }
  host.onMessage((message) => {
    if (
      !isHostToGameMessage(message) ||
      message.type !== "assetResponse"
    ) {
      return;
    }
    const waiting = pending.get(message.requestId);
    if (waiting === undefined) {
      return;
    }
    pending.delete(message.requestId);
    window.clearTimeout(waiting.timer);
    if (!message.ok || typeof message.base64 !== "string") {
      waiting.resolve(null);
      return;
    }
    try {
      const binary = atob(message.base64);
      const data = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        data[index] = binary.charCodeAt(index);
      }
      waiting.resolve(data.buffer);
    } catch {
      waiting.resolve(null);
    }
  });
}

/** Only a safe, bundle-relative path can be asked for. */
export function safeAssetPath(input: string): string | null {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.includes("\0") ||
    input.includes("\\") ||
    input.startsWith("/") ||
    /^[a-z]+:/i.test(input)
  ) {
    return null;
  }
  const parts = input.split("/");
  if (parts.some((part) => part === ".." || part === "." || part === "")) {
    return null;
  }
  return parts.join("/");
}

function fromHost(path: string, timeoutMs: number): Promise<ArrayBuffer | null> {
  const host = bridge;
  if (host === null) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const requestId = `asset-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const timer = window.setTimeout(() => {
      pending.delete(requestId);
      resolve(null);
    }, timeoutMs);
    pending.set(requestId, { resolve, timer });
    host.send({ type: "assetRequest", requestId, path });
  });
}

/** Load a file shipped beside the game's entry file. */
export function loadAsset(
  path: string,
  options: AssetOptions = {},
): Promise<ArrayBuffer | string> {
  const safe = safeAssetPath(path);
  if (safe === null) {
    return Promise.reject(new Error("unsafe asset path"));
  }
  const cached = bytes.get(safe);
  if (cached !== undefined) {
    return cached;
  }
  const timeoutMs = options.timeoutMs ?? defaultTimeout;
  const promise = (async (): Promise<ArrayBuffer | string> => {
    const url = new URL(safe, document.baseURI).toString();
    if (url.startsWith("http:") || url.startsWith("https:")) {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`asset not found: ${safe}`);
      }
      return options.text === true
        ? await response.text()
        : await response.arrayBuffer();
    }
    const data = await fromHost(safe, timeoutMs);
    if (data === null) {
      throw new Error(`asset not available: ${safe}`);
    }
    return data;
  })();
  bytes.set(safe, promise);
  promise.catch(() => {
    bytes.delete(safe);
  });
  return promise;
}

/**
 * A URL an <img> or CSS rule can use. The object URL is kept for the page's
 * life, so images do not go blank after the bytes are loaded.
 */
export async function assetUrl(path: string): Promise<string> {
  const existing = objectUrls.get(path);
  if (existing !== undefined) {
    return existing;
  }
  const data = await loadAsset(path);
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: "text/plain" })
      : new Blob([data]);
  const url = URL.createObjectURL(blob);
  objectUrls.set(path, url);
  return url;
}
