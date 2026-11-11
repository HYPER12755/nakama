import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "../src/lib/clipboard";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("clipboard fallback", () => {
  it("uses the Clipboard API when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await expect(copyText("match-id")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("match-id");
  });

  it("falls back to a temporary textarea and execCommand", async () => {
    const textarea = {
      value: "",
      style: {},
      setAttribute: vi.fn(),
      focus: vi.fn(),
      select: vi.fn(),
      remove: vi.fn(),
    };
    const execCommand = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("blocked")) },
    });
    vi.stubGlobal("document", {
      createElement: vi.fn().mockReturnValue(textarea),
      body: { appendChild: vi.fn() },
      execCommand,
    });

    await expect(copyText("invite-link")).resolves.toBe(true);
    expect(textarea.value).toBe("invite-link");
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(textarea.remove).toHaveBeenCalled();
  });

  it("returns false when both paths are unavailable", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("blocked")) },
    });
    vi.stubGlobal("document", undefined);

    await expect(copyText("nope")).resolves.toBe(false);
  });
});
