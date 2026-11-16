import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChessEngine,
  chooseAiMove,
  type AiDifficulty,
  type ChessState,
  type Color,
  type PromotionPiece,
  type Square,
} from "@moongames/chess-core";
import { AutoQueen, type MoveEvent } from "@moongames/game-ui";
import { promotionPiece } from "../lib/promotion";
import { findKeyboardMove, readKeyboardMove } from "../lib/notation";

export interface PendingPromotion {
  from: Square;
  to: Square;
  color: Color;
}

export interface AiGameSettings {
  humanColor: Color;
  difficulty: AiDifficulty;
}

export interface ChessGameOptions {
  ai?: boolean;
  active?: boolean;
  /** When a pawn that reaches the last rank becomes a queen. */
  autoQueen?: AutoQueen;
  /** How a piece is moved across the board. */
  moveEvent?: MoveEvent;
}

export interface ChessGameController {
  state: ChessState;
  /** The position the game began from. */
  startFen: string;
  selected: Square | null;
  legalTargets: Square[];
  checkSquare: Square | null;
  pendingPromotion: PendingPromotion | null;
  error: string | null;
  canUndo: boolean;
  aiSettings: AiGameSettings | null;
  aiThinking: boolean;
  selectSquare: (square: Square) => void;
  /** Move a piece from one square to another, as a drag does. */
  movePiece: (from: Square, to: Square) => void;
  /** The move that is ready for the next turn. */
  premove: { from: Square; to: Square } | null;
  /** The squares the piece of the ready move may go to. */
  premoveTargets: Square[];
  /** Forget the move that is ready. */
  clearPremove: () => void;
  /** Play a move that was written with the keyboard. */
  moveBySan: (san: string) => boolean;
  choosePromotion: (piece: PromotionPiece) => void;
  cancelPromotion: () => void;
  newGame: () => void;
  /** Start a game from a position. */
  startFromFen: (fen: string) => void;
  startAiGame: (settings: AiGameSettings) => void;
  undo: () => void;
  pgn: () => string;
}

function opposite(color: Color): Color {
  return color === "w" ? "b" : "w";
}

function terminal(state: ChessState): boolean {
  return (
    state.status === "checkmate" ||
    state.status === "stalemate" ||
    state.status === "draw"
  );
}

export function useChessGame(
  options: ChessGameOptions = {},
): ChessGameController {
  const autoQueen = options.autoQueen ?? AutoQueen.Never;
  const engineRef = useRef<ChessEngine | null>(null);
  if (engineRef.current === null) {
    engineRef.current = new ChessEngine();
  }
  const engine = engineRef.current;

  const [state, setState] = useState<ChessState>(() => engine.getState());
  /** The position the game began from, so the report can replay it. */
  const [startFen, setStartFen] = useState<string>(() => engine.fen);
  const [selected, setSelected] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] =
    useState<PendingPromotion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiSettings, setAiSettings] = useState<AiGameSettings | null>(() =>
    options.ai
      ? {
          humanColor: "w",
          difficulty: "medium",
        }
      : null,
  );
  const [aiThinking, setAiThinking] = useState(false);
  /** The move that is ready for the turn after this one. */
  const [premove, setPremove] = useState<{
    from: Square;
    to: Square;
  } | null>(null);
  /** The piece whose moves are being chosen for the next turn. */
  const [premoveFrom, setPremoveFrom] = useState<Square | null>(null);
  const [premoveTargets, setPremoveTargets] = useState<Square[]>([]);
  const aiGenerationRef = useRef(0);
  const aiTimerRef = useRef<number | null>(null);
  const active = options.active ?? true;
  const activeRef = useRef(active);
  activeRef.current = active;

  const refresh = useCallback(() => {
    setState(engine.getState());
  }, [engine]);

  const cancelAi = useCallback(() => {
    aiGenerationRef.current += 1;
    if (aiTimerRef.current !== null) {
      window.clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }
    setAiThinking(false);
  }, []);

  const aiColor = aiSettings === null ? null : opposite(aiSettings.humanColor);

  useEffect(() => {
    if (
      aiSettings === null ||
      aiColor === null ||
      !activeRef.current ||
      state.turn !== aiColor ||
      terminal(state) ||
      aiTimerRef.current !== null
    ) {
      setAiThinking(false);
      return;
    }

    const generation = aiGenerationRef.current;
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      aiTimerRef.current = null;
      if (
        generation !== aiGenerationRef.current ||
        !activeRef.current
      ) {
        setAiThinking(false);
        return;
      }

      const current = engine.getState();
      if (current.turn !== aiColor || terminal(current)) {
        setAiThinking(false);
        return;
      }

      try {
        const move = chooseAiMove(current.fen, {
          difficulty: aiSettings.difficulty,
        });
        if (move !== null) {
          engine.move(move);
        }
        setSelected(null);
        setPendingPromotion(null);
        setError(null);
        refresh();
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "The computer could not move.",
        );
      } finally {
        setAiThinking(false);
      }
    }, 360);
    aiTimerRef.current = timer;

    return () => {
      if (aiTimerRef.current === timer) {
        window.clearTimeout(timer);
        aiTimerRef.current = null;
      }
    };
  }, [active, aiColor, aiSettings, engine, refresh, state]);

  const playMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece) => {
      try {
        engine.move({ from, to, promotion });
        setSelected(null);
        setPendingPromotion(null);
        setError(null);
        refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Illegal move");
      }
    },
    [engine, refresh],
  );

  /**
   * Choose the move that is ready for the turn after this one.
   *
   * The first square is the piece, the second is where it goes.
   */
  const choosePremove = useCallback(
    (square: Square) => {
      const humanColor = aiSettings?.humanColor ?? null;
      if (humanColor === null) {
        return;
      }

      // The square the piece of the ready move may go to.
      if (premoveFrom !== null && premoveTargets.includes(square)) {
        setPremove({ from: premoveFrom, to: square });
        setPremoveFrom(null);
        setPremoveTargets([]);
        return;
      }

      const piece = state.board.find(
        (candidate) => candidate.square === square,
      );
      if (piece?.color !== humanColor) {
        setPremoveFrom(null);
        setPremoveTargets([]);
        return;
      }

      const moves = engine.movesFrom(square);
      setPremoveFrom(square);
      setPremoveTargets([...new Set(moves.map((move) => move.to))]);
    },
    [aiSettings, engine, premoveFrom, premoveTargets, state.board],
  );

  /** Forget the move that is ready for the next turn. */
  const clearPremove = useCallback(() => {
    setPremove(null);
    setPremoveFrom(null);
    setPremoveTargets([]);
  }, []);

  // The move that is ready is played as soon as it is the player's turn.
  useEffect(() => {
    if (premove === null) {
      return;
    }
    const humanColor = aiSettings?.humanColor ?? null;
    if (humanColor === null || state.turn !== humanColor) {
      return;
    }
    const ready = premove;
    clearPremove();
    playMove(ready.from, ready.to);
  }, [
    aiSettings,
    clearPremove,
    playMove,
    premove,
    state.turn,
  ]);

  const selectSquare = useCallback(
    (square: Square) => {
      const humanColor = aiSettings?.humanColor ?? null;

      if (pendingPromotion !== null) {
        // The picker is open. A second click on the same square is a quick
        // way to make the pawn a queen.
        if (
          autoQueen === AutoQueen.OnPromotion &&
          square === pendingPromotion.to
        ) {
          playMove(pendingPromotion.from, pendingPromotion.to, "q");
        }
        return;
      }

      if (terminal(state)) {
        return;
      }

      // While the computer is thinking, the move is chosen for the turn
      // after this one.
      if (humanColor !== null && state.turn !== humanColor) {
        choosePremove(square);
        return;
      }

      if (humanColor !== null && aiThinking) {
        return;
      }

      const playableColor = humanColor ?? state.turn;
      const piece = state.board.find((candidate) => candidate.square === square);

      if (selected !== null) {
        const candidates = (state.legalMoves[selected] ?? []).filter(
          (move) => move.to === square,
        );

        if (candidates.length > 0) {
          if (candidates.some((move) => move.promotion !== undefined)) {
            const queen = promotionPiece(autoQueen, true);
            if (queen !== null) {
              playMove(selected, square, queen);
              return;
            }
            setPendingPromotion({
              from: selected,
              to: square,
              color: playableColor,
            });
            setError(null);
            return;
          }

          playMove(selected, square);
          return;
        }
      }

      if (piece?.color === playableColor) {
        setSelected((current) => (current === square ? null : square));
        setError(null);
        return;
      }

      setSelected(null);
    },
    [
      aiSettings,
      aiThinking,
      autoQueen,
      choosePremove,
      pendingPromotion,
      playMove,
      selected,
      state,
    ],
  );

  /**
   * Play a move that was written with the keyboard.
   *
   * The move is looked for among the moves that are legal, so a move
   * written by hand is checked the same way a move made by clicking is.
   */
  const moveBySan = useCallback(
    (san: string): boolean => {
      const moves = Object.values(state.legalMoves).flat();
      const found = findKeyboardMove(moves, readKeyboardMove(san));
      if (found === null) {
        return false;
      }
      if (found.promotion !== undefined) {
        setPendingPromotion({
          from: found.from,
          to: found.to,
          color: state.turn,
        });
        setError(null);
        return true;
      }
      playMove(found.from, found.to);
      return true;
    },
    [playMove, state.legalMoves, state.turn],
  );

  /**
   * Move a piece from one square to another, as a drag does.
   *
   * The move is checked against the engine, so a drag that is not a legal
   * move is refused the same way a click is.
   */
  const movePiece = useCallback(
    (from: Square, to: Square) => {
      const humanColor = aiSettings?.humanColor ?? null;
      if (
        pendingPromotion !== null ||
        terminal(state) ||
        (humanColor !== null && (aiThinking || state.turn !== humanColor))
      ) {
        return;
      }

      const candidates = (state.legalMoves[from] ?? []).filter(
        (move) => move.to === to,
      );
      if (candidates.length === 0) {
        return;
      }

      if (candidates.some((move) => move.promotion !== undefined)) {
        const queen = promotionPiece(autoQueen, true);
        if (queen !== null) {
          playMove(from, to, queen);
          return;
        }
        setPendingPromotion({
          from,
          to,
          color: humanColor ?? state.turn,
        });
        setError(null);
        return;
      }

      playMove(from, to);
    },
    [aiSettings, aiThinking, autoQueen, pendingPromotion, playMove, state],
  );

  const choosePromotion = useCallback(
    (promotion: PromotionPiece) => {
      if (pendingPromotion === null) {
        return;
      }
      playMove(pendingPromotion.from, pendingPromotion.to, promotion);
    },
    [pendingPromotion, playMove],
  );

  const cancelPromotion = useCallback(() => {
    setPendingPromotion(null);
    setSelected(null);
  }, []);

  const newGame = useCallback(() => {
    cancelAi();
    engine.reset();
    setSelected(null);
    setPendingPromotion(null);
    setError(null);
    refresh();
  }, [cancelAi, engine, refresh]);

  /**
   * Start a game from a position, the way a player who has a position in
   * mind plays from it.
   */
  const startFromFen = useCallback(
    (fen: string) => {
      cancelAi();
      try {
        engine.load(fen);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "That position cannot be played",
        );
        return;
      }
      setStartFen(engine.fen);
      setSelected(null);
      setPendingPromotion(null);
      setError(null);
      refresh();
    },
    [cancelAi, engine, refresh],
  );

  const startAiGame = useCallback(
    (settings: AiGameSettings) => {
      cancelAi();
      setAiSettings(settings);
      engine.reset();
      setSelected(null);
      setPendingPromotion(null);
      setError(null);
      refresh();
    },
    [cancelAi, engine, refresh],
  );

  const undo = useCallback(() => {
    cancelAi();

    if (aiSettings === null) {
      engine.undo();
    } else if (state.turn === aiSettings.humanColor) {
      engine.undo();
      if (engine.lastMove?.color === aiSettings.humanColor) {
        engine.undo();
      }
    } else {
      engine.undo();
    }

    setSelected(null);
    setPendingPromotion(null);
    setError(null);
    refresh();
  }, [aiSettings, cancelAi, engine, refresh, state.turn]);

  const legalTargets = useMemo(() => {
    // While a move for the next turn is being chosen, the squares it may
    // go to are the ones that are shown.
    if (premoveFrom !== null) {
      return premoveTargets;
    }

    if (selected === null) {
      return [];
    }

    return [
      ...new Set(
        (state.legalMoves[selected] ?? []).map((move) => move.to),
      ),
    ];
  }, [premoveFrom, premoveTargets, selected, state.legalMoves]);

  const checkSquare = useMemo(() => {
    if (!state.inCheck) {
      return null;
    }

    return (
      state.board.find(
        (piece) => piece.type === "k" && piece.color === state.turn,
      )?.square ?? null
    );
  }, [state]);

  const pgn = useCallback(() => engine.pgn(), [engine]);

  const canUndo =
    aiSettings === null
      ? state.history.length > 0
      : state.history.some((move) => move.color === aiSettings.humanColor);

  return {
    state,
    startFen,
    selected,
    legalTargets,
    checkSquare,
    pendingPromotion,
    error,
    canUndo,
    aiSettings,
    aiThinking,
    selectSquare,
    movePiece,
    premove,
    premoveTargets,
    clearPremove,
    moveBySan,
    choosePromotion,
    cancelPromotion,
    newGame,
    startFromFen,
    startAiGame,
    undo,
    pgn,
  };
}
