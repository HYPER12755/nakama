import { useMemo, useState } from "react";
import { ART_GROUPS } from "../lib/artCatalog.generated";
import { Icon } from "./Icon";

export interface ArtPickerProps {
  /** The asset path currently chosen for each group. */
  choices: Record<string, string>;
  /** Called when a player picks an asset. */
  onChoose: (group: string, file: string) => void;
}

/**
 * A picker for every real asset extracted from the carrom games. Each group
 * opens a grid of thumbnails; nothing is hidden and nothing is skipped.
 */
export function ArtPicker({ choices, onChoose }: ArtPickerProps) {
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const group = useMemo(
    () => ART_GROUPS.find((entry) => entry.id === open) ?? null,
    [open],
  );

  const files = useMemo(() => {
    if (group === null) {
      return [];
    }
    const query = filter.trim().toLowerCase();
    return query.length === 0
      ? group.files
      : group.files.filter((file) => file.toLowerCase().includes(query));
  }, [group, filter]);

  return (
    <section className="panel pref-panel art-picker">
      <header className="pref-panel__head">
        <h3>Game artwork</h3>
        <span className="setting__note">
          {ART_GROUPS.reduce((sum, entry) => sum + entry.files.length, 0)} real assets
        </span>
      </header>

      <div className="pref-rows">
        {ART_GROUPS.map((entry) => (
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
              {choices[entry.id] !== undefined ? (
                <img src={choices[entry.id]} alt="" />
              ) : null}
            </span>
            <span className="pref-row__label">{entry.label}</span>
            <span className="pref-row__value">
              {choices[entry.id]?.split("/").pop()?.replace(/\.(png|webp)$/, "") ?? "Default"}
            </span>
            <Icon name="chevron-right" size={16} />
          </button>
        ))}
      </div>

      {group !== null ? (
        <div className="art-grid-wrap">
          <label className="art-search">
            <span>Filter</span>
            <input
              type="text"
              value={filter}
              placeholder="Search the artwork"
              onChange={(event) => setFilter(event.target.value)}
            />
          </label>
          <div className="art-grid">
            {files.map((file) => {
              const name = file.split("/").pop() ?? file;
              return (
                <button
                  key={file}
                  type="button"
                  className={`art-tile${choices[group.id] === file ? " art-tile--active" : ""}`}
                  onClick={() => onChoose(group.id, file)}
                  title={name}
                >
                  <img src={file} alt={name} loading="lazy" />
                  <span>{name.replace(/\.(png|webp)$/, "")}</span>
                </button>
              );
            })}
          </div>
          <p className="setting__note">Showing {files.length} of {group.files.length}</p>
        </div>
      ) : null}
    </section>
  );
}
