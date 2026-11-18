import { useState } from "react";
import {
  GamePreferencesPanel,
  useGamePreferences,
} from "@moongames/game-ui";
import { playEvent } from "../lib/audio";
import { tableVisuals, type ArtGroupId } from "../lib/designs";
import { CARROM_FEATURES } from "../lib/preferences";
import type { Theme } from "../lib/theme";
import { DesignPreview } from "./DesignPreview";
import { ArtPicker } from "./ArtPicker";
import { useArtChoices } from "../hooks/useArtChoices";

export interface CarromPreferencesProps {
  gameId: string;
  theme: Theme;
}

/** The carrom table's looks and sounds, in one panel. */
export function CarromPreferences({ gameId, theme }: CarromPreferencesProps) {
  const { preferences } = useGamePreferences(gameId);
  const [previewOpen, setPreviewOpen] = useState(false);
  const { choices, choose, reset } = useArtChoices();

  const visuals = tableVisuals(
    preferences.boardTheme,
    preferences.strikerDesign ?? "brass",
    preferences.pieceSet,
    choices,
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
      </section>

      <ArtPicker
        choices={choices}
        onChoose={(group: ArtGroupId, id: string) => choose(group, id)}
        onReset={(group: ArtGroupId) => reset(group)}
      />

      <GamePreferencesPanel
        gameId={gameId}
        features={CARROM_FEATURES}
        onPreviewSound={() => {
          playEvent("strike");
          window.setTimeout(() => playEvent("puck"), 200);
          window.setTimeout(() => playEvent("pot"), 420);
          window.setTimeout(() => playEvent("queenCover"), 700);
        }}
      />
    </>
  );
}
