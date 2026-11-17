import { useEffect } from "react";
import {
  PLAYER_LABEL,
  type CarromPlayer,
  type GameVariant,
} from "@moongames/carrom-core";
import { Icon } from "./Icon";

interface RulesDialogProps {
  open: boolean;
  onClose: () => void;
  /** The rules the table is playing, so the guide describes them. */
  variant?: GameVariant;
  /** The colours at the table; a two player table has two. */
  colours?: CarromPlayer[];
}

export function RulesDialog({
  open,
  onClose,
  variant = "classic",
  colours = ["white", "black"],
}: RulesDialogProps) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <section
        className="dialog rules-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rules-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dialog__header">
          <div>
            <p className="eyebrow">Table guide</p>
            <h2 id="rules-title">How to play Carrom</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close rules"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="rules-grid">
          <article className="rule">
            <span className="rule__number">01</span>
            <div>
              <h3>Place, pull, flick</h3>
              <p>
                Slide the striker along your baseline between the two lines.
                Pull back from your target and release: the striker launches
                away from the pull, with more pull meaning more power.
              </p>
            </div>
          </article>
          <article className="rule">
            <span className="rule__number">02</span>
            <div>
              <h3>Pocket your colour</h3>
              <p>
                {colours.map((colour, index) => (
                  <span key={colour}>
                    {index > 0 ? " " : ""}
                    {PLAYER_LABEL[colour]} pockets {PLAYER_LABEL[colour].toLowerCase()}.
                  </span>
                ))}{" "}
                A pocket of your own colour keeps you at the table for another
                shot.
              </p>
            </div>
          </article>
          <article className="rule">
            <span className="rule__number">03</span>
            <div>
              <h3>{variant === "classic" ? "Cover the queen" : "The queen"}</h3>
              <p>
                {variant === "classic"
                  ? "Pocket the red queen, then pocket one of your own pieces on the same or next shot to cover it. If you miss, the queen returns to the centre."
                  : "The queen is an ordinary piece here. Pocket it like any other man; there is no cover to make."}
              </p>
            </div>
          </article>
          <article className="rule">
            <span className="rule__number">04</span>
            <div>
              <h3>Fouls and finishing</h3>
              <p>
                {variant === "practice"
                  ? "Practice tables call no fouls. Clear your pieces to finish the board."
                  : "A striker in a pocket returns one of your pieces. Pocketing an opponent's piece ends your turn. Clear all nine of your colour to win"}
                {variant === "classic" ? ", with the queen covered." : "."}
              </p>
            </div>
          </article>
          <article className="rule">
            <span className="rule__number">05</span>
            <div>
              <h3>How the points are counted</h3>
              <p>
                {variant === "practice"
                  ? "Practice tables keep no score. The pocket box shows how many of each colour have gone in."
                  : "Every man you pocket is worth one point and the queen is worth three. The points bar above the board always shows the count."}
              </p>
            </div>
          </article>
          <article className="rule">
            <span className="rule__number">06</span>
            <div>
              <h3>Table, striker and clock</h3>
              <p>
                Two, three or four players can share a table; on one device the
                board turns to the player whose shot it is. The striker you
                bring changes how hard it leaves the baseline. A shot clock,
                when set, hands the turn on when a player runs out of time.
              </p>
            </div>
          </article>
        </div>

        <div className="rules-tip">
          <Icon name="sparkles" size={17} />
          <p>
            The aim guide shows the first contact. Try bank shots off the frame
            when the direct line is blocked.
          </p>
        </div>

        <button type="button" className="button button--primary" onClick={onClose}>
          Back to the table
        </button>
      </section>
    </div>
  );
}
