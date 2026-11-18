// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CarromBoard } from "../src/components/CarromBoard";
import { createInitialState } from "@moongames/carrom-core";

describe("aim cancel controls", () => {
  it("the board renders a canvas inside a wrapper for the pointer gestures", () => {
    const html = renderToStaticMarkup(
      <CarromBoard
        state={createInitialState()}
        strikerPosition={0.5}
        animation={null}
        disabled={false}
        theme="dark"
        aimMode="pull"
        view="white"
        onShoot={() => undefined}
        onAnimationComplete={() => undefined}
      />,
    );
    expect(html).toContain("carrom-board-wrap");
    expect(html).toContain("carrom-canvas");
    // The button lives in App's controls, never on top of the board.
    expect(html).not.toContain("aim-cancel");
  });
});
