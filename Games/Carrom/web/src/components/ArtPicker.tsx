import { useEffect, useMemo, useRef, useState } from "react";
import {
  COSMETIC_GROUPS,
  cosmeticLabel,
  defaultChoice,
} from "../lib/cosmetics";
import type { ArtGroupId } from "../lib/designs";
import type { Theme } from "../lib/theme";
import { ArtImage } from "./ArtImage";
import { DesignPreview } from "./DesignPreview";
import { Icon } from "./Icon";

export interface ArtPickerProps {
  choices: Partial<Record<ArtGroupId, string>>;
  onChoose: (group: ArtGroupId, id: string) => void;
  onReset: (group: ArtGroupId) => void;
  theme: Theme;
  visuals: ReturnType<typeof import("../lib/designs").tableVisuals>;
}

/** A thumbnail from real artwork or the colours of a built-in design. */
function OptionPreview({
  image,
  colors,
}: {
  image?: string;
  colors?: [string, string];
}) {
  if (image !== undefined) {
    return <ArtImage src={image} alt="" />;
  }
  return (
    <span
      className="design-chip"
      style={{
        background: `radial-gradient(circle at 35% 35%, ${colors?.[0] ?? "#eee"}, ${colors?.[1] ?? "#333"})`,
      }}
    />
  );
}

/**
 * The one cosmetic panel: a live board at the top, and each category opens
 * right under its own row. Scrolling inside a category is locked to that
 * category, so the player cannot slide into a different set by accident.
 */
export function ArtPicker({
  choices,
  onChoose,
  onReset,
  theme,
  visuals,
}: ArtPickerProps) {
  const [open, setOpen] = useState<ArtGroupId | null>(null);
  const [filter, setFilter] = useState("");
  const gridRef = useRef<HTMLDivElement>(null);
  const group = useMemo(
    () => COSMETIC_GROUPS.find((entry) => entry.id === open) ?? null,
    [open],
  );

  const options = useMemo(() => {
    if (group === null) {
      return [];
    }
    const query = filter.trim().toLowerCase();
    return query.length === 0
      ? group.options
      : group.options.filter((option) =>
          option.label.toLowerCase().includes(query),
        );
  }, [group, filter]);

  // A category can hold almost a thousand images. Rendering them all at once
  // stalls the browser, so only a page is shown at a time with a "Show more"
  // button. Every asset stays reachable and none is dropped.
  const [visible, setVisible] = useState(60);
  useEffect(() => setVisible(60), [open, filter]);

  const total = COSMETIC_GROUPS.reduce((sum, g) => sum + g.options.length, 0);

  // The board resolves built-ins from preferences when no art choice exists;
  // the picker has to show the same effective design, not a hardcoded default.
  const effective = (id: ArtGroupId): string => {
    const picked = choices[id];
    if (picked !== undefined) {
      return picked;
    }
    if (id === "boards") {
      return `builtin:${visuals.board.id}`;
    }
    if (id === "strikers") {
      return `builtin:${visuals.striker.id}`;
    }
    if (id === "pucks") {
      return `builtin:${visuals.pieces.id}`;
    }
    return defaultChoice(id);
  };

  // React attaches wheel passively, so preventDefault there is ignored. A
  // native non-passive listener actually keeps the page from moving once the
  // open category's grid reaches either end.
  useEffect(() => {
    const grid = gridRef.current;
    if (grid === null) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      const atTop = grid.scrollTop <= 0;
      const atBottom =
        grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 1;
      if ((atTop && event.deltaY < 0) || (atBottom && event.deltaY > 0)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    grid.addEventListener("wheel", onWheel, { passive: false });
    return () => grid.removeEventListener("wheel", onWheel);
  }, [open]);

  return (
    <section className="panel pref-panel art-picker">
      <header className="pref-panel__head">
        <h3>Table cosmetics</h3>
        <span className="setting__note">{total} designs</span>
      </header>

      <p className="art-hint">
        Pick a design. The board under the open category changes as you choose.
      </p>

      <div className="pref-rows">
        {COSMETIC_GROUPS.map((entry) => {
          const choice = effective(entry.id);
          const expanded = open === entry.id;
          const chosen = entry.options.find((option) => option.id === choice);
          return (
            <div className="art-group" key={entry.id}>
              <button
                type="button"
                className="pref-row"
                onClick={() => {
                  setOpen(expanded ? null : entry.id);
                  setFilter("");
                }}
                aria-expanded={expanded}
              >
                <span className="pref-row__preview pref-row__preview--board">
                  {chosen ? (
                    <OptionPreview image={chosen.image} colors={chosen.colors} />
                  ) : null}
                </span>
                <span className="pref-row__label">{entry.label}</span>
                <span className="pref-row__value">{cosmeticLabel(choice)}</span>
                <Icon name="chevron-right" size={16} />
              </button>

              {expanded ? (
                <div className="art-grid-wrap">
                  <DesignPreview visuals={visuals} theme={theme} />
                  <label className="art-search">
                    <span>Filter</span>
                    <input
                      type="text"
                      value={filter}
                      placeholder="Search the designs"
                      onChange={(event) => setFilter(event.target.value)}
                    />
                  </label>
                  <div className="art-grid" ref={gridRef}>
                    {options.slice(0, visible).map((option) => {
                      const active = choice === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={`art-tile${active ? " art-tile--active" : ""}`}
                          onClick={() => onChoose(entry.id, option.id)}
                          title={option.label}
                        >
                          <OptionPreview
                            image={option.image}
                            colors={option.colors}
                          />
                          <span>{option.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="art-grid__foot">
                    <p className="setting__note">
                      Showing {Math.min(visible, options.length)} of {options.length}
                    </p>
                    {visible < options.length ? (
                      <button
                        type="button"
                        className="mini-button"
                        onClick={() => setVisible((value) => value + 60)}
                      >
                        Show more
                      </button>
                    ) : null}
                    {choices[entry.id] !== undefined ? (
                      <button
                        type="button"
                        className="mini-button"
                        onClick={() => onReset(entry.id)}
                      >
                        Reset
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
