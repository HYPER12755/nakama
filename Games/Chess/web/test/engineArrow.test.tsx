import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EngineArrow } from "../src/components/EngineArrow";

/**
 * The arrow that shows the move the engine likes.
 */

describe("the arrow of the engine", () => {
  it("points from the square the piece stands on to the square it goes to", () => {
    const markup = renderToStaticMarkup(
      <EngineArrow from="e2" to="e4" />,
    );

    // The centre of e2 is at 56.25 across (the fifth file) and 81.25 up.
    expect(markup).toContain('x1="56.25"');
    expect(markup).toContain('y1="81.25"');
    // The centre of e4 is at 56.25 across and 56.25 up.
    expect(markup).toContain('x2="56.25"');
    expect(markup).toContain('y2="59.35"');
  });

  it("is turned about when the board is", () => {
    const markup = renderToStaticMarkup(
      <EngineArrow from="e2" to="e4" flipped />,
    );

    // The board is turned, so the e file is on the other side and the
    // second rank is near the top.
    expect(markup).toContain('x1="43.75"');
    expect(markup).toContain('y1="18.75"');
  });

  it("has a head at the square it points at", () => {
    const markup = renderToStaticMarkup(<EngineArrow from="e2" to="e4" />);

    expect(markup).toContain("<polygon");
    expect(markup).toContain("56.25,56.25");
  });
});
