import {
  GamePreferencesPanel,
  type PreferenceFeatures,
} from "@moongames/game-ui";
import { previewSound, UNO_SOUND_SETS } from "../lib/audio";

const FEATURES: PreferenceFeatures = {
  showLegalMoves: true,
};

const HIGHLIGHTS = [
  { id: "lift", label: "Lift", light: "#ffffff", dark: "#e8402a" },
  { id: "outline", label: "Outline", light: "#94a3b8", dark: "#64748b" },
  { id: "glow", label: "Soft glow", light: "#fde68a", dark: "#f2c600" },
];

const PILES = [
  { id: "stack", label: "Stack", light: "#f8fafc", dark: "#111827" },
  { id: "fan", label: "Fan", light: "#e2e8f0", dark: "#1f2937" },
  { id: "tower", label: "Tower", light: "#cbd5e1", dark: "#374151" },
];

export function UnoPreferences({ gameId }: { gameId: string }) {
  return (
    <GamePreferencesPanel
      gameId={gameId}
      title="Table customization"
      labels={{
        pieceSets: "Card art",
        themes: "Highlight",
        diceSets: "My pile",
        soundSets: "Sound set",
      }}
      pieceSets={[
        {
          id: "classic",
          label: "Classic",
          preview: <img src="cards/red-5-0.svg" alt="" width={22} />,
          previewDark: <img src="cards/blue-2-0.svg" alt="" width={22} />,
        },
        {
          id: "neon",
          label: "Neon",
          preview: <img src="cards-neon/red-5-0.svg" alt="" width={22} />,
          previewDark: <img src="cards-neon/blue-2-0.svg" alt="" width={22} />,
        },
      ]}
      themes={HIGHLIGHTS}
      diceSets={PILES}
      soundSets={UNO_SOUND_SETS.map((set) => ({ id: set.id, label: set.label }))}
      onPreviewSound={() => previewSound()}
      features={FEATURES}
    />
  );
}
