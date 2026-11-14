import { useEffect, useState, type CSSProperties } from "react";
import type { GameTheme } from "@moongames/game-sdk";
import {
  BrowserPreviewHost,
  sessionFromToken,
  type PreviewLogEntry,
} from "./hostPreview";

const panelStyle: CSSProperties = {
  position: "fixed",
  top: 12,
  right: 12,
  zIndex: 10_000,
  width: "min(430px, calc(100vw - 24px))",
  maxHeight: "min(70vh, 620px)",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 12,
  overflow: "auto",
  border: "1px solid rgba(148, 163, 184, 0.35)",
  borderRadius: 14,
  background: "rgba(8, 12, 19, 0.96)",
  color: "#dbe7f5",
  boxShadow: "0 18px 60px rgba(0, 0, 0, 0.45)",
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  fontSize: 11,
};

const buttonStyle: CSSProperties = {
  cursor: "pointer",
  border: "1px solid rgba(148, 163, 184, 0.35)",
  borderRadius: 7,
  background: "rgba(30, 41, 59, 0.9)",
  color: "#e2e8f0",
  padding: "5px 8px",
  font: "inherit",
};

const rowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const logStyle: CSSProperties = {
  display: "flex",
  flex: "1 1 140px",
  flexDirection: "column",
  gap: 5,
  minHeight: 80,
  maxHeight: 260,
  overflow: "auto",
  padding: 8,
  border: "1px solid rgba(71, 85, 105, 0.55)",
  borderRadius: 8,
  background: "rgba(2, 6, 23, 0.8)",
};

const sessionPanelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 7,
  padding: 9,
  border: "1px solid rgba(125, 211, 252, 0.28)",
  borderRadius: 8,
  background: "rgba(8, 47, 73, 0.32)",
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  color: "#bae6fd",
};

const inputStyle: CSSProperties = {
  boxSizing: "border-box",
  width: "100%",
  padding: "5px 7px",
  border: "1px solid rgba(148, 163, 184, 0.45)",
  borderRadius: 6,
  background: "rgba(2, 6, 23, 0.9)",
  color: "#f8fafc",
  font: "inherit",
};

function payloadText(entry: PreviewLogEntry): string {
  if (entry.payload === undefined) {
    return "";
  }
  try {
    return JSON.stringify(entry.payload);
  } catch {
    return String(entry.payload);
  }
}

function directionColor(entry: PreviewLogEntry): string {
  switch (entry.direction) {
    case "host-to-game":
      return "#7dd3fc";
    case "game-to-host":
      return "#86efac";
    default:
      return "#fcd34d";
  }
}

export interface HostPreviewPanelProps {
  host: BrowserPreviewHost;
}

export function HostPreviewPanel({ host }: HostPreviewPanelProps) {
  const [open, setOpen] = useState(true);
  const [showSession, setShowSession] = useState(false);
  const [token, setToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState(false);
  const [entries, setEntries] = useState<PreviewLogEntry[]>(() => [
    ...host.logEntries,
  ]);

  useEffect(() => {
    // The game's ready effect can run before this sibling panel's effect.
    // Snapshot the existing log before subscribing so the handshake is shown.
    setEntries([...host.logEntries]);
    return host.subscribeLog((entry) => {
      setEntries((current) => [...current, entry].slice(-40));
    });
  }, [host]);

  const setTheme = (theme: GameTheme) => host.setTheme(theme);

  const applySession = () => {
    const value = token.trim();
    const session = sessionFromToken(value, refreshToken.trim());
    if (session === null) {
      setSessionError(true);
      setSessionNotice("That token could not be parsed as a Nakama session JWT.");
      return;
    }

    host.setSession(session);
    setToken("");
    setRefreshToken("");
    setSessionError(false);
    setSessionNotice(
      `Host session applied for ${session.username}. Reconnect online to use it.`,
    );
  };

  const reloadPreview = () => window.location.reload();

  if (!open) {
    return (
      <button
        type="button"
        style={{ ...buttonStyle, position: "fixed", top: 12, right: 12, zIndex: 10_000 }}
        onClick={() => setOpen(true)}
        aria-label="Open browser host preview"
      >
        HOST PREVIEW
      </button>
    );
  }

  return (
    <aside style={panelStyle} aria-label="Browser host preview">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div>
          <strong style={{ letterSpacing: "0.08em" }}>HOST PREVIEW</strong>
          <div style={{ opacity: 0.65, marginTop: 3 }}>
            browser transport · {host.currentGameId} {host.currentGameVersion}
          </div>
        </div>
        <button type="button" style={buttonStyle} onClick={() => setOpen(false)}>
          Hide
        </button>
      </div>

      <div style={rowStyle}>
        <button type="button" style={buttonStyle} onClick={() => setTheme({ mode: "dark" })}>
          Dark theme
        </button>
        <button type="button" style={buttonStyle} onClick={() => setTheme({ mode: "light" })}>
          Light theme
        </button>
        <button type="button" style={buttonStyle} onClick={() => host.pause()}>
          Pause
        </button>
        <button type="button" style={buttonStyle} onClick={() => host.resume()}>
          Resume
        </button>
      </div>

      <div style={rowStyle}>
        <button type="button" style={buttonStyle} onClick={() => host.sendInit()}>
          Re-send init
        </button>
        <button
          type="button"
          style={buttonStyle}
          onClick={() => {
            host.clearLog();
            setEntries([]);
          }}
        >
          Clear log
        </button>
        <button
          type="button"
          style={buttonStyle}
          onClick={() => setShowSession((visible) => !visible)}
        >
          {showSession ? "Hide session" : "Host session"}
        </button>
        <span style={{ alignSelf: "center", opacity: 0.6 }}>
          {host.hasSession ? "host session token" : "browser device auth"}
        </span>
      </div>

      {showSession ? (
        <div style={sessionPanelStyle}>
          <label style={labelStyle}>
            Nakama session JWT
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Refresh token (optional)
            <input
              type="password"
              value={refreshToken}
              onChange={(event) => setRefreshToken(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              style={inputStyle}
            />
          </label>
          <div style={rowStyle}>
            <button
              type="button"
              style={
                token.trim() === ""
                  ? { ...buttonStyle, opacity: 0.5, cursor: "not-allowed" }
                  : buttonStyle
              }
              disabled={token.trim() === ""}
              onClick={applySession}
            >
              Apply session
            </button>
            <button type="button" style={buttonStyle} onClick={reloadPreview}>
              Reload preview
            </button>
            <button
              type="button"
              style={buttonStyle}
              onClick={() => setShowSession(false)}
            >
              Close
            </button>
          </div>
          {sessionNotice === null ? null : (
            <div
              style={{
                color: sessionError ? "#fca5a5" : "#86efac",
                lineHeight: 1.45,
              }}
            >
              {sessionNotice}
            </div>
          )}
          <div style={{ opacity: 0.6, lineHeight: 1.45 }}>
            Applied through the host <code>session</code> message. Tokens stay in
            memory and are redacted from the log. Reload to return to browser
            device auth.
          </div>
        </div>
      ) : null}

      <div style={logStyle}>
        {entries.length === 0 ? (
          <span style={{ opacity: 0.55 }}>
            Waiting for the game to send <code>ready</code>…
          </span>
        ) : (
          entries.slice(-30).map((entry) => (
            <div key={entry.id} style={{ display: "flex", gap: 6, lineHeight: 1.4 }}>
              <span style={{ color: directionColor(entry), flex: "0 0 auto" }}>
                {entry.direction}
              </span>
              <span style={{ flex: 1, minWidth: 0, wordBreak: "break-word" }}>
                {entry.label}
                {payloadText(entry) === "" ? null : (
                  <>
                    {" "}
                    <span style={{ opacity: 0.62 }}>{payloadText(entry)}</span>
                  </>
                )}
              </span>
            </div>
          ))
        )}
      </div>

      <div style={{ opacity: 0.55, lineHeight: 1.5 }}>
        The bundle is running in host mode without a native WebView. Host
        messages, theme changes, session injection, lifecycle events, and
        outgoing bridge messages are logged here; session tokens are redacted.
      </div>
    </aside>
  );
}
