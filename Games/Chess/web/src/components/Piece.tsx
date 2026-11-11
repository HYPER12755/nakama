import type {
  BoardPiece,
  Color,
  PieceSymbol,
} from "@moongames/chess-core";
import { pieceName } from "../lib/pieces";

export interface PieceProps {
  piece: BoardPiece;
  justMoved?: boolean;
}

export interface PieceArtworkProps {
  type: PieceSymbol;
  color: Color;
  className?: string;
}

function Silhouette({ type }: { type: PieceSymbol }) {
  switch (type) {
    case "p":
      return (
        <>
          <circle cx="32" cy="18.5" r="8.1" />
          <path d="M27.3 25.8h9.4c-.5 5.4.1 10.1.5 13.4H26.8c.4-3.3 1-8 .5-13.4Z" />
          <path d="M24.3 39.2h15.4l2.4 8.6H21.9Z" />
          <rect x="19" y="47.8" width="26" height="7" rx="3" />
        </>
      );
    case "r":
      return (
        <>
          <path d="M18.5 15.5h7v5.8h4.6v-5.8h3.8v5.8h4.6v-5.8h7v15.7l-4.3 6.3v6H22.8v-6l-4.3-6.3Z" />
          <path d="M22.8 43.3h18.4l2.3 5.7H20.5Z" />
          <rect x="18" y="49" width="28" height="6" rx="2.5" />
        </>
      );
    case "b":
      return (
        <>
          <path d="M32 9.5c2.1 0 3.7 1.5 3.7 3.6 0 1.1-.4 2-1.2 2.9 5.5 3.6 9 8.7 9 14.2 0 4.2-2.1 7.6-5.1 9.8H27.6c-3-2.2-5.1-5.6-5.1-9.8 0-5.5 3.5-10.6 9-14.2-.8-.9-1.2-1.8-1.2-2.9 0-2.1 1.6-3.6 3.7-3.6Z" />
          <path d="M26.2 39.5h11.6l2.2 5.1H24Z" />
          <rect x="19" y="44.6" width="26" height="10" rx="2.8" />
          <path
            className="piece-art__detail"
            d="M32 18.5v10M27.5 23.5h9"
          />
        </>
      );
    case "q":
      return (
        <>
          <circle cx="16.5" cy="18" r="3" />
          <circle cx="32" cy="12.5" r="3.2" />
          <circle cx="47.5" cy="18" r="3" />
          <path d="M16.5 22.2 20.7 37h22.6l4.2-14.8-8.1 6.8L32 15.7 24.6 29Z" />
          <path d="M22.5 38.5h19l2.4 7.5H20.1Z" />
          <rect x="18.5" y="46" width="27" height="9" rx="3" />
          <path className="piece-art__detail" d="M24 28.5h16" />
        </>
      );
    case "k":
      return (
        <>
          <path d="M30.1 7.2h3.8v5.2H39v3.8h-5.1v6.2h-3.8v-6.2H25V12.4h5.1Z" />
          <path d="M16 23.5 20.3 37h23.4L48 23.5l-8.1 5.5L32 17l-7.9 12Z" />
          <path d="M20.8 38.5h22.4l2.5 7.4H18.3Z" />
          <rect x="17.5" y="46.5" width="29" height="9" rx="3" />
          <path className="piece-art__detail" d="M24 29.5h16" />
        </>
      );
    case "n":
      return (
        <>
          <path d="M19.8 48.8h24.4v-5c-4.1-.8-6.6-3.5-7.8-8.2l-2.3-8.5c-.4-1.6-1.8-2.7-3.4-2.7h-2.2l2.5-6.7-6.2 4.2-3.6-4.5-4.1 1.8 1.6 6.7c-4.5 2.9-7 7.2-7 12.2 0 4.7 2.4 8.7 6.3 10.7v.1Z" />
          <rect x="18" y="48" width="28" height="7" rx="2.5" />
          <path
            className="piece-art__detail"
            d="M35.8 22.2c2.1 2 3.4 4.7 3.9 7.9"
          />
          <circle
            className="piece-art__eye"
            cx="26.5"
            cy="27.2"
            r="1.35"
          />
        </>
      );
    default:
      return null;
  }
}

export function PieceArtwork({
  type,
  color,
  className,
}: PieceArtworkProps) {
  return (
    <svg
      className={`piece-art${className ? ` ${className}` : ""}`}
      viewBox="0 0 64 64"
      role="presentation"
      focusable="false"
      data-color={color}
    >
      <Silhouette type={type} />
    </svg>
  );
}

export function Piece({ piece, justMoved = false }: PieceProps) {
  return (
    <span
      className={`piece piece--${piece.color}${justMoved ? " piece--just-moved" : ""}`}
      aria-hidden="true"
      data-piece={pieceName(piece)}
    >
      <PieceArtwork type={piece.type} color={piece.color} />
    </span>
  );
}
