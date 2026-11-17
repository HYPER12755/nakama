import { useMemo } from "react";
import { createInitialState } from "@moongames/carrom-core";
import { CarromBoard } from "./CarromBoard";
import type { Theme } from "../lib/theme";
import type { TableVisuals } from "../lib/designs";

export interface DesignPreviewProps {
  visuals: TableVisuals;
  theme: Theme;
}

/**
 * A small table at the top of the preferences panel. It is the real board,
 * drawn with the chosen designs, so what the player sees is what they get.
 */
export function DesignPreview({ visuals, theme }: DesignPreviewProps) {
  const state = useMemo(() => {
    const base = createInitialState(["white", "black", "green", "yellow"], {
      teams: true,
    });
    // Show a few men pocketed so the piece colours are easy to see.
    const discs = base.discs.map((disc, index) =>
      index % 4 === 0 ? { ...disc, pocketed: true } : disc,
    );
    return { ...base, discs };
  }, []);

  return (
    <div className="design-preview">
      <CarromBoard
        state={state}
        strikerPosition={0.5}
        animation={null}
        disabled
        theme={theme}
        aimMode="pull"
        view="white"
        onShoot={() => undefined}
        onAnimationComplete={() => undefined}
        visuals={visuals}
      />
      <p className="setting__note">
        {visuals.board.label} · {visuals.striker.label} striker · {visuals.pieces.label} pieces
      </p>
    </div>
  );
}
