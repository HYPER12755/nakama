import { useEffect, useMemo, useState } from "react";
import { ReplayShell } from "@moongames/game-ui";
import { PLAYER_LABEL, type CarromPlayer } from "@moongames/carrom-core";
import { CarromBoard } from "./CarromBoard";
import { boardAt, type ReplayData } from "../lib/replay";
import type { AimMode } from "../lib/aim";
import type { Theme } from "../lib/theme";

export interface ReplayDialogProps {
  title: string;
  data: ReplayData;
  theme: Theme;
  onClose: () => void;
}

/** Walk a finished table one shot at a time, on the same board as a live game. */
export function ReplayDialog({ title, data, theme, onClose }: ReplayDialogProps) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [aimMode] = useState<AimMode>("pull");

  const steps = useMemo(
    () =>
      data.shots.map((shot, index) => {
        const colour = shot.colour as CarromPlayer | undefined;
        const name = colour ? PLAYER_LABEL[colour] : shot.by ?? "Player";
        const count = shot.pocketed_count ?? 0;
        return `${index + 1}. ${name}${count > 0 ? ` · ${count} in` : ""}`;
      }),
    [data],
  );

  const state = useMemo(() => boardAt(data, step), [data, step]);

  useEffect(() => {
    if (!playing) {
      return;
    }
    const timer = window.setInterval(() => {
      setStep((current) => {
        if (current >= data.shots.length - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 900);
    return () => window.clearInterval(timer);
  }, [playing, data.shots.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <ReplayShell
      title={title}
      kicker="Finished table"
      steps={steps}
      step={step}
      playing={playing}
      onStep={(index) => {
        setStep(index);
        setPlaying(false);
      }}
      onTogglePlay={() => setPlaying((value) => !value)}
      onClose={onClose}
      positionLabel={state?.turn ? PLAYER_LABEL[state.turn] : undefined}
      board={
        state === null ? (
          <p className="setting__note">This table cannot be replayed.</p>
        ) : (
          <CarromBoard
            state={state}
            strikerPosition={0.5}
            animation={null}
            disabled
            theme={theme}
            aimMode={aimMode}
            view={state.players[0] ?? "white"}
            onShoot={() => undefined}
            onAnimationComplete={() => undefined}
          />
        )
      }
      side={
        <p className="setting__note">
          {data.teams ? "Doubles table. " : ""}
          {data.shots.length} shots · {data.variant}
        </p>
      }
    />
  );
}
