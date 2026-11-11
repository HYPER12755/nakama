import { useEffect, useRef } from "react";
import type { MoveRecord } from "@moongames/chess-core";

export interface MoveListProps {
  history: MoveRecord[];
}

export function MoveList({ history }: MoveListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (element !== null) {
      element.scrollTop = element.scrollHeight;
    }
  }, [history.length]);

  const rows: Array<{
    number: number;
    white: MoveRecord | undefined;
    black: MoveRecord | undefined;
  }> = [];

  for (let index = 0; index < history.length; index += 2) {
    rows.push({
      number: index / 2 + 1,
      white: history[index],
      black: history[index + 1],
    });
  }

  return (
    <section className="panel moves-panel">
      <div className="panel-heading">
        <h2>Moves</h2>
        <span className="panel-count">{history.length}</span>
      </div>
      <div className="moves-scroll" ref={scrollRef}>
        {rows.length === 0 ? (
          <p className="empty-state">No moves yet. White starts.</p>
        ) : (
          <ol className="moves-list">
            {rows.map((row) => (
              <li key={row.number} className="move-row">
                <span className="move-number">{row.number}.</span>
                <span className="move-san">{row.white?.san ?? ""}</span>
                <span className="move-san">{row.black?.san ?? ""}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
