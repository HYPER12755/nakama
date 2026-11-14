import type { ReactElement } from "react";
import { gameMotif } from "./motifs";
import { Monogram } from "./monogram";

export interface GameIdMarkProps {
  id: string;
  name?: string;
  accent?: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

/**
 * Artwork for a game that is referenced by id only, for example an invite
 * card. Known icon keys use their motif, everything else uses a generated
 * mark, so no screen has to know the game list.
 */
export function GameIdMark({
  id,
  name,
  accent = "#8b9cff",
  size = 20,
  strokeWidth = 1.7,
  className,
}: GameIdMarkProps): ReactElement {
  const Motif = gameMotif(id);
  if (Motif !== null) {
    return (
      <Motif size={size} strokeWidth={strokeWidth} className={className} />
    );
  }
  return (
    <Monogram
      id={id}
      name={name ?? id}
      accent={accent}
      size={size}
      className={className}
    />
  );
}
