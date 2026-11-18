import { useMemo, useState } from "react";
import {
  COSMETIC_GROUPS,
  cosmeticLabel,
  defaultChoice,
} from "../lib/cosmetics";
import type { ArtGroupId } from "../lib/designs";
import { Icon } from "./Icon";
import { ArtImage } from "./ArtImage";

export interface ArtPickerProps {
  choices: Partial<Record<ArtGroupId, string>>;
  onChoose: (group: ArtGroupId, id: string) => void;
  onReset: (group: ArtGroupId) => void;
}

/** A thumbnail, from real artwork or from the colours of a built-in design. */
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
 * The one cosmetic panel: hand-made designs and ripped game artwork together,
 * grouped once. Nothing is hidden and nothing is skipped.
 */
export function ArtPicker({ choices, onChoose, onReset }: ArtPickerProps) {
  const [open, setOpen] = useState<ArtGroupId | null>(null);
  const [filter, setFilter] = useState("");
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

  const total = COSMETIC_GROUPS.reduce((sum, g) => sum + g.options.length, 0);

  return (
    <section className="panel pref-panel art-picker">
      <header className="pref-panel__head">
        <h3>Table cosmetics</h3>
        <span className="setting__note">{total} designs</span>
      </header>

      <div className="pref-rows">
        {COSMETIC_GROUPS.map((entry) => {
          const choice = choices[entry.id] ?? defaultChoice(entry.id);
          return (
            <button
              key={entry.id}
              type="button"
              className="pref-row"
              onClick={() => {
                setOpen((current) => (current === entry.id ? null : entry.id));
                setFilter("");
              }}
              aria-expanded={open === entry.id}
            >
              <span className="pref-row__preview pref-row__preview--board">
                {(() => {
                  const chosen = entry.options.find((o) => o.id === choice);
                  return chosen ? (
                    <OptionPreview image={chosen.image} colors={chosen.colors} />
                  ) : null;
                })()}
              </span>
              <span className="pref-row__label">{entry.label}</span>
              <span className="pref-row__value">{cosmeticLabel(choice)}</span>
              <Icon name="chevron-right" size={16} />
            </button>
          );
        })}
      </div>

      {group !== null ? (
        <div className="art-grid-wrap">
          <label className="art-search">
            <span>Filter</span>
            <input
              type="text"
              value={filter}
              placeholder="Search the designs"
              onChange={(event) => setFilter(event.target.value)}
            />
          </label>
          <div className="art-grid">
            {options.map((option) => {
              const active =
                (choices[group.id] ?? defaultChoice(group.id)) === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`art-tile${active ? " art-tile--active" : ""}`}
                  onClick={() => onChoose(group.id, option.id)}
                  title={option.label}
                >
                  <OptionPreview image={option.image} colors={option.colors} />
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
          <div className="art-grid__foot">
            <p className="setting__note">
              Showing {options.length} of {group.options.length}
            </p>
            {choices[group.id] !== undefined ? (
              <button
                type="button"
                className="mini-button"
                onClick={() => onReset(group.id)}
              >
                Reset
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
