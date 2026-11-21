import {
  GamePreferencesPanel,
  type PreferenceFeatures,
} from "@moongames/game-ui";

const FEATURES: PreferenceFeatures = {
  showLegalMoves: true,
};

const HIGHLIGHTS = [
  { id: "lift", label: "Lift", light: "#ffffff", dark: "#e8402a" },
  { id: "outline", label: "Outline", light: "#94a3b8", dark: "#64748b" },
  { id: "glow", label: "Soft glow", light: "#fde68a", dark: "#f2c600" },
];

export function UnoPreferences({ gameId }: { gameId: string }) {
  return (
    <GamePreferencesPanel
      gameId={gameId}
      title="Table customization"
      labels={{
        pieceSets: "Card art",
        themes: "Highlight",
        soundSets: "My pile",
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
      soundSets={[
        { id: "stack", label: "Stack" },
        { id: "fan", label: "Fan" },
        { id: "tower", label: "Tower" },
      ]}
      features={FEATURES}
    />
  );
}
