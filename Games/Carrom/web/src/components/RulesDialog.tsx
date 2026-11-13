import { useEffect } from "react";
import { Icon } from "./Icon";

interface RulesDialogProps {
  open: boolean;
  onClose: () => void;
}

export function RulesDialog({ open, onClose }: RulesDialogProps) {
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
              <h3>Place, aim, flick</h3>
              <p>
                Move the striker along your baseline, then drag across the board
                toward your target. The distance of the drag sets the power.
              </p>
            </div>
          </article>
          <article className="rule">
            <span className="rule__number">02</span>
            <div>
              <h3>Pocket your colour</h3>
              <p>
                Ivory pockets ivory. Onyx pockets onyx. A pocket of your own
                colour keeps you at the table for another shot.
              </p>
            </div>
          </article>
          <article className="rule">
            <span className="rule__number">03</span>
            <div>
              <h3>Cover the queen</h3>
              <p>
                Pocket the red queen, then pocket one of your own pieces on the
                same or next shot to cover it. If you miss, the queen returns to
                the centre.
              </p>
            </div>
          </article>
          <article className="rule">
            <span className="rule__number">04</span>
            <div>
              <h3>Fouls and finishing</h3>
              <p>
                A striker in a pocket returns one of your pieces. Pocketing an
                opponent&apos;s piece ends your turn. Clear all nine of your
                colour after the queen is covered to win.
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
