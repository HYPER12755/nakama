import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { LauncherSocialController } from "../hooks/useLauncherSocial";
import {
  acceptedFriends,
  chatPreview,
  formatChatTime,
  friendDisplayName,
  type LauncherFriend,
  type SocialMessage,
} from "../lib/social";
import { Icon } from "./Icon";

export type AccountDrawerTab = "account" | "friends" | "chats";

interface AccountDrawerProps {
  open: boolean;
  tab: AccountDrawerTab;
  onTabChange: (tab: AccountDrawerTab) => void;
  onClose: () => void;
  social: LauncherSocialController;
}

function avatarInitial(name: string | undefined): string {
  const first = name?.trim().charAt(0).toUpperCase();
  return first !== undefined && first.length > 0 ? first : "M";
}

function accountLabel(social: LauncherSocialController): string {
  if (social.connection === "connecting") {
    return "Connecting";
  }
  if (social.connection === "error") {
    return "Offline";
  }
  if (social.connection === "offline") {
    return "Offline";
  }
  return social.account?.kind === "email" ? "MoonGames account" : "Guest";
}

export function AccountDrawer({
  open,
  tab,
  onTabChange,
  onClose,
  social,
}: AccountDrawerProps) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  const name = social.account?.username ?? "MoonGames";
  const connected = social.connection === "online";

  return (
    <div
      className="account-layer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <aside
        className="account-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="MoonGames account and friends"
      >
        <header className="account-drawer__header">
          <div className="account-identity">
            <span className="account-avatar" aria-hidden="true">
              {avatarInitial(social.account?.username)}
            </span>
            <span className="account-identity__copy">
              <strong>{name}</strong>
              <span>
                <span
                  className={`account-presence account-presence--${connected ? "online" : social.connection === "connecting" ? "pending" : "offline"}`}
                  aria-hidden="true"
                />
                {accountLabel(social)}
              </span>
            </span>
          </div>
          <button
            className="account-icon-button"
            type="button"
            aria-label="Close account panel"
            onClick={onClose}
          >
            <Icon name="x" size={18} />
          </button>
        </header>

        <nav className="account-tabs" aria-label="Account sections">
          <button
            type="button"
            className={tab === "account" ? "account-tab account-tab--active" : "account-tab"}
            aria-current={tab === "account" ? "page" : undefined}
            onClick={() => onTabChange("account")}
          >
            <Icon name="user" size={16} />
            Account
          </button>
          <button
            type="button"
            className={tab === "friends" ? "account-tab account-tab--active" : "account-tab"}
            aria-current={tab === "friends" ? "page" : undefined}
            onClick={() => onTabChange("friends")}
          >
            <Icon name="users" size={16} />
            Friends
            {social.incoming.length > 0 ? (
              <span className="account-tab__badge">{social.incoming.length}</span>
            ) : null}
          </button>
          <button
            type="button"
            className={tab === "chats" ? "account-tab account-tab--active" : "account-tab"}
            aria-current={tab === "chats" ? "page" : undefined}
            onClick={() => onTabChange("chats")}
          >
            <Icon name="chat" size={16} />
            Messages
            {social.unreadTotal > 0 ? (
              <span className="account-tab__badge">{social.unreadTotal}</span>
            ) : null}
          </button>
        </nav>

        <div className="account-drawer__body">
          {tab === "account" ? <AccountTab social={social} /> : null}
          {tab === "friends" ? (
            <FriendsTab social={social} onOpenChat={() => onTabChange("chats")} />
          ) : null}
          {tab === "chats" ? <ChatsTab social={social} /> : null}
        </div>
      </aside>
    </div>
  );
}

function Feedback({
  error,
  notice,
}: {
  error: string | null;
  notice: string | null;
}) {
  return (
    <>
      {error !== null ? (
        <p className="drawer-feedback drawer-feedback--error" role="alert">
          {error}
        </p>
      ) : null}
      {notice !== null ? (
        <p className="drawer-feedback drawer-feedback--notice">{notice}</p>
      ) : null}
    </>
  );
}

function AccountTab({ social }: { social: LauncherSocialController }) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-up");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const isEmail = social.account?.kind === "email";

  useEffect(() => {
    if (isEmail) {
      setPassword("");
      setUsername("");
      setShowPassword(false);
    }
  }, [isEmail]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (social.authBusy) {
      return;
    }
    if (mode === "sign-in") {
      void social.signIn(email, password);
    } else {
      void social.signUp(email, password, username);
    }
  };

  return (
    <div className="drawer-stack">
      <section className={`account-card${isEmail ? " account-card--secured" : ""}`}>
        <span className="account-card__icon" aria-hidden="true">
          <Icon name={isEmail ? "shield-check" : "sparkle"} size={22} />
        </span>
        <div>
          <span className="account-card__eyebrow">
            {isEmail ? "Protected account" : "Instant play"}
          </span>
          <h2>{isEmail ? "One account, every official game." : "Play now. Save it later."}</h2>
          <p>
            {isEmail
              ? "Your friends, messages, ratings, and progress follow you into every verified MoonGames title."
              : "You are playing as a guest. Create an account to keep your friends, chats, and progress across sessions and devices."}
          </p>
        </div>
      </section>

      {social.connection === "error" || social.connection === "offline" ? (
        <div className="drawer-offline">
          <div>
            <strong>MoonGames is offline.</strong>
            <p>{social.error ?? "Start the local stack or check your connection."}</p>
          </div>
          <button
            className="button button--ghost button--compact"
            type="button"
            onClick={() => {
              void social.connect().catch(() => undefined);
            }}
          >
            <Icon name="refresh" size={15} />
            Retry
          </button>
        </div>
      ) : null}

      {social.account !== null && social.account.kind === "email" ? (
        <section className="account-details">
          <div className="account-detail-row">
            <span>Player name</span>
            <strong>{social.account.username}</strong>
          </div>
          <div className="account-detail-row">
            <span>Email</span>
            <strong>{social.account.email}</strong>
          </div>
          <div className="account-detail-row">
            <span>Session</span>
            <strong>{social.connection === "online" ? "Connected" : "Cached"}</strong>
          </div>
          <button
            className="button button--ghost account-signout"
            type="button"
            disabled={social.authBusy}
            onClick={() => {
              void social.signOut();
            }}
          >
            <Icon name="log-out" size={16} />
            {social.authBusy ? "Signing out…" : "Sign out and play as guest"}
          </button>
        </section>
      ) : (
        <section className="account-auth">
          <div className="account-form-tabs" role="tablist" aria-label="Account form">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "sign-up"}
              className={mode === "sign-up" ? "account-form-tab account-form-tab--active" : "account-form-tab"}
              onClick={() => {
                setMode("sign-up");
                social.clearFeedback();
              }}
            >
              Create account
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "sign-in"}
              className={mode === "sign-in" ? "account-form-tab account-form-tab--active" : "account-form-tab"}
              onClick={() => {
                setMode("sign-in");
                social.clearFeedback();
              }}
            >
              Sign in
            </button>
          </div>

          <form className="account-form" onSubmit={submit}>
            <label className="account-field">
              <span>Email</span>
              <span className="account-field__input">
                <Icon name="mail" size={16} />
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  disabled={social.authBusy}
                  required
                />
              </span>
            </label>
            <label className="account-field">
              <span>Password</span>
              <span className="account-field__input">
                <Icon name="lock" size={16} />
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={mode === "sign-up" ? "At least 8 characters" : "Your password"}
                  disabled={social.authBusy}
                  required
                />
                <button
                  className="account-field__toggle"
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  <Icon name={showPassword ? "eye-off" : "eye"} size={16} />
                </button>
              </span>
            </label>
            {mode === "sign-up" ? (
              <label className="account-field">
                <span>Player name <em>optional</em></span>
                <span className="account-field__input">
                  <Icon name="user" size={16} />
                  <input
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="3–20 letters, numbers, or underscores"
                    disabled={social.authBusy}
                    maxLength={20}
                  />
                </span>
              </label>
            ) : null}

            <Feedback error={social.authError} notice={social.authNotice} />

            <button
              className="button button--primary account-form__submit"
              type="submit"
              disabled={social.authBusy || social.connection !== "online"}
            >
              <Icon name={mode === "sign-in" ? "log-in" : "sparkle"} size={16} />
              {social.authBusy
                ? "Working…"
                : mode === "sign-in"
                  ? "Sign in"
                  : "Create MoonGames account"}
            </button>
          </form>
        </section>
      )}

      <section className="account-shared-note">
        <Icon name="shield-check" size={18} />
        <div>
          <strong>Shared by design</strong>
          <p>
            Games with a verified MoonGames signature always use this account.
            Independent games never receive it and keep their own sign-in.
          </p>
        </div>
      </section>

      <p className="account-server-line">
        Server <span>{social.serverLabel}</span>
      </p>
    </div>
  );
}

function FriendAvatar({ friend }: { friend: LauncherFriend }) {
  return (
    <span className="friend-avatar" aria-hidden="true">
      {avatarInitial(friendDisplayName(friend))}
      <span
        className={`friend-avatar__presence${friend.online ? " friend-avatar__presence--online" : ""}`}
      />
    </span>
  );
}

function FriendsTab({
  social,
  onOpenChat,
}: {
  social: LauncherSocialController;
  onOpenChat: () => void;
}) {
  const [username, setUsername] = useState("");
  const accepted = useMemo(() => acceptedFriends(social.friends), [social.friends]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (social.friendBusy !== null) {
      return;
    }
    void social.addFriend(username);
  };

  return (
    <div className="drawer-stack">
      <form className="add-friend" onSubmit={submit}>
        <div className="account-field">
          <label htmlFor="friend-username">Add a friend by player name</label>
          <span className="account-field__input">
            <Icon name="users" size={16} />
            <input
              id="friend-username"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Player name"
              maxLength={20}
              disabled={social.connection !== "online" || social.friendBusy !== null}
            />
            <button
              className="button button--primary button--compact add-friend__button"
              type="submit"
              disabled={
                social.connection !== "online" ||
                social.friendBusy !== null ||
                username.trim().length === 0
              }
            >
              <Icon name="plus" size={15} />
              {social.friendBusy === "add" ? "Sending…" : "Add"}
            </button>
          </span>
        </div>
      </form>

      <Feedback error={social.friendError} notice={social.friendNotice} />

      {social.connection !== "online" ? (
        <DrawerEmpty
          icon="users"
          title="Friends are offline"
          body="Reconnect to MoonGames to see your friends and requests."
        />
      ) : null}

      {social.incoming.length > 0 ? (
        <section className="friend-section">
          <div className="friend-section__heading">
            <h3>Friend requests</h3>
            <span>{social.incoming.length}</span>
          </div>
          <div className="friend-list">
            {social.incoming.map((friend) => (
              <article className="friend-row" key={friend.userId}>
                <FriendAvatar friend={friend} />
                <div className="friend-row__copy">
                  <strong>{friendDisplayName(friend)}</strong>
                  <span>{friend.username}</span>
                </div>
                <div className="friend-row__actions">
                  <button
                    className="friend-action friend-action--accept"
                    type="button"
                    aria-label={`Accept ${friend.username}`}
                    disabled={social.friendBusy !== null}
                    onClick={() => {
                      void social.acceptFriend(friend);
                    }}
                  >
                    <Icon name="check" size={16} />
                  </button>
                  <button
                    className="friend-action"
                    type="button"
                    aria-label={`Decline ${friend.username}`}
                    disabled={social.friendBusy !== null}
                    onClick={() => {
                      void social.removeFriend(friend);
                    }}
                  >
                    <Icon name="x" size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="friend-section">
        <div className="friend-section__heading">
          <h3>Friends</h3>
          <span>{accepted.length}</span>
        </div>
        {accepted.length === 0 ? (
          <DrawerEmpty
            icon="users"
            title="Your table is open"
            body="Add a player by their MoonGames name. Friends can message you, and you will see when they are online."
          />
        ) : (
          <div className="friend-list">
            {accepted.map((friend) => (
              <article className="friend-row" key={friend.userId}>
                <FriendAvatar friend={friend} />
                <div className="friend-row__copy">
                  <strong>{friendDisplayName(friend)}</strong>
                  <span>
                    {friend.online
                      ? "Online now"
                      : social.unread[friend.userId] > 0
                        ? `${social.unread[friend.userId]} new message${social.unread[friend.userId] === 1 ? "" : "s"}`
                        : "Offline"}
                  </span>
                </div>
                <div className="friend-row__actions">
                  <button
                    className="friend-action friend-action--message"
                    type="button"
                    aria-label={`Message ${friend.username}`}
                    onClick={() => {
                      void social.openChat(friend);
                      onOpenChat();
                    }}
                  >
                    <Icon name="chat" size={16} />
                  </button>
                  <button
                    className="friend-action"
                    type="button"
                    aria-label={`Remove ${friend.username}`}
                    disabled={social.friendBusy !== null}
                    onClick={() => {
                      if (window.confirm(`Remove ${friend.username} from your friends?`)) {
                        void social.removeFriend(friend);
                      }
                    }}
                  >
                    <Icon name="x" size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {social.outgoing.length > 0 ? (
        <section className="friend-section">
          <div className="friend-section__heading">
            <h3>Sent requests</h3>
            <span>{social.outgoing.length}</span>
          </div>
          <div className="friend-list">
            {social.outgoing.map((friend) => (
              <article className="friend-row friend-row--pending" key={friend.userId}>
                <FriendAvatar friend={friend} />
                <div className="friend-row__copy">
                  <strong>{friendDisplayName(friend)}</strong>
                  <span>Waiting for {friend.username} to accept</span>
                </div>
                <button
                  className="friend-action"
                  type="button"
                  aria-label={`Cancel request to ${friend.username}`}
                  disabled={social.friendBusy !== null}
                  onClick={() => {
                    void social.removeFriend(friend);
                  }}
                >
                  <Icon name="x" size={16} />
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ChatsTab({ social }: { social: LauncherSocialController }) {
  const accepted = useMemo(() => acceptedFriends(social.friends), [social.friends]);
  const ordered = useMemo(() => {
    return [...accepted].sort((left, right) => {
      const leftLast = social.conversations[left.userId]?.at(-1)?.createdAt ?? 0;
      const rightLast = social.conversations[right.userId]?.at(-1)?.createdAt ?? 0;
      if (leftLast !== rightLast) {
        return rightLast - leftLast;
      }
      if (left.online !== right.online) {
        return left.online ? -1 : 1;
      }
      return friendDisplayName(left).localeCompare(friendDisplayName(right));
    });
  }, [accepted, social.conversations]);

  if (social.activeFriend !== null) {
    return <Conversation social={social} friend={social.activeFriend} />;
  }

  return (
    <div className="drawer-stack">
      {social.chatError !== null ? (
        <p className="drawer-feedback drawer-feedback--error" role="alert">
          {social.chatError}
        </p>
      ) : null}
      {ordered.length === 0 ? (
        <DrawerEmpty
          icon="chat"
          title="No messages yet"
          body="Add a friend, then open a personal chat. Messages are saved to your MoonGames account."
        />
      ) : (
        <div className="conversation-list">
          {ordered.map((friend) => {
            const messages = social.conversations[friend.userId] ?? [];
            const unread = social.unread[friend.userId] ?? 0;
            return (
              <button
                className="conversation-row"
                type="button"
                key={friend.userId}
                onClick={() => {
                  void social.openChat(friend);
                }}
              >
                <FriendAvatar friend={friend} />
                <span className="conversation-row__copy">
                  <span className="conversation-row__topline">
                    <strong>{friendDisplayName(friend)}</strong>
                    <small>
                      {messages.length === 0
                        ? ""
                        : formatChatTime(messages[messages.length - 1].createdAt)}
                    </small>
                  </span>
                  <span className="conversation-row__preview">
                    {chatPreview(messages)}
                  </span>
                </span>
                {unread > 0 ? (
                  <span className="conversation-row__badge">{unread}</span>
                ) : (
                  <Icon name="chevron-right" size={16} className="conversation-row__chevron" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Conversation({
  social,
  friend,
}: {
  social: LauncherSocialController;
  friend: LauncherFriend;
}) {
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const messages = social.messages;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [friend.userId, messages.length]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = draft.trim();
    if (value.length === 0) {
      return;
    }
    void social
      .sendMessage(value)
      .then(() => setDraft(""))
      .catch(() => undefined);
  };

  return (
    <div className="conversation">
      <header className="conversation__header">
        <button
          className="account-icon-button"
          type="button"
          aria-label="Back to messages"
          onClick={social.closeChat}
        >
          <Icon name="arrow-left" size={18} />
        </button>
        <FriendAvatar friend={friend} />
        <div className="conversation__identity">
          <strong>{friendDisplayName(friend)}</strong>
          <span>{friend.online ? "Online now" : "Offline"}</span>
        </div>
      </header>

      <div className="conversation__messages" aria-live="polite">
        {social.chatBusy && messages.length === 0 ? (
          <p className="conversation__status">Loading conversation…</p>
        ) : null}
        {!social.chatBusy && messages.length === 0 ? (
          <div className="conversation__empty">
            <Icon name="chat" size={25} />
            <strong>Start the conversation</strong>
            <p>Personal messages are saved and stay with your MoonGames account.</p>
          </div>
        ) : null}
        {messages.map((message: SocialMessage) => (
          <article
            className={`chat-bubble${message.own ? " chat-bubble--own" : ""}`}
            key={message.id}
          >
            <p>{message.text}</p>
            <time dateTime={new Date(message.createdAt).toISOString()}>
              {formatChatTime(message.createdAt)}
            </time>
          </article>
        ))}
        <div ref={bottomRef} />
      </div>

      {social.chatError !== null ? (
        <p className="drawer-feedback drawer-feedback--error" role="alert">
          {social.chatError}
        </p>
      ) : null}

      <form className="chat-composer" onSubmit={submit}>
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={`Message ${friendDisplayName(friend)}`}
          maxLength={1000}
          disabled={social.connection !== "online"}
          aria-label="Message"
        />
        <button
          className="button button--primary chat-composer__send"
          type="submit"
          aria-label="Send message"
          disabled={
            social.connection !== "online" || draft.trim().length === 0
          }
        >
          <Icon name="send" size={17} />
        </button>
      </form>
    </div>
  );
}

function DrawerEmpty({
  icon,
  title,
  body,
}: {
  icon: "users" | "chat";
  title: string;
  body: string;
}) {
  return (
    <div className="drawer-empty">
      <span className="drawer-empty__icon" aria-hidden="true">
        <Icon name={icon} size={23} />
      </span>
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}
