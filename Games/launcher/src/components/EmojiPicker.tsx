import { useEffect, useMemo, useRef, useState } from "react";
import {
  CHAT_EMOJI_GROUPS,
  CHAT_EMOJI_MAX_RECENT,
  rememberRecentEmoji,
} from "@moongames/game-sdk";

const RECENT_KEY = "moongames.chat.recents.v1";

function readRecents(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (raw === null) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function storeRecents(recents: string[]): void {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(recents));
  } catch {
    // Recents are a convenience; the picker still works without storage.
  }
}

export function EmojiTriggerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8.6 14.1a4.1 4.1 0 0 0 6.8 0M9.2 9.6h.01M14.8 9.6h.01" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export interface EmojiPickerProps {
  onPick: (emoji: string) => void;
  onClose: () => void;
  align?: "left" | "right";
}

export function EmojiPicker({ onPick, onClose, align = "right" }: EmojiPickerProps) {
  const [recents, setRecents] = useState<string[]>([]);
  const [activeGroup, setActiveGroup] = useState(CHAT_EMOJI_GROUPS[0].id);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRecents(readRecents().slice(0, CHAT_EMOJI_MAX_RECENT));
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const group = useMemo(
    () => CHAT_EMOJI_GROUPS.find((item) => item.id === activeGroup) ?? CHAT_EMOJI_GROUPS[0],
    [activeGroup],
  );

  const pick = (emoji: string) => {
    const next = rememberRecentEmoji(recents, emoji);
    setRecents(next);
    storeRecents(next);
    onPick(emoji);
    onClose();
  };

  return (
    <div
      className={`emoji-picker emoji-picker--${align}`}
      ref={rootRef}
      role="dialog"
      aria-label="Choose an emoji"
    >
      {recents.length > 0 ? (
        <section className="emoji-picker__section">
          <span className="emoji-picker__label">Recent</span>
          <div className="emoji-picker__grid emoji-picker__grid--recent">
            {recents.map((emoji) => (
              <button
                className="emoji-picker__emoji"
                type="button"
                key={`recent-${emoji}`}
                aria-label={`Insert ${emoji}`}
                onClick={() => pick(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="emoji-picker__tabs" role="tablist" aria-label="Emoji categories">
        {CHAT_EMOJI_GROUPS.map((item) => (
          <button
            className={
              item.id === group.id
                ? "emoji-picker__tab emoji-picker__tab--active"
                : "emoji-picker__tab"
            }
            type="button"
            role="tab"
            aria-selected={item.id === group.id}
            key={item.id}
            onClick={() => setActiveGroup(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="emoji-picker__grid" role="tabpanel" aria-label={group.label}>
        {group.emojis.map((emoji) => (
          <button
            className="emoji-picker__emoji"
            type="button"
            key={emoji}
            aria-label={`Insert ${emoji}`}
            onClick={() => pick(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
