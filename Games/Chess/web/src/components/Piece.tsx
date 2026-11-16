import { useEffect, useRef, useState } from "react";
import type {
  BoardPiece,
  Color,
  PieceSymbol,
} from "@moongames/chess-core";
import { pieceName } from "../lib/pieces";
import { pieceImageUrl } from "../lib/pieceSets";

export interface PieceImageProps {
  /** The picture of the piece. */
  src: string;
  /** The name of the piece, for a reader that cannot see the picture. */
  alt?: string;
  className?: string;
}

/**
 * The picture of a piece.
 *
 * A few of the sets are drawn as pictures and the rest as drawings, so when
 * a picture cannot be shown the other kind is tried.
 */
export function PieceImage({ src, alt = "", className }: PieceImageProps) {
  const [source, setSource] = useState(src);

  useEffect(() => {
    setSource(src);
  }, [src]);

  return (
    <img
      className={className}
      src={source}
      alt={alt}
      draggable={false}
      onError={() => {
        if (source.endsWith(".svg")) {
          setSource(source.replace(/\.svg$/, ".webp"));
          return;
        }
        if (source.endsWith(".webp")) {
          setSource(source.replace(/\.webp$/, ".svg"));
        }
      }}
    />
  );
}

export interface PieceMotion {
  /** Horizontal travel in board squares (positive = right). */
  x: number;
  /** Vertical travel in board squares (positive = down). */
  y: number;
  key: string;
}

export interface PieceProps {
  piece: BoardPiece;
  justMoved?: boolean;
  motion?: PieceMotion | null;
  /** The set of pieces the table is using. */
  pieceSet?: string;
  /** How long a piece takes to travel, in milliseconds. */
  animationMs?: number;
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
          <circle cx="32" cy="17.2" r="7.7" />
          <path d="M27.6 24.6h8.8c-.3 4.4.4 7.7 1 10.4H26.6c.6-2.7 1.3-6 1-10.4Z" />
          <path d="M24.5 34.4h15c.3 4.2 1.7 7.2 3.4 9.6H21.1c1.7-2.4 3.1-5.4 3.4-9.6Z" />
          <path d="M21.7 43.4h20.6l1.6 5.2H20.1Z" />
          <rect x="18.8" y="47.9" width="26.4" height="7.2" rx="3.2" />
          <path className="piece-art__detail" d="M25.8 35.2h12.4" />
        </>
      );
    case "r":
      return (
        <>
          <path d="M19.8 12.2h6.1v5.2h4.4v-5.2h3.4v5.2h4.4v-5.2h6.1v14.2l-3.1 4.4H22.9l-3.1-4.4Z" />
          <path d="M23 30.6h18l2 12.5H21Z" />
          <path d="M20 42.8h24.2l1.5 5.1H18.5Z" />
          <rect x="17.2" y="47.4" width="30" height="7.5" rx="3.2" />
          <path className="piece-art__detail" d="M24.2 33.2h15.6M23 38.4h18" />
          <path className="piece-art__detail" d="M28.2 33.2v5.2M35.8 33.2v5.2" />
        </>
      );
    case "b":
      return (
        <>
          <circle cx="32" cy="9.2" r="2.2" />
          <path d="M32 12.4c5.8 3.5 9.4 8.8 9.4 14.5 0 4.2-2 7.7-5.3 9.9H27.9c-3.3-2.2-5.3-5.7-5.3-9.9 0-5.7 3.6-11 9.4-14.5Z" />
          <path d="M27 37h10l1.8 5.2H25.2Z" />
          <path d="M22 42.4h20l1.7 5.5H20.3Z" />
          <rect x="18.7" y="47.4" width="26.6" height="7.5" rx="3.2" />
          <path className="piece-art__detail" d="M32 20.4v9.2M27.4 25h9.2" />
          <path className="piece-art__detail" d="M35.1 19.1 31.2 31.2" />
        </>
      );
    case "q":
      return (
        <>
          <circle cx="15.6" cy="18.2" r="2.8" />
          <circle cx="24" cy="13.6" r="2.7" />
          <circle cx="32" cy="11.4" r="3" />
          <circle cx="40" cy="13.6" r="2.7" />
          <circle cx="48.4" cy="18.2" r="2.8" />
          <path d="M15.2 22.4 19.7 36h24.6l4.5-13.6-7.6 5.7-3.4-10.7L32 16.5l-5.8 10.9-3.4-10.7Z" />
          <path d="M22.8 37.1h18.4l2.2 6.2H20.6Z" />
          <path d="M19.4 43.2h25.2l1.4 5.3H18Z" />
          <rect x="16.5" y="48.2" width="31" height="7.1" rx="3.3" />
          <path className="piece-art__detail" d="M23.4 32.2h17.2" />
        </>
      );
    case "k":
      return (
        <>
          <path d="M30 5.8h4v4.4h4.4v4H34v5.3h-4v-5.3h-4.4v-4H30Z" />
          <path d="M15.8 22.8 20.2 36.8h23.6l4.4-14-7.3 5.6-3.2-10.1L32 16.2l-5.7 10.1-3.2-10.1Z" />
          <path d="M22.5 37.6h19l2.2 6.2H20.3Z" />
          <path d="M19.2 43.8h25.6l1.4 5.1H17.8Z" />
          <rect x="16.4" y="48.3" width="31.2" height="7.1" rx="3.3" />
          <path className="piece-art__detail" d="M24.4 29.6h15.2" />
        </>
      );
    case "n":
      return (
        <>
          <path d="M36.5 8.2 34.7 13.4c3.8 1.7 6.3 5.1 7.3 9.6.9 4 .9 12.1.9 22.6H22.8c.5-4.9 2-8.9 4.9-12.1 1.8-2 2.9-4.3 3.3-7-3.8-.4-6.8-1.8-9.2-4.3-2.9-3-2.1-6.1 1.1-7.7 3.1-1.6 5.8-4.1 7.6-7.4l1.4-2.6 4.6 3.7Z" />
          <path d="M19 45.8h26l1.3 5.1H17.7Z" />
          <rect x="16.5" y="49.7" width="31" height="6.8" rx="3" />
          <path
            className="piece-art__detail"
            d="M38 14.5c1.5 2.2 2.4 4.7 2.8 7.4M35 13.1c1.7 2.4 2.7 5.2 3 8.3"
          />
          <path
            className="piece-art__detail"
            d="M23.2 24.7c2.6.7 5.1.1 7.3-1.7"
          />
          <circle className="piece-art__eye" cx="29.2" cy="19.7" r="1.3" />
          <circle className="piece-art__eye" cx="22.2" cy="24.3" r="0.85" />
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

/**
 * A piece shown on its own, the way it is shown in the picker of the sets.
 */
export function PiecePreview({
  type,
  color,
}: {
  type: PieceSymbol;
  color: Color;
}) {
  return (
    <span className={`piece-preview piece-preview--${color}`} aria-hidden="true">
      <PieceArtwork type={type} color={color} />
    </span>
  );
}

export function Piece({
  piece,
  justMoved = false,
  motion = null,
  pieceSet = "moongames",
  animationMs = 190,
}: PieceProps) {
  const nodeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = nodeRef.current;
    if (
      node === null ||
      motion === null ||
      (motion.x === 0 && motion.y === 0) ||
      animationMs <= 0 ||
      typeof node.animate !== "function"
    ) {
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    // A piece is 82% of a square, so one square of travel is 100 / 0.82 of
    // the piece's own width. Animating the piece itself lets it glide over
    // neighbouring squares without a second board layer.
    const unit = 100 / 0.82;
    node.animate(
      [
        {
          transform: `translate(${motion.x * unit}%, ${motion.y * unit}%)`,
        },
        { transform: "translate(0, 0)" },
      ],
      {
        duration: animationMs,
        easing: "cubic-bezier(0.22, 0.78, 0.32, 1)",
      },
    );
  }, [motion?.key, motion?.x, motion?.y, animationMs]);

  const drawing = pieceImageUrl(
    pieceSet,
    piece.color === "w" ? "w" : "b",
    piece.type,
  );

  return (
    <span
      ref={nodeRef}
      className={`piece piece--${piece.color}${justMoved ? " piece--just-moved" : ""}`}
      aria-hidden="true"
      data-piece={pieceName(piece)}
    >
      {drawing === null ? (
        <PieceArtwork type={piece.type} color={piece.color} />
      ) : (
        <PieceImage className="piece__drawing" src={drawing} />
      )}
    </span>
  );
}
