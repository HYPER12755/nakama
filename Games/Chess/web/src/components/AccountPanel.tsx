import { useEffect, useState, type FormEvent } from "react";
import type { OnlineChessController } from "../hooks/useOnlineChess";
import {
  validateEmail,
  validatePassword,
  validateUsername,
} from "../lib/auth";
import { Icon } from "./Icon";

type AuthView = "summary" | "sign-in" | "sign-up";

export interface AccountPanelProps {
  controller: OnlineChessController;
}

export function AccountPanel({ controller }: AccountPanelProps) {
  const [view, setView] = useState<AuthView>("summary");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [username, setUsername] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    account,
    authBusy,
    authError,
    authNotice,
    signIn,
    signUp,
    signOut,
    clearAuthFeedback,
  } = controller;

  const feedback = formError ?? authError;

  useEffect(() => {
    if (account?.kind === "email" || account?.kind === "host") {
      setView("summary");
      setPassword("");
      setConfirmPassword("");
    }
  }, [account?.kind]);

  const openView = (next: AuthView) => {
    setView(next);
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setFormError(null);
    clearAuthFeedback();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    clearAuthFeedback();

    const emailError = validateEmail(email);
    if (emailError !== null) {
      setFormError(emailError);
      return;
    }

    if (view === "sign-in") {
      if (password.length === 0) {
        setFormError("Enter your password.");
        return;
      }
      await signIn(email, password);
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError !== null) {
      setFormError(passwordError);
      return;
    }
    if (confirmPassword !== password) {
      setFormError("The passwords do not match.");
      return;
    }
    const usernameError = validateUsername(username);
    if (usernameError !== null) {
      setFormError(usernameError);
      return;
    }
    await signUp(email, password, username);
  };

  if (view === "summary") {
    return (
      <section className="panel account-panel">
        <div className="panel-heading">
          <h2>Account</h2>
          <span
            className={`account-state account-state--${
              account?.kind ?? "offline"
            }`}
          >
            {account?.kind === "email"
              ? "Synced"
              : account?.kind === "host"
                ? "Shared"
                : account?.kind === "guest"
                  ? "Guest"
                  : "Offline"}
          </span>
        </div>

        <div className="account-identity">
          <span className="account-avatar" aria-hidden="true">
            <Icon
              name={account?.kind === "guest" ? "user" : "shield-check"}
              size={19}
            />
          </span>
          <div className="account-identity__text">
            <strong>{account?.username ?? "Not connected"}</strong>
            <span>
              {account?.kind === "email"
                ? account.email
                : account?.kind === "host"
                  ? "MoonGames account shared by verified games"
                  : account?.kind === "guest"
                    ? "Progress is saved on this device only"
                    : "Connect to manage your account"}
            </span>
          </div>
        </div>

        {(account === null || account.kind === "guest") && (
          <>
            <p className="account-copy">
              {account === null
                ? "Sign in or create an account to sync your games and rating."
                : "Create an account to keep your rating, games, and name when you switch devices."}
            </p>
            <div className="account-actions">
              <button
                type="button"
                className="action-button action-button--primary"
                onClick={() => openView("sign-up")}
              >
                Create account
              </button>
              <button
                type="button"
                className="action-button"
                onClick={() => openView("sign-in")}
              >
                Sign in
              </button>
            </div>
          </>
        )}

        {account?.kind === "email" && (
          <button
            type="button"
            className="action-button action-button--quiet account-signout"
            onClick={() => void signOut()}
            disabled={authBusy}
          >
            <Icon name="logout" size={16} />
            {authBusy ? "Signing out…" : "Sign out"}
          </button>
        )}

        {authNotice !== null && (
          <p className="account-feedback account-feedback--success" role="status">
            {authNotice}
          </p>
        )}
        {authError !== null && (
          <p className="account-feedback account-feedback--error" role="alert">
            {authError}
          </p>
        )}
      </section>
    );
  }

  const signingUp = view === "sign-up";
  return (
    <section className="panel account-panel account-panel--form">
      <form
        className="auth-form"
        onSubmit={(event) => void submit(event)}
        noValidate
      >
        <div className="auth-form__heading">
          <button
            type="button"
            className="auth-back"
            onClick={() => openView("summary")}
            aria-label="Back to account"
            title="Back"
          >
            <Icon name="arrow-left" size={17} />
          </button>
          <div>
            <p className="auth-form__kicker">
              {signingUp ? "Keep your progress" : "Welcome back"}
            </p>
            <h2>{signingUp ? "Create account" : "Sign in"}</h2>
          </div>
        </div>

        <p className="auth-form__intro">
          {signingUp
            ? "Your guest rating, history, and player name stay with this account."
            : "Use the email and password for your MoonGames account."}
        </p>

        <label className="auth-field">
          <span className="auth-field__label">Email</span>
          <span className="auth-field__control">
            <Icon name="mail" size={17} />
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="you@example.com"
              disabled={authBusy}
              required
            />
          </span>
        </label>

        {signingUp && (
          <label className="auth-field">
            <span className="auth-field__label">
              Player name <span>optional</span>
            </span>
            <span className="auth-field__control">
              <Icon name="user" size={17} />
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="3–20 letters or numbers"
                maxLength={20}
                disabled={authBusy}
              />
            </span>
          </label>
        )}

        <label className="auth-field">
          <span className="auth-field__label">Password</span>
          <span className="auth-field__control">
            <Icon name="lock" size={17} />
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={signingUp ? "new-password" : "current-password"}
              placeholder={signingUp ? "8+ characters" : "Your password"}
              minLength={signingUp ? 8 : undefined}
              disabled={authBusy}
              required
            />
            <button
              type="button"
              className="auth-visibility"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
            >
              <Icon name={showPassword ? "eye-off" : "eye"} size={17} />
            </button>
          </span>
        </label>

        {signingUp && (
          <>
            <p className="auth-hint">
              Use at least 8 characters with one letter and one number.
            </p>
            <label className="auth-field">
              <span className="auth-field__label">Confirm password</span>
              <span className="auth-field__control">
                <Icon name="lock" size={17} />
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  placeholder="Repeat your password"
                  minLength={8}
                  disabled={authBusy}
                  required
                />
              </span>
            </label>
          </>
        )}

        {feedback !== null && (
          <p className="account-feedback account-feedback--error" role="alert">
            {feedback}
          </p>
        )}

        <button
          type="submit"
          className="action-button action-button--primary auth-submit"
          disabled={authBusy}
        >
          {authBusy && <span className="auth-spinner" aria-hidden="true" />}
          {authBusy
            ? signingUp
              ? "Creating account…"
              : "Signing in…"
            : signingUp
              ? "Create account"
              : "Sign in"}
        </button>

        <p className="auth-switch">
          {signingUp ? "Already have an account?" : "New to MoonGames?"}{" "}
          <button
            type="button"
            className="text-button"
            onClick={() => openView(signingUp ? "sign-in" : "sign-up")}
            disabled={authBusy}
          >
            {signingUp ? "Sign in" : "Create one"}
          </button>
        </p>
      </form>
    </section>
  );
}
