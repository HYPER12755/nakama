import { useEffect, useState } from "react";
import type { EngineMode } from "../lib/engine/externalEngine";

export interface UseEngineAccessResult {
  /** Whether the engine may be used here. */
  allowed: boolean;
  /** Whether the server has answered yet. */
  loading: boolean;
}

/**
 * Whether the engine may be used in this game.
 *
 * The engine is for the games against yourself. In a game against a person
 * it is only for the accounts the server has named, so the client asks the
 * server rather than deciding for itself.
 */
export function useEngineAccess(
  mode: EngineMode,
  token: string | null,
): UseEngineAccessResult {
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // The games against yourself and against the computer need no answer.
    if (mode !== "online") {
      setAllowed(true);
      setLoading(false);
      return;
    }

    let alive = true;
    setLoading(true);

    const controller = new AbortController();
    const query = new URLSearchParams({ mode });
    fetch(`/api/engine/access?${query.toString()}`, {
      signal: controller.signal,
      headers:
        token !== null && token.length > 0
          ? { Authorization: `Bearer ${token}` }
          : {},
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("the server did not answer");
        }
        return (await response.json()) as { allowed?: boolean };
      })
      .then((payload) => {
        if (!alive) {
          return;
        }
        setAllowed(payload.allowed === true);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) {
          return;
        }
        setAllowed(false);
        setLoading(false);
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [mode, token]);

  return { allowed, loading };
}
