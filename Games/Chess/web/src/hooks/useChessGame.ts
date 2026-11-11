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
}

export interface ChessGameController {
  state: ChessState;
  selected: Square | null;
  legalTargets: Square[];
  checkSquare: Square | null;
  pendingPromotion: PendingPromotion | null;
  error: string | null;
  canUndo: boolean;
  aiSettings: AiGameSettings | null;
  aiThinking: boolean;
  selectSquare: (square: Square) => void;
  choosePromotion: (piece: PromotionPiece) => void;
  cancelPromotion: () => void;
  newGame: () => void;
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
  const engineRef = useRef<ChessEngine | null>(null);
  if (engineRef.current === null) {
    engineRef.current = new ChessEngine();
  }
  const engine = engineRef.current;

  const [state, setState] = useState<ChessState>(() => engine.getState());
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

  const selectSquare = useCallback(
    (square: Square) => {
      const humanColor = aiSettings?.humanColor ?? null;
      if (
        pendingPromotion !== null ||
        terminal(state) ||
        (humanColor !== null &&
          (aiThinking || state.turn !== humanColor))
      ) {
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
    [aiSettings, aiThinking, pendingPromotion, playMove, selected, state],
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
    if (selected === null) {
      return [];
    }

    return [
      ...new Set(
        (state.legalMoves[selected] ?? []).map((move) => move.to),
      ),
    ];
  }, [selected, state.legalMoves]);

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
    selected,
    legalTargets,
    checkSquare,
    pendingPromotion,
    error,
    canUndo,
    aiSettings,
    aiThinking,
    selectSquare,
    choosePromotion,
    cancelPromotion,
    newGame,
    startAiGame,
    undo,
    pgn,
  };
}
