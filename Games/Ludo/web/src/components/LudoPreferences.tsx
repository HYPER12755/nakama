import { GamePreferencesPanel } from "@moongames/game-ui";
import { BOARD_THEMES, LUDO_FEATURES, SOUND_SETS, TOKEN_SETS } from "../lib/preferences";
import { playEvent } from "../lib/sound";

/** The Ludo look-and-sound panel, built on the shared preferences kit. */
export function LudoPreferences({ gameId }: { gameId: string }) {
  return (
    <GamePreferencesPanel
      gameId={gameId}
      title="Look and sound"
      pieceSets={TOKEN_SETS.map((set) => ({
        id: set.id,
        label: set.label,
        preview: <img src={`tokens/${set.id}-red.svg`} alt="" width={22} height={22} />,
        previewDark: <img src={`tokens/${set.id}-blue.svg`} alt="" width={22} height={22} />,
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
