import type { CSSProperties } from "react";

export type LauncherIconName =
  | "arrow-down"
  | "arrow-left"
  | "arrow-up-right"
  | "carrom"
  | "cards"
  | "chat"
  | "check"
  | "chess"
  | "chevron-right"
  | "eye"
  | "eye-off"
  | "gamepad"
  | "link"
  | "lock"
  | "log-in"
  | "log-out"
  | "ludo"
  | "mail"
  | "moon"
  | "plus"
  | "refresh"
  | "search"
  | "send"
  | "shield-check"
  | "sparkle"
  | "sun"
  | "user"
  | "users"
  | "x";

interface IconProps {
  name: LauncherIconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
  strokeWidth?: number;
}

const gameIcons: Record<string, LauncherIconName> = {
  carrom: "carrom",
  cards: "cards",
  chess: "chess",
  ludo: "ludo",
};

export function gameIconName(id: string): LauncherIconName {
  return gameIcons[id] ?? "gamepad";
}

export function Icon({
  name,
  size = 18,
  className = "icon",
  style,
  strokeWidth = 1.8,
}: IconProps) {
  return (
    <svg
      className={className}
      style={style}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {name === "moon" && (
        <path d="M20.4 14.1A8.5 8.5 0 0 1 9.9 3.6a8.5 8.5 0 1 0 10.5 10.5Z" />
      )}
      {name === "sun" && (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </>
      )}
      {name === "arrow-down" && (
        <>
          <path d="M12 4v15" />
          <path d="m6.5 13.5 5.5 5.5 5.5-5.5" />
        </>
      )}
      {name === "arrow-up-right" && (
        <>
          <path d="M7 17 17 7" />
          <path d="M8 7h9v9" />
        </>
      )}
      {name === "search" && (
        <>
          <circle cx="10.8" cy="10.8" r="6.3" />
          <path d="m15.5 15.5 4.3 4.3" />
        </>
      )}
      {name === "users" && (
        <>
          <circle cx="9.2" cy="8" r="3.1" />
          <path d="M3.6 20a5.6 5.6 0 0 1 11.2 0" />
          <path d="M15.5 5.3a3 3 0 0 1 0 5.8M17.3 14.5A5.1 5.1 0 0 1 21 19.5" />
        </>
      )}
      {name === "user" && (
        <>
          <circle cx="12" cy="7.5" r="3.5" />
          <path d="M5 21a7 7 0 0 1 14 0" />
        </>
      )}
      {name === "sparkle" && (
        <path d="M12 3.2c.6 4.2 2.6 6.2 6.8 6.8-4.2.6-6.2 2.6-6.8 6.8-.6-4.2-2.6-6.2-6.8-6.8 4.2-.6 6.2-2.6 6.8-6.8ZM18.5 15.5c.25 1.75 1.05 2.55 2.8 2.8-1.75.25-2.55 1.05-2.8 2.8-.25-1.75-1.05-2.55-2.8-2.8 1.75-.25 2.55-1.05 2.8-2.8Z" />
      )}
      {name === "shield-check" && (
        <>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
          <path d="m8.7 11.8 2.3 2.3 4.5-4.5" />
        </>
      )}
      {name === "link" && (
        <>
          <path d="m9.5 14.5 5-5" />
          <path d="m7.3 16.7-1 .9a3.7 3.7 0 0 1-5.2-5.2l3-3a3.7 3.7 0 0 1 5.2 0" />
          <path d="m16.7 7.3 1-.9a3.7 3.7 0 0 1 5.2 5.2l-3 3a3.7 3.7 0 0 1-5.2 0" />
        </>
      )}
      {name === "chess" && (
        <>
          <path
            d="M7 20.2h10M8.1 20.2v-3.4c0-1.8.9-3.4 2.4-4.4l1.9-1.2-3-2.7 1.2-4.1c.22-.75 1.2-.9 1.63-.25l2.25 3.35 1.14 2.1c.75 1.45 1.15 3.05 1.15 4.7V20.2"
            fill="currentColor"
            fillOpacity="0.12"
          />
          <path d="M9.4 8.4 12 7.1" />
          <circle cx="12.7" cy="9.7" r=".45" fill="currentColor" stroke="none" />
        </>
      )}
      {name === "cards" && (
        <>
          <rect
            x="6.2"
            y="3.8"
            width="11.6"
            height="16.4"
            rx="2.2"
            transform="rotate(-8 12 12)"
            fill="currentColor"
            fillOpacity="0.1"
          />
          <rect
            x="6.2"
            y="3.8"
            width="11.6"
            height="16.4"
            rx="2.2"
            transform="rotate(8 12 12)"
          />
          <path
            d="M12 8.1 14 12l-2 3.9-2-3.9Z"
            fill="currentColor"
            fillOpacity="0.2"
          />
        </>
      )}
      {name === "ludo" && (
        <>
          <rect x="3.4" y="3.4" width="17.2" height="17.2" rx="3.2" />
          <path d="M12 3.4v17.2M3.4 12h17.2" />
          <circle cx="7.7" cy="7.7" r="1.5" fill="currentColor" fillOpacity="0.32" />
          <circle cx="16.3" cy="7.7" r="1.5" fill="currentColor" fillOpacity="0.16" />
          <circle cx="7.7" cy="16.3" r="1.5" fill="currentColor" fillOpacity="0.16" />
          <circle cx="16.3" cy="16.3" r="1.5" fill="currentColor" fillOpacity="0.32" />
        </>
      )}
      {name === "carrom" && (
        <>
          <circle cx="12" cy="12" r="8.4" fill="currentColor" fillOpacity="0.08" />
          <circle cx="12" cy="12" r="2.25" />
          <circle cx="8.2" cy="9.2" r="1.15" fill="currentColor" stroke="none" />
          <circle cx="15.5" cy="8.4" r="1.15" fill="currentColor" stroke="none" />
          <circle cx="15.2" cy="15.6" r="1.15" fill="currentColor" stroke="none" />
          <path d="m4.9 17.1 1.9 1.9" />
        </>
      )}
      {name === "arrow-left" && (
        <>
          <path d="M19 12H5" />
          <path d="m11 6-6 6 6 6" />
        </>
      )}
      {name === "chat" && (
        <>
          <path d="M20.5 11.4a8.1 8.1 0 0 1-8.6 8.1 8.8 8.8 0 0 1-3.4-.9L4 20l1.5-4.2a7.8 7.8 0 0 1-1.1-4.1A8.1 8.1 0 0 1 13 3.4a8.3 8.3 0 0 1 7.5 8Z" />
          <path d="M8.5 11.5h.01M12.2 11.5h.01M15.9 11.5h.01" strokeWidth="2.4" />
        </>
      )}
      {name === "check" && <path d="m5 12.5 4.4 4.4L19 7.3" />}
      {name === "chevron-right" && <path d="m9 5 7 7-7 7" />}
      {name === "x" && (
        <>
          <path d="m6 6 12 12" />
          <path d="m18 6-12 12" />
        </>
      )}
      {name === "plus" && (
        <>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </>
      )}
      {name === "send" && (
        <>
          <path d="m4 4 17 8-17 8 3.2-8Z" />
          <path d="M7.2 12H21" />
        </>
      )}
      {name === "refresh" && (
        <>
          <path d="M20 7v5h-5" />
          <path d="M4 17v-5h5" />
          <path d="M6.1 9A7 7 0 0 1 18.7 7.2L20 12M4 12l1.3 4.8A7 7 0 0 0 17.9 15" />
        </>
      )}
      {name === "log-in" && (
        <>
          <path d="M14 5h4.5A1.5 1.5 0 0 1 20 6.5v11a1.5 1.5 0 0 1-1.5 1.5H14" />
          <path d="m10 8-4 4 4 4" />
          <path d="M6 12h9" />
        </>
      )}
      {name === "log-out" && (
        <>
          <path d="M10 5H5.5A1.5 1.5 0 0 0 4 6.5v11A1.5 1.5 0 0 0 5.5 19H10" />
          <path d="M14 8l4 4-4 4" />
          <path d="M18 12H9" />
        </>
      )}
      {name === "mail" && (
        <>
          <rect x="3" y="5" width="18" height="14" rx="2.5" />
          <path d="m4 7 8 6 8-6" />
        </>
      )}
      {name === "lock" && (
        <>
          <rect x="4" y="10" width="16" height="10.5" rx="2.4" />
          <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
          <path d="M12 14v2.5" />
        </>
      )}
      {name === "eye" && (
        <>
          <path d="M2.8 12s3.3-6 9.2-6 9.2 6 9.2 6-3.3 6-9.2 6-9.2-6-9.2-6Z" />
          <circle cx="12" cy="12" r="2.6" />
        </>
      )}
      {name === "eye-off" && (
        <>
          <path d="M4 4 20 20" />
          <path d="M9.9 6.3A8.8 8.8 0 0 1 12 6c5.9 0 9.2 6 9.2 6a15.4 15.4 0 0 1-2.3 3M6.2 7.7A16 16 0 0 0 2.8 12S6.1 18 12 18a8.5 8.5 0 0 0 3.3-.7" />
          <path d="M10.2 10.2a2.6 2.6 0 0 0 3.6 3.6" />
        </>
      )}
      {name === "gamepad" && (
        <>
          <path d="M7.3 7.5h9.4a4.5 4.5 0 0 1 4.35 3.36l1.02 4.08a2.6 2.6 0 0 1-4.62 2.26L15.9 15H8.1l-1.55 2.2a2.6 2.6 0 0 1-4.62-2.26l1.02-4.08A4.5 4.5 0 0 1 7.3 7.5Z" />
          <path d="M8 11v3M6.5 12.5h3" />
          <circle cx="16.5" cy="11.5" r=".55" fill="currentColor" stroke="none" />
          <circle cx="18" cy="13.5" r=".55" fill="currentColor" stroke="none" />
        </>
      )}
    </svg>
  );
}
