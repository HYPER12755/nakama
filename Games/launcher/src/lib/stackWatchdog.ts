/**
 * Ask the local watchdog to bring the stack back after the device slept.
 *
 * This is a no-op unless the launcher is served from this device over http.
 * A remote or file:// launcher must never be able to restart the local stack.
 */

const WATCHDOG_PATH = "/api/stack/heal";
let lastRequest = 0;
const COOLDOWN_MS = 10000;

export function canHealStack(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const url = new URL(window.location.href);
  return (
    url.protocol === "http:" &&
    (url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]")
  );
}

export async function requestStackHeal(): Promise<boolean> {
  if (!canHealStack()) {
    return false;
  }
  const now = Date.now();
  if (now - lastRequest < COOLDOWN_MS) {
    return false;
  }
  lastRequest = now;
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 4000);
    const response = await fetch(WATCHDOG_PATH, {
      method: "POST",
      signal: controller.signal,
    });
    window.clearTimeout(timer);
    return response.ok;
  } catch {
    return false;
  }
}
