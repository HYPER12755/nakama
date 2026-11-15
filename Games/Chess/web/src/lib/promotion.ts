import type { PromotionPiece } from "@moongames/chess-core";
import { AutoQueen } from "@moongames/game-ui";

/**
 * What a pawn that reaches the last rank becomes.
 *
 * It returns the queen when the pawn is a queen at once, and nothing when
 * the player is asked which piece the pawn becomes.
 */
export function promotionPiece(
  autoQueen: AutoQueen,
  needsPromotion: boolean,
): PromotionPiece | null {
  if (!needsPromotion) {
    return null;
  }
  return autoQueen === AutoQueen.Always ? "q" : null;
}
