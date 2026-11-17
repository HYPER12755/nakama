import { Icon } from "./Icon";
import type { TableEvent } from "../lib/events";

export interface EventToastsProps {
  events: TableEvent[];
  onDismiss: (id: number) => void;
}

const ICON: Record<TableEvent["kind"], "sparkles" | "target" | "close" | "trophy" | "users"> = {
  pocket: "target",
  queen: "sparkles",
  foul: "close",
  win: "trophy",
  turn: "users",
  info: "sparkles",
};

/** A stack of short event messages, the way the other titles report a move. */
export function EventToasts({ events, onDismiss }: EventToastsProps) {
  if (events.length === 0) {
    return null;
  }
  return (
    <div className="event-toasts" aria-live="polite">
      {events.map((event) => (
        <div key={event.id} className={`toast toast--${event.kind}`} role="status">
          <Icon name={ICON[event.kind]} size={16} />
          <span>{event.message}</span>
          <button
            type="button"
            className="toast__close"
            onClick={() => onDismiss(event.id)}
            aria-label="Dismiss message"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
