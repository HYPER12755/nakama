import type { SVGProps } from "react";

export type IconName =
  | "ludo"
  | "users"
  | "cpu"
  | "book"
  | "volume"
  | "volume-off"
  | "sun"
  | "moon"
  | "maximize"
  | "minimize"
  | "refresh"
  | "close"
  | "trophy"
  | "sparkles"
  | "shield-check"
  | "skip-back"
  | "chevron-right"
  | "check"
  | "clock";

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

/** Ludo's icons, drawn in the same stroke language as Chess and Carrom. */
export function Icon({ name, size = 20, strokeWidth = 1.8, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {name === "ludo" && (
        <>
          <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="3.4" />
          <circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="16" cy="8" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="8" cy="16" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="16" cy="16" r="1.6" fill="currentColor" stroke="none" />
          <path d="M12 6.4v11.2M6.4 12h11.2" opacity="0.55" />
        </>
      )}
      {name === "users" && (
        <>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 19c.4-3.2 2.7-5 5.5-5s5.1 1.8 5.5 5" />
          <path d="M16 5.5a3 3 0 0 1 0 5.6M17.5 14.5c2 .6 3.1 2.2 3.4 4.5" />
        </>
      )}
      {name === "cpu" && (
        <>
          <rect x="6" y="6" width="12" height="12" rx="2.4" />
          <path d="M9.5 9.5h5v5h-5zM12 3v3M12 18v3M3 12h3M18 12h3" />
        </>
      )}
      {name === "book" && (
        <>
          <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H12v17H7.5A2.5 2.5 0 0 0 5 22Z" />
          <path d="M19 5.5A2.5 2.5 0 0 0 16.5 3H12v17h4.5a2.5 2.5 0 0 1 2.5 2Z" />
        </>
      )}
      {name === "volume" && (
        <>
          <path d="M4 9.5h3l4-3.2v11.4l-4-3.2H4Z" />
          <path d="M15 9a4.2 4.2 0 0 1 0 6M17.7 6.5a7.6 7.6 0 0 1 0 11" />
        </>
      )}
      {name === "volume-off" && (
        <>
          <path d="M4 9.5h3l4-3.2v11.4l-4-3.2H4Z" />
          <path d="m16 9.5 5 5M21 9.5l-5 5" />
        </>
      )}
      {name === "sun" && (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" />
        </>
      )}
      {name === "moon" && <path d="M20 14.4A8.5 8.5 0 0 1 9.6 4a8.5 8.5 0 1 0 10.4 10.4Z" />}
      {name === "maximize" && (
        <>
          <path d="M9 4H4v5M15 4h5v5M20 15v5h-5M4 15v5h5" />
        </>
      )}
      {name === "minimize" && (
        <>
          <path d="M4 9h5V4M20 9h-5V4M15 20v-5h5M9 20v-5H4" />
        </>
      )}
      {name === "refresh" && (
        <>
          <path d="M20 11a8 8 0 1 0-.7 4.4" />
          <path d="M20 5v6h-6" />
        </>
      )}
      {name === "close" && <path d="M6 6l12 12M18 6 6 18" />}
      {name === "trophy" && (
        <>
          <path d="M7 4h10v5a5 5 0 0 1-10 0Z" />
          <path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M12 14v4M8 20h8M9.5 18h5" />
        </>
      )}
      {name === "sparkles" && (
        <>
          <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z" />
          <path d="m18.5 15.5.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z" />
        </>
      )}
      {name === "shield-check" && (
        <>
          <path d="M12 3 5 6v5.5c0 4.4 2.9 7.9 7 9.5 4.1-1.6 7-5.1 7-9.5V6Z" />
          <path d="m9 12 2 2 4-4" />
        </>
      )}
      {name === "skip-back" && (
        <>
          <path d="M6 5v14M19 5 9 12l10 7Z" />
        </>
      )}
      {name === "chevron-right" && <path d="m9 5 7 7-7 7" />}
      {name === "check" && <path d="m5 12 4.5 4.5L19 7" />}
      {name === "clock" && (
        <>
          <circle cx="12" cy="12" r="8.4" />
          <path d="M12 7.2V12l3.2 2" />
        </>
      )}
    </svg>
  );
}
