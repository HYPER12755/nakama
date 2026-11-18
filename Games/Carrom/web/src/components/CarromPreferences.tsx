import { GamePreferencesPanel, useGamePreferences } from "@moongames/game-ui";
import { playEvent } from "../lib/audio";
import { tableVisuals } from "../lib/designs";
import { CARROM_FEATURES } from "../lib/preferences";
import type { Theme } from "../lib/theme";
import { ArtPicker } from "./ArtPicker";
import { useArtChoices } from "../hooks/useArtChoices";

export interface CarromPreferencesProps {
  gameId: string;
  theme: Theme;
}

/** The carrom table's looks and sounds, in one panel. */
export function CarromPreferences({ gameId, theme }: CarromPreferencesProps) {
  const { preferences } = useGamePreferences(gameId);
  const { choices, choose, reset } = useArtChoices();

  const visuals = tableVisuals(
    preferences.boardTheme,
    preferences.strikerDesign ?? "brass",
    preferences.pieceSet,
    choices,
  );

  return (
    <>
      <ArtPicker
        choices={choices}
        onChoose={choose}
        onReset={reset}
        theme={theme}
        visuals={visuals}
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
