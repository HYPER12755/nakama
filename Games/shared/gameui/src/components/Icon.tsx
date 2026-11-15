import type { CSSProperties } from "react";
export type IconName =
  | "arrow-left"
  | "check"
  | "chevron-left"
  | "chevron-right"
  | "close"
  | "eye"
  | "eye-off"
  | "lock"
  | "logout"
  | "mail"
  | "moon"
  | "refresh"
  | "shield-check"
  | "skip-back"
  | "smile"
  | "skip-forward"
  | "sparkle"
  | "sparkles"
  | "menu"
  | "trophy"
  | "arrow-up-right"
  | "sun"
  | "user";

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
  strokeWidth?: number;
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
      {name === "mail" && (
        <>
          <rect x="3" y="5" width="18" height="14" rx="2.5" />
          <path d="m4 7 8 6 8-6" />
        </>
      )}
      {name === "refresh" && (
        <>
          <path d="M20 11a8 8 0 1 0-2.34 5.66" />
          <path d="M20 4v7h-7" />
        </>
      )}
      {name === "lock" && (
        <>
          <rect x="4.5" y="10" width="15" height="10.5" rx="2.5" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </>
      )}
      {name === "user" && (
        <>
          <circle cx="12" cy="7.5" r="3.5" />
          <path d="M5 21a7 7 0 0 1 14 0" />
        </>
      )}
      {name === "eye" && (
        <>
          <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="2.7" />
        </>
      )}
      {name === "eye-off" && (
        <>
          <path d="m3 3 18 18" />
          <path d="M10.6 6.2A10.7 10.7 0 0 1 12 6c6 0 9.5 6 9.5 6a16.7 16.7 0 0 1-3.3 4.1M6.2 7.7A16.9 16.9 0 0 0 2.5 12s3.5 6 9.5 6a10 10 0 0 0 4-.8" />
          <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
        </>
      )}
      {name === "close" && <path d="M6 6l12 12M18 6 6 18" />}
      {name === "smile" && (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M8.6 14.1a4.1 4.1 0 0 0 6.8 0M9.2 9.6h.01M14.8 9.6h.01" />
        </>
      )}
      {name === "arrow-left" && (
        <>
          <path d="M19 12H5" />
          <path d="m11 18-6-6 6-6" />
        </>
      )}
      {name === "chevron-right" && <path d="m9 18 6-6-6-6" />}
      {name === "chevron-left" && <path d="m15 18-6-6 6-6" />}
      {name === "skip-back" && (
        <>
          <path d="M5 5v14" />
          <path d="M18 6 8.5 12 18 18V6Z" fill="currentColor" fillOpacity="0.16" />
        </>
      )}
      {name === "skip-forward" && (
        <>
          <path d="M19 5v14" />
          <path d="M6 6l9.5 6L6 18V6Z" fill="currentColor" fillOpacity="0.16" />
        </>
      )}
      {name === "logout" && (
        <>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="m16 17 5-5-5-5M21 12H9" />
        </>
      )}
      {name === "shield-check" && (
        <>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
          <path d="m9 12 2 2 4-4" />
        </>
      )}
      {name === "check" && <path d="m5 12 4 4L19 6" />}
      {name === "sparkle" && (
        <path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 17l-1.7-4.6L4.8 10.7 10.3 9 12 3.5Z" />
      )}
      {name === "arrow-up-right" && (
        <>
          <path d="M7 17 17 7" />
          <path d="M9 7h8v8" />
        </>
      )}
      {name === "sparkles" && (
        <>
          <path d="M9 4.2 10.4 8.6 14.8 10 10.4 11.4 9 15.8 7.6 11.4 3.2 10 7.6 8.6 9 4.2Z" />
          <path d="M17.5 14.2 18.3 16.8 20.9 17.6 18.3 18.4 17.5 21 16.7 18.4 14.1 17.6 16.7 16.8 17.5 14.2Z" />
        </>
      )}
      {name === "trophy" && (
        <>
          <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
          <path d="M8 5.5H5.5a2.5 2.5 0 0 0 2.5 4M16 5.5h2.5a2.5 2.5 0 0 1-2.5 4" />
          <path d="M12 13v4M9 20h6M10 17h4" />
        </>
      )}
      {name === "menu" && (
        <>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </>
      )}
    </svg>
  );
}
