import { useEffect, useRef, useState } from "react";
import type { SocialFriend } from "@moongames/game-sdk";
import { Icon } from "./Icon";

export interface FriendInviteDialogProps {
  open: boolean;
  matchId: string;
  spectate: boolean;
  friends: SocialFriend[];
  loading: boolean;
  loadError: string | null;
  sendingId: string | null;
  inviteError: string | null;
  inviteNotice: string | null;
  onClose: () => void;
  onRetry: () => void;
  onInvite: (friend: SocialFriend) => Promise<boolean>;
  onCopyInvite: () => void;
}

function initials(friend: SocialFriend): string {
  const source = friend.displayName ?? friend.username;
  const parts = source.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function FriendInviteDialog({
  open,
  matchId,
  spectate,
  friends,
  loading,
  loadError,
  sendingId,
  inviteError,
  inviteNotice,
  onClose,
  onRetry,
  onInvite,
  onCopyInvite,
}: FriendInviteDialogProps) {
  const [sentIds, setSentIds] = useState<Set<string>>(() => new Set());
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setSentIds(new Set());
    closeRef.current?.focus();
  }, [open, matchId]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const invite = async (friend: SocialFriend) => {
    if (sentIds.has(friend.userId) || sendingId !== null) {
      return;
    }
    const sent = await onInvite(friend);
    if (sent) {
      setSentIds((current) => {
        const next = new Set(current);
        next.add(friend.userId);
        return next;
      });
    }
  };

  return (
    <div
      className="friend-invite-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="friend-invite-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="friend-invite-title"
      >
        <div className="friend-invite-heading">
          <div className="friend-invite-heading-icon" aria-hidden="true">
            <Icon name="user" size={20} />
          </div>
          <div>
            <h3 id="friend-invite-title">
              {spectate ? "Invite a friend to watch" : "Invite a friend"}
            </h3>
            <p>
              {spectate
                ? "They will join the live room as a spectator."
                : "They will get a MoonGames invite for this private room."}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="friend-invite-close"
            onClick={onClose}
            aria-label="Close friend invitations"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {inviteNotice !== null && (
          <div className="friend-invite-banner friend-invite-banner--success">
            <Icon name="check" size={15} />
            <span>{inviteNotice}</span>
          </div>
        )}
        {inviteError !== null && (
          <div className="friend-invite-banner friend-invite-banner--error">
            <span>{inviteError}</span>
          </div>
        )}

        <div className="friend-invite-list" aria-live="polite">
          {loading && friends.length === 0 ? (
            <div className="friend-invite-empty">
              <span className="friend-invite-spinner" aria-hidden="true" />
              <p>Loading your MoonGames friends…</p>
            </div>
          ) : loadError !== null ? (
            <div className="friend-invite-empty">
              <p>{loadError}</p>
              <button type="button" className="mini-button" onClick={onRetry}>
                Try again
              </button>
            </div>
          ) : friends.length === 0 ? (
            <div className="friend-invite-empty">
              <div className="friend-invite-empty-icon" aria-hidden="true">
                <Icon name="user" size={22} />
              </div>
              <p>No MoonGames friends yet.</p>
              <span>
                Add friends from the MoonGames menu, or share the private room
                link instead.
              </span>
            </div>
          ) : (
            friends.map((friend) => {
              const sent = sentIds.has(friend.userId);
              const sending = sendingId === friend.userId;
              return (
                <div key={friend.userId} className="friend-invite-row">
                  <span className="friend-invite-avatar" aria-hidden="true">
                    {friend.avatarUrl ? (
                      <img src={friend.avatarUrl} alt="" />
                    ) : (
                      initials(friend)
                    )}
                  </span>
                  <span className="friend-invite-name">
                    <strong>{friend.displayName ?? friend.username}</strong>
                    <span>@{friend.username}</span>
                  </span>
                  <button
                    type="button"
                    className={`mini-button${sent ? " mini-button--sent" : ""}`}
                    onClick={() => void invite(friend)}
                    disabled={sent || sendingId !== null}
                  >
                    {sent ? "Invite sent" : sending ? "Sending…" : "Invite"}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="friend-invite-footer">
          <button type="button" className="text-button" onClick={onCopyInvite}>
            Copy room invite link
          </button>
          <span>Match {matchId.slice(0, 8)}</span>
        </div>
      </div>
    </div>
  );
}
