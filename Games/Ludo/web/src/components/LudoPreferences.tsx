import { GamePreferencesPanel } from "@moongames/game-ui";
import {
  BOARD_THEMES,
  DICE_SETS,
  LUDO_FEATURES,
  SOUND_SETS,
  TOKEN_SETS,
} from "../lib/preferences";
import { playEvent } from "../lib/sound";
import type { LudoColor } from "@moongames/ludo-core";

const COLOURS: LudoColor[] = ["red", "green", "yellow", "blue"];

function tokenPreview(setId: string, kind: string | undefined, color: LudoColor) {
  if (kind === "copied") {
    const index = COLOURS.indexOf(color);
    return <img src={`tokens-copied/${setId}/token-${index + 1}.png`} alt="" width={22} height={22} />;
  }
  return <img src={`tokens/${setId}-${color}.svg`} alt="" width={22} height={22} />;
}

/** The Ludo look-and-sound panel, built on the shared preferences kit. */
export function LudoPreferences({ gameId }: { gameId: string }) {
  return (
    <GamePreferencesPanel
      gameId={gameId}
      title="Look and sound"
      pieceSets={TOKEN_SETS.map((set) => ({
        id: set.id,
        label: set.label,
        preview: tokenPreview(set.id, set.kind, "red"),
        previewDark: tokenPreview(set.id, set.kind, "blue"),
      }))}
      diceSets={DICE_SETS.map((set) => ({
        id: set.id,
        label: set.label,
        preview: set.texture
          ? <img src={set.texture} alt="" width={22} height={22} />
          : <span className="dice-preview-classic">⚄</span>,
      }))}
      themes={BOARD_THEMES}
      soundSets={SOUND_SETS}
      features={LUDO_FEATURES}
      onPreviewSound={() => {
        playEvent("roll");
        window.setTimeout(() => playEvent("move"), 340);
        window.setTimeout(() => playEvent("capture"), 620);
        window.setTimeout(() => playEvent("home"), 900);
      }}
    />
  );
}
