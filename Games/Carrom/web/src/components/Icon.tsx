import type { SVGProps } from "react";

export type IconName =
  | "carrom"
  | "target"
  | "book"
  | "volume"
  | "volume-off"
  | "sun"
  | "moon"
  | "maximize"
  | "minimize"
  | "refresh"
  | "chevron-left"
  | "chevron-right"
  | "close"
  | "trophy"
  | "cpu"
  | "users"
  | "check"
  | "send"
  | "sparkles";

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export function Icon({
  name,
  size = 20,
  strokeWidth = 1.8,
  ...props
}: IconProps) {
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
      {name === "carrom" && (
        <>
          <circle cx="12" cy="12" r="8.6" fill="currentColor" fillOpacity="0.07" />
          <circle cx="12" cy="12" r="2.1" />
          <circle cx="8.1" cy="9.1" r="1.15" fill="currentColor" stroke="none" />
          <circle cx="15.6" cy="8.3" r="1.15" fill="currentColor" stroke="none" />
          <circle cx="15.2" cy="15.7" r="1.15" fill="currentColor" stroke="none" />
          <path d="m4.7 17.2 1.9 1.9" />
        </>
      )}
      {name === "target" && (
        <>
          <circle cx="12" cy="12" r="7.8" />
          <circle cx="12" cy="12" r="3.4" />
          <circle cx="12" cy="12" r="0.8" fill="currentColor" stroke="none" />
          <path d="M12 2.2v2.1M12 19.7v2.1M2.2 12h2.1M19.7 12h2.1" />
        </>
      )}
      {name === "book" && (
        <>
          <path d="M4.5 5.5A2.5 2.5 0 0 1 7 3h5v17H7a2.5 2.5 0 0 0-2.5 2Z" />
          <path d="M19.5 5.5A2.5 2.5 0 0 0 17 3h-5v17h5a2.5 2.5 0 0 1 2.5 2Z" />
          <path d="M8 7.5h1.5M14.5 7.5H16" />
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
          <path d="m15.5 9.5 4 5M19.5 9.5l-4 5" />
        </>
      )}
      {name === "sun" && (
        <>
          <circle cx="12" cy="12" r="3.6" />
          <path d="M12 2.5v2M12 19.5v2M4.3 4.3l1.4 1.4M18.3 18.3l1.4 1.4M2.5 12h2M19.5 12h2M4.3 19.7l1.4-1.4M18.3 5.7l1.4-1.4" />
        </>
      )}
      {name === "moon" && (
        <path d="M19.7 14.2A8.1 8.1 0 0 1 9.8 4.3 8.2 8.2 0 1 0 19.7 14.2Z" />
      )}
      {name === "maximize" && (
        <>
          <path d="M8 3.5H4.5V7M16 3.5h3.5V7M8 20.5H4.5V17M16 20.5h3.5V17" />
        </>
      )}
      {name === "minimize" && (
        <>
          <path d="M4.5 8H8V4.5M19.5 8H16V4.5M4.5 16H8v3.5M19.5 16H16v3.5" />
        </>
      )}
      {name === "refresh" && (
        <>
          <path d="M20 11a8 8 0 0 0-14.6-4.4L4 9" />
          <path d="M4 4v5h5M4 13a8 8 0 0 0 14.6 4.4L20 15" />
          <path d="M20 20v-5h-5" />
        </>
      )}
      {name === "chevron-left" && <path d="m14.5 5.5-6.5 6.5 6.5 6.5" />}
      {name === "chevron-right" && <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />}
      {name === "close" && <path d="m6 6 12 12M18 6 6 18" />}
      {name === "trophy" && (
        <>
          <path d="M8 4h8v5.5a4 4 0 0 1-8 0Z" />
          <path d="M8 6H4.5v1.5A3.5 3.5 0 0 0 8 11M16 6h3.5v1.5A3.5 3.5 0 0 1 16 11" />
          <path d="M12 13.5V18M8.5 21h7M10 18h4" />
        </>
      )}
      {name === "cpu" && (
        <>
          <rect x="6.5" y="6.5" width="11" height="11" rx="2.5" />
          <path d="M9.5 9.5h5v5h-5zM9.5 2.5v4M14.5 2.5v4M9.5 17.5v4M14.5 17.5v4M2.5 9.5h4M2.5 14.5h4M17.5 9.5h4M17.5 14.5h4" />
        </>
      )}
      {name === "users" && (
        <>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 5.2a3.2 3.2 0 0 1 0 5.6M17.5 14.4A5.5 5.5 0 0 1 21 20" />
        </>
      )}
      {name === "check" && <path d="m5 12.5 4.4 4.4L19 7.3" />}
      {name === "send" && (
        <>
          <path d="M20.5 3.5 10.8 13.2" />
          <path d="M20.5 3.5 14.2 20.5l-3.4-7.3-7.3-3.4Z" />
        </>
      )}
      {name === "sparkles" && (
        <>
          <path d="M12 3 13.4 7.1 17.5 8.5 13.4 9.9 12 14 10.6 9.9 6.5 8.5 10.6 7.1Z" />
          <path d="M18.5 14 19.3 16.2 21.5 17 19.3 17.8 18.5 20 17.7 17.8 15.5 17 17.7 16.2Z" />
          <path d="M5 14 5.7 15.8 7.5 16.5 5.7 17.2 5 19 4.3 17.2 2.5 16.5 4.3 15.8Z" />
        </>
      )}
    </svg>
  );
}
