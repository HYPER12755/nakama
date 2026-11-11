import { useState } from "react";
import type { OnlineChessController } from "../hooks/useOnlineChess";
import type {
  OnlineHistoryEntry,
  OnlineLeaderboardEntry,
} from "../lib/onlineProtocol";
import { ReplayDialog } from "./ReplayDialog";

export interface ProfilePanelProps {
  controller: OnlineChessController;
}

function resultLabel(outcome: OnlineHistoryEntry["outcome"]): string {
  switch (outcome) {
    case "win":
      return "Win";
    case "loss":
      return "Loss";
    case "draw":
      return "Draw";
    default:
      return "Abandoned";
  }
}

function resultShort(outcome: OnlineHistoryEntry["outcome"]): string {
  switch (outcome) {
    case "win":
      return "W";
    case "loss":
      return "L";
    case "draw":
      return "D";
    default:
      return "—";
  }
}

function formatDate(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return "Unknown date";
  }
  return new Date(milliseconds).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function timeControlLabel(entry: OnlineHistoryEntry): string {
  const minutes = Math.round(entry.timeControl.initialMs / 60000);
  const increment = Math.round(entry.timeControl.incrementMs / 1000);
  return `${minutes}+${increment}`;
}

function ratingChange(entry: OnlineHistoryEntry): string {
  if (!entry.rated) {
    return "Casual";
  }
  if (entry.outcome === "abandoned") {
    return "No rating";
  }
  const delta = Math.round(entry.ratingDelta);
  return `${delta > 0 ? "+" : ""}${delta}`;
}

function leaderboardRow(
  entry: OnlineLeaderboardEntry,
  currentUserId: string | undefined,
) {
  const isMe = currentUserId !== undefined && entry.userId === currentUserId;
  return (
    <li
      key={entry.userId}
      className={`leaderboard-row${isMe ? " leaderboard-row--me" : ""}`}
      title={
        entry.metadata?.games !== undefined
          ? `${entry.metadata.games} games played`
          : undefined
      }
    >
      <span className="leaderboard-rank">#{entry.rank}</span>
      <span className="leaderboard-name">
        {entry.username}
        {isMe && <span className="leaderboard-you">you</span>}
      </span>
      <span className="leaderboard-score">{entry.rating}</span>
    </li>
  );
}

export function ProfilePanel({ controller }: ProfilePanelProps) {
  const [replayEntry, setReplayEntry] = useState<OnlineHistoryEntry | null>(
    null,
  );
  const {
    connection,
    session,
    profile,
    history,
    leaderboard,
    myLeaderboard,
    profileLoading,
    profileError,
    refreshProfile,
  } = controller;

  if (connection !== "connected") {
    return null;
  }

  const currentUserId = session?.userId;
  const meInTop =
    myLeaderboard !== null &&
    leaderboard.some((entry) => entry.userId === myLeaderboard.userId);
  const recent = history.slice(0, 5);

  return (
    <section className="panel profile-panel">
      <div className="panel-heading">
        <h2>Profile</h2>
        <span className="profile-state">
          {profileLoading
            ? "Updating…"
            : profile
              ? `Rating ${profile.rating}`
              : "Unavailable"}
        </span>
      </div>

      {profileError !== null && (
        <div className="profile-error" role="status">
          <span>{profileError}</span>
          <button type="button" className="mini-button" onClick={refreshProfile}>
            Retry
          </button>
        </div>
      )}

      {profile === null ? (
        <p className="empty-state">
          {profileLoading
            ? "Loading your Chess profile…"
            : "Your profile is unavailable right now."}
        </p>
      ) : (
        <>
          <div className="profile-summary">
            <div className="profile-rating">
              <strong>{profile.rating}</strong>
              <span>Rating</span>
            </div>
            <div className="profile-stats">
              <div className="profile-stat">
                <strong>{profile.games}</strong>
                <span>Games</span>
              </div>
              <div className="profile-stat">
                <strong>{profile.wins}</strong>
                <span>Wins</span>
              </div>
              <div className="profile-stat">
                <strong>{profile.losses}</strong>
                <span>Losses</span>
              </div>
              <div className="profile-stat">
                <strong>{profile.draws}</strong>
                <span>Draws</span>
              </div>
            </div>
          </div>

          <p className="profile-note">
            {profile.games === 0
              ? "Quick matches are rated. Private matches count toward your record but not your rating."
              : `Peak ${profile.peakRating} · ${profile.ratedGames} rated / ${profile.casualGames} casual`}
          </p>

          <div className="profile-section">
            <div className="profile-section-heading">
              <h3>Leaderboard</h3>
              <span>{leaderboard.length > 0 ? `Top ${leaderboard.length}` : "—"}</span>
            </div>
            {leaderboard.length === 0 ? (
              <p className="empty-state">
                No rating records yet. Play a quick match to enter.
              </p>
            ) : (
              <ul className="leaderboard-list">
                {leaderboard.map((entry) =>
                  leaderboardRow(entry, currentUserId),
                )}
                {myLeaderboard !== null && !meInTop && (
                  <>
                    <li className="leaderboard-divider" aria-hidden="true" />
                    {leaderboardRow(myLeaderboard, currentUserId)}
                  </>
                )}
              </ul>
            )}
            {myLeaderboard === null && leaderboard.length > 0 && (
              <p className="empty-state">
                Play a quick match to enter the rating leaderboard.
              </p>
            )}
          </div>

          <div className="profile-section">
            <div className="profile-section-heading">
              <h3>Recent games</h3>
              <span>{history.length > 0 ? `${history.length} saved` : "—"}</span>
            </div>
            {recent.length === 0 ? (
              <p className="empty-state">Your completed games will appear here.</p>
            ) : (
              <ul className="history-list">
                {recent.map((entry) => (
                  <li
                    key={entry.matchId}
                    className={`history-row history-row--${entry.outcome}`}
                    title={`${resultLabel(entry.outcome)}${
                      entry.reason
                        ? ` by ${entry.reason.replace(/_/g, " ")}`
                        : ""
                    }`}
                  >
                    <span className="history-result">
                      {resultShort(entry.outcome)}
                    </span>
                    <div className="history-main">
                      <span className="history-opponent">
                        {entry.outcome === "abandoned"
                          ? "Abandoned game"
                          : `${resultLabel(entry.outcome)} vs ${entry.opponent.username}`}
                      </span>
                      <span className="history-meta">
                        {entry.mode === "private" ? "Private" : "Quick"} ·{" "}
                        {timeControlLabel(entry)} · {formatDate(entry.endedAt)}
                      </span>
                    </div>
                    <span
                      className={`history-delta${entry.rated && entry.ratingDelta > 0 ? " history-delta--up" : ""}${entry.rated && entry.ratingDelta < 0 ? " history-delta--down" : ""}`}
                    >
                      {ratingChange(entry)}
                    </span>
                    <button
                      type="button"
                      className="mini-button history-replay"
                      onClick={() => setReplayEntry(entry)}
                      disabled={
                        entry.moves === 0 &&
                        (entry.pgn ?? "").trim().length === 0
                      }
                    >
                      Replay
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {replayEntry !== null && (
        <ReplayDialog
          entry={replayEntry}
          onClose={() => setReplayEntry(null)}
        />
      )}
    </section>
  );
}
