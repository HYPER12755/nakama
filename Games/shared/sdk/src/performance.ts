export type MoonGamesPerformanceMode = "full" | "lite";

interface NavigatorWithHints {
  readonly deviceMemory?: number;
  readonly hardwareConcurrency?: number;
  readonly connection?: {
    readonly saveData?: boolean;
  };
}

/**
 * Chooses the full visual treatment on capable devices and an automatically
 * lighter paint path on memory-constrained phones. `?perf=lite` and
 * `?perf=full` are escape hatches for comparing both modes on the same device.
 */
export function detectPerformanceMode(search = ""): MoonGamesPerformanceMode {
  const params = new URLSearchParams(search);
  const forced = params.get("perf");
  if (forced === "lite" || forced === "full") {
    return forced;
  }
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return "full";
  }

  const nav = navigator as unknown as NavigatorWithHints;
  if (nav.connection?.saveData === true) {
    return "lite";
  }
  if (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return "lite";
  }

  // Touch devices are the ones that pay the blur/compositing cost most often.
  // They get the lighter paint path by default; ?perf=full still opts out.
  if (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  ) {
    return "lite";
  }

  const memory = nav.deviceMemory;
  if (typeof memory === "number" && memory <= 4) {
    return "lite";
  }

  return "full";
}

export function applyPerformanceMode(
  search = typeof window === "undefined" ? "" : window.location.search,
): MoonGamesPerformanceMode {
  const mode = detectPerformanceMode(search);
  if (typeof document !== "undefined") {
    document.documentElement.dataset.moonperf = mode;
  }
  return mode;
}
