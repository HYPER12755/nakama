import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { OnlineChatMessage } from "../lib/onlineProtocol";
import { Icon } from "./Icon";

export interface MatchChatProps {
  matchId: string | null;
  messages: OnlineChatMessage[];
  selfUserId: string | null;
  onSend: (text: string) => void;
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5.5 5.75h13a2.75 2.75 0 0 1 2.75 2.75v6.5A2.75 2.75 0 0 1 18.5 17.75h-6.1l-4.2 2.65c-.52.33-1.2-.05-1.2-.67v-1.98H5.5a2.75 2.75 0 0 1-2.75-2.75v-6.5A2.75 2.75 0 0 1 5.5 5.75Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M8 10.25h8M8 13.25h5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="m4.2 11.2 15-6.4-5.1 14.6-2.9-5.8-7-2.4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="m11.2 13.6 4.5-4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MatchChat({
  matchId,
  messages,
  selfUserId,
  onSend,
}: MatchChatProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [seenCount, setSeenCount] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const stickToBottomRef = useRef(true);
  const wasOpenRef = useRef(false);

  const unread = open ? 0 : Math.max(0, messages.length - seenCount);
  const canSend = text.trim().length > 0;

  useEffect(() => {
    setOpen(false);
    setText("");
    setSeenCount(0);
  }, [matchId]);

  useEffect(() => {
    if (open) {
      setSeenCount(messages.length);
    }
  }, [messages.length, open]);

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      stickToBottomRef.current = true;
      const timer = window.setTimeout(() => inputRef.current?.focus(), 60);
      return () => window.clearTimeout(timer);
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      launcherRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open || !stickToBottomRef.current) {
      return;
    }
    const list = listRef.current;
    if (list !== null) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages.length, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      event.preventDefault();
      // Escape should close the chat without also leaving the fullscreen
      // board. The board listens later in the bubble phase.
      event.stopPropagation();
      setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSend) {
      return;
    }
    onSend(text);
    setText("");
  };

  return (
    <div className={`match-chat${open ? " match-chat--open" : ""}`}>
      {open && (
        <section
          className="chat-panel"
          aria-label="Temporary match chat"
          role="dialog"
          aria-modal="false"
        >
          <header className="chat-panel__header">
            <div>
              <p className="chat-panel__kicker">This match only</p>
              <h2>Table talk</h2>
            </div>
            <button
              type="button"
              className="chat-panel__close"
              onClick={() => setOpen(false)}
              aria-label="Close match chat"
            >
              <Icon name="close" size={17} />
            </button>
          </header>

          <div
            className="chat-panel__messages"
            ref={listRef}
            aria-live="polite"
            aria-relevant="additions"
            onScroll={() => {
              const list = listRef.current;
              if (list === null) {
                return;
              }
              stickToBottomRef.current =
                list.scrollHeight - list.scrollTop - list.clientHeight < 48;
            }}
          >
            {messages.length === 0 ? (
              <div className="chat-panel__empty">
                <ChatIcon />
                <p>Say hello before the first move.</p>
                <span>Messages disappear when the match ends.</span>
              </div>
            ) : (
              messages.map((message) => {
                const own = message.userId === selfUserId;
                return (
                  <article
                    key={message.id}
                    className={`chat-message${own ? " chat-message--own" : ""}`}
                  >
                    <div className="chat-message__meta">
                      <strong>{own ? "You" : message.username}</strong>
                      {message.spectator && <span>spectator</span>}
                      <time dateTime={new Date(message.sentAt).toISOString()}>
                        {new Date(message.sentAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                    <p>{message.text}</p>
                  </article>
                );
              })
            )}
          </div>

          <form className="chat-panel__composer" onSubmit={submit}>
            <label className="chat-panel__input">
              <span className="visually-hidden">Chat message</span>
              <input
                ref={inputRef}
                type="text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Message the table…"
                maxLength={240}
                autoComplete="off"
                enterKeyHint="send"
              />
            </label>
            <button
              type="submit"
              className="chat-panel__send"
              disabled={!canSend}
              aria-label="Send chat message"
            >
              <SendIcon />
            </button>
          </form>
          <p className="chat-panel__note">Temporary chat · cleared at game over</p>
        </section>
      )}

      <button
        type="button"
        className="chat-launcher"
        ref={launcherRef}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label={open ? "Close match chat" : "Open match chat"}
        title={open ? "Close match chat" : "Match chat"}
      >
        {open ? <Icon name="close" size={19} /> : <ChatIcon />}
        {unread > 0 && (
          <span className="chat-launcher__badge" aria-label={`${unread} unread messages`}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    </div>
  );
}
