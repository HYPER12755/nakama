import { useState } from "react";
import {
  GamePreferencesPanel,
  useGamePreferences,
  type PieceChoice,
  type SoundChoice,
  type ThemeChoice,
} from "@moongames/game-ui";
import { playSound } from "../lib/audio";
import {
  BOARD_DESIGNS,
  PIECE_SETS,
  STRIKER_DESIGNS,
  tableVisuals,
} from "../lib/designs";
import { CARROM_FEATURES, SOUND_SETS } from "../lib/preferences";
import type { Theme } from "../lib/theme";
import { DesignPreview } from "./DesignPreview";
import { ArtPicker } from "./ArtPicker";
import { readArtChoices, writeArtChoices } from "../lib/storage";
import { useState as useReactState } from "react";
import { Icon } from "./Icon";

export interface CarromPreferencesProps {
  gameId: string;
  theme: Theme;
}

const themeChoices: ThemeChoice[] = BOARD_DESIGNS.map((design) => ({
  id: design.id,
  label: design.label,
  light: design.surface[0],
  dark: design.frame[0],
  texture:
    design.texture === undefined
      ? undefined
      : new URL(`../public/${design.texture}`, import.meta.url).toString(),
}));

const pieceChoices: PieceChoice[] = PIECE_SETS.map((set) => ({
  id: set.id,
  label: set.label,
  preview: (
    <span
      className="design-chip"
      style={{
        background: `radial-gradient(circle at 35% 35%, ${set.pieces[0].top}, ${set.pieces[0].low})`,
      }}
    />
  ),
  previewDark: (
    <span
      className="design-chip"
      style={{
        background: `radial-gradient(circle at 35% 35%, ${set.pieces[1].top}, ${set.pieces[1].low})`,
      }}
    />
  ),
}));

const soundChoices: SoundChoice[] = SOUND_SETS.map((set) => ({
  id: set.id,
  label: set.label,
}));

/** The carrom table's looks and sounds, with a live preview above the panel. */
export function CarromPreferences({ gameId, theme }: CarromPreferencesProps) {
  const { preferences, setPreference } = useGamePreferences(gameId);
  const [strikerOpen, setStrikerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [artChoices, setArtChoices] = useReactState(readArtChoices);

  const visuals = tableVisuals(
    preferences.boardTheme,
    preferences.strikerDesign ?? "brass",
    preferences.pieceSet,
  );

  return (
    <>
      <section className="panel pref-panel">
        <header className="pref-panel__head">
          <h3>Look and sound</h3>
          <button
            type="button"
            className="mini-button"
            onClick={() => setPreviewOpen((value) => !value)}
            aria-expanded={previewOpen}
          >
            {previewOpen ? "Hide table" : "Show table"}
          </button>
        </header>
        {previewOpen ? <DesignPreview visuals={visuals} theme={theme} /> : null}
        <button
          type="button"
          className="pref-row"
          onClick={() => setStrikerOpen((value) => !value)}
          aria-expanded={strikerOpen}
        >
          <span
            className="pref-row__preview pref-row__preview--pieces"
            style={{
              background: `radial-gradient(circle at 35% 35%, ${visuals.striker.palette.top}, ${visuals.striker.palette.low})`,
            }}
          />
          <span className="pref-row__label">Striker</span>
          <span className="pref-row__value">{visuals.striker.label}</span>
          <Icon name="chevron-right" size={16} />
        </button>
        {strikerOpen ? (
          <div className="pref-choices">
            {STRIKER_DESIGNS.map((design) => (
              <button
                key={design.id}
                type="button"
                className={`pref-choice${
                  visuals.striker.id === design.id ? " pref-choice--active" : ""
                }`}
                onClick={() => setPreference("strikerDesign", design.id)}
              >
                <span
                  className="design-chip"
                  style={{
                    background: `radial-gradient(circle at 35% 35%, ${design.palette.top}, ${design.palette.low})`,
                  }}
                />
                <span>{design.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <ArtPicker
        choices={artChoices}
        onChoose={(group, file) => {
          const next = { ...artChoices, [group]: file };
          setArtChoices(next);
          writeArtChoices(next);
        }}
      />

      <GamePreferencesPanel
        gameId={gameId}
        pieceSets={pieceChoices}
        themes={themeChoices}
        soundSets={soundChoices}
        features={CARROM_FEATURES}
        onPreviewSound={() => {
          // A short run of the sounds a player actually hears, so a set can
          // be judged by ear before it is chosen.
          playSound("strike");
          window.setTimeout(() => playSound("pocket"), 260);
          window.setTimeout(() => playSound("queen"), 620);
        }}
      />
    </>
  );
}
