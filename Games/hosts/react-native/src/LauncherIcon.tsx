import React from "react";
import Svg, { Circle, Path, Rect } from "react-native-svg";

export type LauncherIconName =
  | "arrow-left"
  | "arrow-right"
  | "board"
  | "cards"
  | "carrom"
  | "check"
  | "chess"
  | "close"
  | "ludo"
  | "offline"
  | "refresh"
  | "search"
  | "shield"
  | "spark"
  | "users"
  | "wifi";

interface LauncherIconProps {
  name: LauncherIconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/**
 * Compact line icons shared by the native menu. Game ids map to these stable
 * keys; no platform emoji or font glyphs are used for controls.
 */
export function LauncherIcon({
  name,
  size = 20,
  color = "#ffffff",
  strokeWidth = 1.8,
}: LauncherIconProps) {
  const stroke = {
    stroke: color,
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {name === "search" ? (
        <>
          <Circle cx="10.8" cy="10.8" r="6.2" {...stroke} />
          <Path d="M15.4 15.4L20 20" {...stroke} />
        </>
      ) : null}
      {name === "shield" ? (
        <>
          <Path
            d="M12 2.8l7 3v5.1c0 4.4-2.9 7.8-7 9.3-4.1-1.5-7-4.9-7-9.3V5.8l7-3z"
            {...stroke}
          />
          <Path d="M8.7 11.8l2.1 2.1 4.5-4.7" {...stroke} />
        </>
      ) : null}
      {name === "arrow-right" ? (
        <Path d="M4.5 12h14M13 6.5l5.5 5.5L13 17.5" {...stroke} />
      ) : null}
      {name === "arrow-left" ? (
        <Path d="M19.5 12h-14M11 6.5L5.5 12l5.5 5.5" {...stroke} />
      ) : null}
      {name === "refresh" ? (
        <>
          <Path d="M19.7 10.4A8 8 0 1 0 18 16.8" {...stroke} />
          <Path d="M20 4.7v5.7h-5.7" {...stroke} />
        </>
      ) : null}
      {name === "spark" ? (
        <Path
          d="M12 2.8l1.8 5.4 5.4 1.8-5.4 1.8L12 17.2l-1.8-5.4L4.8 10l5.4-1.8L12 2.8z"
          {...stroke}
        />
      ) : null}
      {name === "users" ? (
        <>
          <Circle cx="9" cy="8.7" r="3.2" {...stroke} />
          <Path d="M3.6 20c.6-3.4 2.7-5.4 5.4-5.4s4.8 2 5.4 5.4" {...stroke} />
          <Path d="M15.3 6.7a3.2 3.2 0 0 1 0 6M16.7 14.9c2.2.5 3.5 2.3 4 5.1" {...stroke} />
        </>
      ) : null}
      {name === "wifi" ? (
        <>
          <Path d="M3.5 9.2a13 13 0 0 1 17 0" {...stroke} />
          <Path d="M6.4 12.4a9 9 0 0 1 11.2 0" {...stroke} />
          <Path d="M9.4 15.7a4.8 4.8 0 0 1 5.2 0" {...stroke} />
          <Circle cx="12" cy="19" r="0.9" fill={color} />
        </>
      ) : null}
      {name === "offline" ? (
        <>
          <Path d="M4.2 10a13 13 0 0 1 5-2.7M14.8 7.3a13 13 0 0 1 5.7 2" {...stroke} />
          <Path d="M6.8 13a9 9 0 0 1 3.2-1.3M14 11.7a9 9 0 0 1 3.6 1.3" {...stroke} />
          <Path d="M9.6 16a4.8 4.8 0 0 1 4.8 0" {...stroke} />
          <Circle cx="12" cy="19" r="0.9" fill={color} />
          <Path d="M4 4l16 16" {...stroke} />
        </>
      ) : null}
      {name === "close" ? (
        <Path d="M5.5 5.5l13 13M18.5 5.5l-13 13" {...stroke} />
      ) : null}
      {name === "check" ? <Path d="M4.5 12.5l4.5 4.5L19.5 6.5" {...stroke} /> : null}
      {name === "chess" ? (
        <>
          <Path d="M7.8 20h8.4M9 17h6l-1-4.8h-4L9 17z" {...stroke} />
          <Path d="M11.6 12.2l2.1-2.9-1.8-1.2-2.8 3.5" {...stroke} />
          <Circle cx="12.7" cy="6.6" r="1.1" {...stroke} />
        </>
      ) : null}
      {name === "cards" ? (
        <>
          <Rect x="4" y="7" width="9.5" height="13" rx="2" {...stroke} />
          <Rect x="10.5" y="4" width="9.5" height="13" rx="2" {...stroke} />
          <Path d="M15.2 8.3l1.3 1.3-2.5 2.6" {...stroke} />
        </>
      ) : null}
      {name === "ludo" ? (
        <>
          <Circle cx="7" cy="7" r="2.8" {...stroke} />
          <Circle cx="17" cy="7" r="2.8" {...stroke} />
          <Circle cx="7" cy="17" r="2.8" {...stroke} />
          <Circle cx="17" cy="17" r="2.8" {...stroke} />
          <Path d="M10.2 10.2h3.6v3.6h-3.6z" {...stroke} />
        </>
      ) : null}
      {name === "carrom" ? (
        <>
          <Circle cx="12" cy="12" r="8" {...stroke} />
          <Circle cx="12" cy="12" r="3" {...stroke} />
          <Path d="M12 4v3.3M12 16.7V20M4 12h3.3M16.7 12H20" {...stroke} />
        </>
      ) : null}
      {name === "board" ? (
        <>
          <Rect x="4" y="4" width="16" height="16" rx="2" {...stroke} />
          <Path d="M12 4v16M4 12h16" {...stroke} />
        </>
      ) : null}
    </Svg>
  );
}

export function launcherGameIcon(icon: string): LauncherIconName {
  switch (icon) {
    case "chess":
    case "cards":
    case "ludo":
    case "carrom":
      return icon;
    default:
      return "board";
  }
}
