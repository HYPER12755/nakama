import {
  type GameHistoryEntry,
  type GameLeaderboardEntry,
  type GameOutcome,
  type GameProfile,
} from "../types";

export interface ProfilePanelProps {
  connected: boolean;
  userId: string | null;
  profile: GameProfile | null;
  history: GameHistoryEntry[];
  leaderboard: GameLeaderboardEntry[];
  myLeaderboard: GameLeaderboardEntry | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onReplay?: (entry: GameHistoryEntry) => void;
  title?: string;
  emptyProfileText?: string;
  emptyHistoryText?: string;
  emptyLeaderboardText?: string;
  /** The game specific detail line under a history entry. */
  historyMeta?: (entry: GameHistoryEntry) => string;
  resultLabels?: Partial<Record<GameOutcome, string>>;
}

const DEFAULT_RESULT_LABELS: Record<GameOutcome, string> = {
  win: "Win",
  loss: "Loss",
  draw: "Draw",
  abandoned: "Abandoned",
};

const DEFAULT_RESULT_SHORT: Record<GameOutcome, string> = {
  win: "W",
  loss: "L",
  draw: "D",
  abandoned: "—",
};

function formatDate(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return "Unknown date";
  }
  return new Date(milliseconds).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function ratingChange(entry: GameHistoryEntry): string {
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
  entry: GameLeaderboardEntry,
  currentUserId: string | null,
) {
  const isMe = currentUserId !== null && entry.userId === currentUserId;
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

/**
 * The profile, rating history, and leaderboard every game shows. Titles
 * describe the counters they own, so Chess and Carrom share one panel.
 */
export function ProfilePanel({
  connected,
  userId,
  profile,
  history,
  leaderboard,
  myLeaderboard,
  loading,
  error,
  onRefresh,
  onReplay,
  title = "Profile",
  emptyProfileText = "Your rating and history appear after your first game.",
  emptyHistoryText = "Your completed games will appear here.",
  emptyLeaderboardText = "Play a quick match to enter the rating leaderboard.",
  historyMeta,
  resultLabels,
}: ProfilePanelProps) {
  if (!connected) {
    return null;
  }

  const labels = { ...DEFAULT_RESULT_LABELS, ...resultLabels };
  const shortLabels = DEFAULT_RESULT_SHORT;
  const meInTop =
    myLeaderboard !== null &&
    leaderboard.some((entry) => entry.userId === myLeaderboard.userId);
  const recent = history.slice(0, 6);

  return (
    <section className="panel profile-panel">
      <div className="panel-heading">
        <h2>{title}</h2>
        <button type="button" className="mini-button" onClick={onRefresh}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error !== null && (
        <p className="profile-error" role="alert">
          <span>{error}</span>
        </p>
      )}

      {loading && profile === null ? (
        <p className="profile-state">Loading your profile…</p>
      ) : null}

      {profile !== null ? (
        <>
          <div className="profile-summary">
            <div className="profile-rating">
              <strong>{profile.rating}</strong>
              <span>rating</span>
            </div>
            <div className="profile-stats">
              <div className="profile-stat">
                <strong>{profile.games}</strong>
                <span>games</span>
              </div>
              <div className="profile-stat">
                <strong>{profile.wins}</strong>
                <span>wins</span>
              </div>
              <div className="profile-stat">
                <strong>{profile.losses}</strong>
                <span>losses</span>
              </div>
              <div className="profile-stat">
                <strong>{profile.draws}</strong>
                <span>draws</span>
              </div>
            </div>
          </div>
          <div className="profile-stats">
            {Object.entries(profile.stats ?? {}).map(([key, value]) => (
              <div className="profile-stat" key={key}>
                <strong>{value}</strong>
                <span>{key}</span>
              </div>
            ))}
          </div>
          {profile.games === 0 ? (
            <p className="profile-note">{emptyProfileText}</p>
          ) : null}
        </>
      ) : null}

      <div className="profile-section">
        <div className="profile-section-heading">
          <h3>Leaderboard</h3>
          <span>{leaderboard.length > 0 ? `Top ${leaderboard.length}` : "—"}</span>
        </div>
        {leaderboard.length === 0 ? (
          <p className="empty-state">{emptyLeaderboardText}</p>
        ) : (
          <ul className="leaderboard-list">
            {leaderboard.map((entry) => leaderboardRow(entry, userId))}
            {myLeaderboard !== null && !meInTop && (
              <li className="leaderboard-divider" />
            )}
            {myLeaderboard !== null && !meInTop ? (
              leaderboardRow(myLeaderboard, userId)
            ) : null}
          </ul>
        )}
      </div>

      <div className="profile-section">
        <div className="profile-section-heading">
          <h3>Recent games</h3>
          <span>{history.length > 0 ? `${history.length} saved` : "—"}</span>
        </div>
        {recent.length === 0 ? (
          <p className="empty-state">{emptyHistoryText}</p>
        ) : (
          <ul className="history-list">
            {recent.map((entry) => (
              <li
                key={entry.matchId}
                className={`history-row history-row--${entry.outcome}`}
                title={`${labels[entry.outcome]}${
                  entry.reason.length > 0
                    ? ` by ${entry.reason.replace(/_/g, " ")}`
                    : ""
                }`}
              >
                <span className="history-result">
                  {shortLabels[entry.outcome]}
                </span>
                <div className="history-main">
                  <span className="history-opponent">
                    {entry.outcome === "abandoned"
                      ? "Abandoned game"
                      : `${labels[entry.outcome]} vs ${entry.opponent.username}`}
                  </span>
                  <span className="history-meta">
                    {historyMeta !== undefined
                      ? historyMeta(entry)
                      : formatDate(entry.endedAt)}
                  </span>
                </div>
                <span
                  className={`history-delta${entry.rated && entry.ratingDelta > 0 ? " history-delta--up" : ""}${entry.rated && entry.ratingDelta < 0 ? " history-delta--down" : ""}`}
                >
                  {ratingChange(entry)}
                </span>
                {onReplay !== undefined ? (
                  <button
                    type="button"
                    className="mini-button history-replay"
                    onClick={() => onReplay(entry)}
                    disabled={(entry.steps ?? []).length === 0}
                  >
                    Replay
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
