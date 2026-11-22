import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT = path.resolve("web/public/cards");
const COLORS = {
  red: "#e8402a",
  yellow: "#f2c600",
  green: "#1fa45b",
  blue: "#2464d6",
};
const WILD_QUADRANTS = `<g>
<path d="M9 23 A14 14 0 0 1 23 9 L157 9 A14 14 0 0 1 171 23 L90 135 Z" fill="${COLORS.red}"/>
<path d="M171 23 A14 14 0 0 1 171 247 L90 135 Z" fill="${COLORS.yellow}"/>
<path d="M171 247 A14 14 0 0 1 157 261 L23 261 A14 14 0 0 1 9 247 L90 135 Z" fill="${COLORS.green}"/>
<path d="M9 247 A14 14 0 0 1 9 23 L90 135 Z" fill="${COLORS.blue}"/>
</g>`;

function burstPoints(cx, cy, spikes, outer, inner, rotation = 0) {
  const points = [];
  for (let i = 0; i < spikes * 2; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI / spikes) * i + rotation;
    points.push(`${(cx + Math.cos(angle) * radius).toFixed(1)},${(cy + Math.sin(angle) * radius).toFixed(1)}`);
  }
  return points.join(" ");
}

function frame(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 270" width="180" height="270" role="img">
<rect x="3" y="3" width="174" height="264" rx="18" fill="#ffffff" stroke="#111827" stroke-width="3"/>
<rect x="9" y="9" width="162" height="252" rx="14" fill="#f8fafc" stroke="#111827" stroke-width="1.5"/>
${inner}
</svg>`;
}

function corner(color, label) {
  return `<g fill="${color}" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="22">
<text x="22" y="34">${label}</text>
<text x="158" y="246" text-anchor="end" transform="rotate(180 158 246)">${label}</text>
</g>`;
}

function numberCard(color, value, copy) {
  const fill = COLORS[color];
  return frame(`${corner(fill, String(value))}
<ellipse cx="90" cy="135" rx="62" ry="78" fill="${fill}" transform="rotate(-18 90 135)"/>
<text x="90" y="158" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="86" fill="#ffffff" stroke="#111827" stroke-width="2" paint-order="stroke">${value}</text>
<text x="90" y="238" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="#64748b">${color} ${value} ${copy}</text>`);
}

function actionCard(color, kind, copy) {
  const fill = COLORS[color];
  const label = kind === "draw2" ? "+2" : kind === "reverse" ? "REV" : "SKIP";
  const glyph = kind === "reverse" ? "↻" : kind === "skip" ? "⊘" : "+2";
  return frame(`${corner(fill, label)}
<ellipse cx="90" cy="135" rx="62" ry="78" fill="${fill}" transform="rotate(-18 90 135)"/>
<text x="90" y="150" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="58" fill="#ffffff" stroke="#111827" stroke-width="2" paint-order="stroke">${glyph}</text>
<text x="90" y="182" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="700" fill="#ffffff">${label}</text>
<text x="90" y="238" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="#64748b">${color} ${kind} ${copy}</text>`);
}

function wildCard(kind, copy) {
  const label = kind === "wild4" ? "+4" : "WILD";
  return frame(`<g>
<path d="M9 23 A14 14 0 0 1 23 9 L157 9 A14 14 0 0 1 171 23 L90 135 Z" fill="${COLORS.red}"/>
<path d="M171 23 A14 14 0 0 1 171 247 L90 135 Z" fill="${COLORS.yellow}"/>
<path d="M171 247 A14 14 0 0 1 157 261 L23 261 A14 14 0 0 1 9 247 L90 135 Z" fill="${COLORS.green}"/>
<path d="M9 247 A14 14 0 0 1 9 23 L90 135 Z" fill="${COLORS.blue}"/>
</g>
<ellipse cx="90" cy="135" rx="60" ry="74" fill="#0f172a" transform="rotate(-18 90 135)"/>
<text x="90" y="150" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="${kind === "wild4" ? "62" : "40"}" fill="#ffffff">${label}</text>
<text x="90" y="238" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="#64748b">${kind} ${copy}</text>`);
}

function hitCard(color, damage, copy) {
  const fill = COLORS[color];
  const label = `HIT ${damage}`;
  const burst = burstPoints(90, 132, 12, 80, 54, -Math.PI / 2);
  return frame(`${corner(fill, label)}
<polygon points="${burst}" fill="${fill}" stroke="#111827" stroke-width="2.5"/>
<circle cx="90" cy="132" r="46" fill="#ffffff" fill-opacity="0.16"/>
<text x="90" y="150" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="76" fill="#ffffff" stroke="#111827" stroke-width="2" paint-order="stroke">${damage}</text>
<text x="90" y="186" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="800" fill="#ffffff" stroke="#111827" stroke-width="1.5" paint-order="stroke">${label}</text>
<text x="90" y="238" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="#64748b">${color} hit${damage} ${copy}</text>`);
}

function discardAllCard(color, copy) {
  const fill = COLORS[color];
  const cards = `<g transform="translate(90 130)">
<rect x="-34" y="-40" width="44" height="66" rx="5" fill="#ffffff" stroke="#111827" stroke-width="2" transform="rotate(-16 -12 0)"/>
<rect x="-10" y="-40" width="44" height="66" rx="5" fill="#ffffff" stroke="#111827" stroke-width="2" transform="rotate(12 12 0)"/>
<path d="M-20 -22 L20 22 M20 -22 L-20 22" stroke="${fill}" stroke-width="7" stroke-linecap="round"/>
</g>`;
  return frame(`${corner(fill, "DISC")}
<ellipse cx="90" cy="132" rx="64" ry="80" fill="${fill}" transform="rotate(18 90 132)"/>
${cards}
<text x="90" y="196" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="800" fill="#ffffff" stroke="#111827" stroke-width="1.5" paint-order="stroke">DISCARD ALL</text>
<text x="90" y="238" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="#64748b">${color} discardall ${copy}</text>`);
}

function wildAttackCard(copy) {
  const burst = burstPoints(90, 135, 12, 78, 60, -Math.PI / 2);
  return frame(`${corner(COLORS.red, "ATK!")}
<g>
<path d="M9 23 A14 14 0 0 1 23 9 L157 9 A14 14 0 0 1 171 23 L90 135 Z" fill="${COLORS.red}"/>
<path d="M171 23 A14 14 0 0 1 171 247 L90 135 Z" fill="${COLORS.yellow}"/>
<path d="M171 247 A14 14 0 0 1 157 261 L23 261 A14 14 0 0 1 9 247 L90 135 Z" fill="${COLORS.green}"/>
<path d="M9 247 A14 14 0 0 1 9 23 L90 135 Z" fill="${COLORS.blue}"/>
</g>
<polygon points="${burst}" fill="#0f172a" stroke="#ffffff" stroke-width="2"/>
<text x="90" y="143" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="28" fill="#ffffff" stroke="#e8402a" stroke-width="6" paint-order="stroke">ATTACK!</text>
<text x="90" y="238" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="#64748b">wildattack ${copy}</text>`);
}

function draw4Card(color, copy) {
  const fill = COLORS[color];
  const stack = `<g transform="translate(90 130)">
<rect x="-46" y="-26" width="48" height="72" rx="6" fill="#ffffff" stroke="#111827" stroke-width="2" transform="rotate(-20 -22 0)"/>
<rect x="-30" y="-30" width="48" height="72" rx="6" fill="#ffffff" stroke="#111827" stroke-width="2" transform="rotate(-7 -6 0)"/>
<rect x="-12" y="-30" width="48" height="72" rx="6" fill="#ffffff" stroke="#111827" stroke-width="2" transform="rotate(7 12 0)"/>
<rect x="4" y="-26" width="48" height="72" rx="6" fill="${fill}" stroke="#111827" stroke-width="2" transform="rotate(20 28 0)"/>
</g>`;
  return frame(`${corner(fill, "+4")}
<ellipse cx="90" cy="132" rx="64" ry="80" fill="${fill}" transform="rotate(-18 90 132)"/>
${stack}
<text x="90" y="198" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="28" fill="#ffffff" stroke="#111827" stroke-width="2" paint-order="stroke">+4</text>
<text x="90" y="238" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="#64748b">${color} draw4 ${copy}</text>`);
}

function skipEveryoneCard(color, copy) {
  const fill = COLORS[color];
  const people = `<g transform="translate(90 118)" fill="#ffffff" stroke="#111827" stroke-width="1.5">
<circle cx="-32" cy="-6" r="9"/>
<rect x="-44" y="6" width="24" height="30" rx="10"/>
<circle cx="0" cy="-6" r="9"/>
<rect x="-12" y="6" width="24" height="30" rx="10"/>
<circle cx="32" cy="-6" r="9"/>
<rect x="20" y="6" width="24" height="30" rx="10"/>
</g>`;
  return frame(`${corner(fill, "SKIP")}
<ellipse cx="90" cy="132" rx="64" ry="80" fill="${fill}" transform="rotate(18 90 132)"/>
${people}
<path d="M40 84 L140 152" stroke="#111827" stroke-width="7" stroke-linecap="round"/>
<text x="90" y="206" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="800" fill="#ffffff" stroke="#111827" stroke-width="1.5" paint-order="stroke">SKIP ALL</text>
<text x="90" y="238" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="#64748b">${color} skipeveryone ${copy}</text>`);
}

function wildDrawCard(amount, copy) {
  const label = `+${amount}`;
  const size = amount === 10 ? 56 : 68;
  return frame(`${corner(COLORS.red, label)}
${WILD_QUADRANTS}
<ellipse cx="90" cy="135" rx="60" ry="74" fill="#0f172a" transform="rotate(-18 90 135)"/>
<text x="90" y="150" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="${size}" fill="#ffffff">${label}</text>
<text x="90" y="238" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="#64748b">wilddraw${amount} ${copy}</text>`);
}

function wildReverse4Card(copy) {
  return frame(`${corner(COLORS.red, "REV +4")}
${WILD_QUADRANTS}
<ellipse cx="90" cy="135" rx="60" ry="74" fill="#0f172a" transform="rotate(-18 90 135)"/>
<text x="90" y="140" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="64" fill="#ffffff">↻</text>
<text x="90" y="184" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="800" fill="#ffffff" stroke="#111827" stroke-width="1.5" paint-order="stroke">REVERSE +4</text>
<text x="90" y="238" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="#64748b">wildreverse4 ${copy}</text>`);
}

function wildRouletteCard(copy) {
  const wheel = `<g>
<path d="M90 126 L90 70 A56 56 0 0 1 146 126 Z" fill="${COLORS.red}"/>
<path d="M90 126 L146 126 A56 56 0 0 1 90 182 Z" fill="${COLORS.yellow}"/>
<path d="M90 126 L90 182 A56 56 0 0 1 34 126 Z" fill="${COLORS.green}"/>
<path d="M90 126 L34 126 A56 56 0 0 1 90 70 Z" fill="${COLORS.blue}"/>
<circle cx="90" cy="126" r="56" fill="none" stroke="#111827" stroke-width="3"/>
<circle cx="90" cy="126" r="10" fill="#0f172a" stroke="#ffffff" stroke-width="2"/>
<polygon points="90,58 83,74 97,74" fill="#111827"/>
</g>`;
  return frame(`${corner(COLORS.red, "RLT")}
${WILD_QUADRANTS}
<ellipse cx="90" cy="138" rx="64" ry="74" fill="#0f172a" transform="rotate(-12 90 138)"/>
${wheel}
<text x="90" y="212" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="800" fill="#ffffff" stroke="#111827" stroke-width="1.5" paint-order="stroke">ROULETTE</text>
<text x="90" y="238" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="#64748b">wildroulette ${copy}</text>`);
}

function handIcon(stroke, fill) {
  return `<g fill="${fill}" stroke="${stroke}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">
<rect x="-20" y="0" width="40" height="28" rx="11"/>
<rect x="-19" y="-18" width="9" height="24" rx="4.5"/>
<rect x="-7" y="-25" width="9" height="31" rx="4.5"/>
<rect x="5" y="-23" width="9" height="29" rx="4.5"/>
<rect x="17" y="-15" width="9" height="21" rx="4.5"/>
<path d="M-22 6 a6 6 0 0 0 -5 9 l5 7" fill="none"/>
</g>`;
}

function swapSymbol(fill, stroke) {
  return `<g transform="translate(90 122)">
<rect x="-48" y="-38" width="46" height="72" rx="7" fill="#ffffff" stroke="${stroke}" stroke-width="2.5" transform="rotate(-14 -25 -2)"/>
<rect x="2" y="-38" width="46" height="72" rx="7" fill="${fill}" stroke="${stroke}" stroke-width="2.5" transform="rotate(14 25 -2)"/>
<g fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
<path d="M-34 -50 L32 -50"/>
<path d="M22 -60 L34 -50 L22 -40"/>
<path d="M34 50 L-32 50"/>
<path d="M-22 40 L-34 50 L-22 60"/>
</g>
</g>`;
}

function refreshSymbol() {
  return `<g>
<path d="M60.3 102.3 A42 42 0 1 1 50.5 146.4" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/>
<polygon points="50.5,146.4 64.5,158.3 47.5,164.5" fill="#ffffff"/>
</g>`;
}

function forceTradeSymbol(stroke) {
  return `<g transform="translate(90 128)">
<g transform="translate(-32 2) scale(0.82) rotate(180)">${handIcon(stroke, "#ffffff")}</g>
<g transform="translate(32 2) scale(0.82)">${handIcon(stroke, "#ffffff")}</g>
<g fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
<path d="M-10 -18 L10 -18"/>
<path d="M4 -25 L11 -18 L4 -11"/>
<path d="M10 22 L-10 22"/>
<path d="M-4 15 L-11 22 L-4 29"/>
</g>
</g>`;
}

function passHandsSymbol(stroke) {
  return `<g transform="translate(90 130)">
<g transform="translate(-28 -28) scale(0.7) rotate(-25)">${handIcon(stroke, "#ffffff")}</g>
<g transform="translate(28 28) scale(0.7) rotate(155)">${handIcon(stroke, "#ffffff")}</g>
<g fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
<path d="M-44 -4 A46 46 0 0 1 44 -4"/>
<polygon points="46,4 34,-8 56,-8" fill="#ffffff" stroke="none"/>
<path d="M44 4 A46 46 0 0 1 -44 4"/>
<polygon points="-46,-4 -58,8 -34,8" fill="#ffffff" stroke="none"/>
</g>
</g>`;
}

function swap1Card(color, copy) {
  const fill = COLORS[color];
  return frame(`${corner(fill, "SWAP")}
<ellipse cx="90" cy="132" rx="64" ry="80" fill="${fill}" transform="rotate(10 90 132)"/>
${swapSymbol(fill, "#111827")}
<text x="90" y="208" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="20" fill="#ffffff" stroke="#111827" stroke-width="1.5" paint-order="stroke">SWAP 1</text>
<text x="90" y="238" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="#64748b">${color} swap1 ${copy}</text>`);
}

function refreshHandCard(color, copy) {
  const fill = COLORS[color];
  return frame(`${corner(fill, "RFH")}
<ellipse cx="90" cy="132" rx="64" ry="80" fill="${fill}" transform="rotate(-12 90 132)"/>
<g transform="translate(0 -4)">${refreshSymbol()}</g>
<g transform="translate(90 136) scale(0.72)">${handIcon("#111827", "#ffffff")}</g>
<text x="90" y="208" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="14" fill="#ffffff" stroke="#111827" stroke-width="1.5" paint-order="stroke">REFRESH HAND</text>
<text x="90" y="238" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="#64748b">${color} refreshhand ${copy}</text>`);
}

function wildForceTradeCard(copy) {
  return frame(`${corner(COLORS.red, "TRADE")}
${WILD_QUADRANTS}
<ellipse cx="90" cy="132" rx="60" ry="78" fill="#0f172a" transform="rotate(-12 90 132)"/>
${forceTradeSymbol("#111827")}
<text x="90" y="208" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="18" fill="#ffffff" stroke="#111827" stroke-width="1.5" paint-order="stroke">FORCE TRADE</text>
<text x="90" y="238" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="#64748b">wildforcetrade ${copy}</text>`);
}

function wildPassHandsCard(copy) {
  return frame(`${corner(COLORS.red, "PASS")}
${WILD_QUADRANTS}
<ellipse cx="90" cy="132" rx="60" ry="78" fill="#0f172a" transform="rotate(-12 90 132)"/>
${passHandsSymbol("#111827")}
<text x="90" y="208" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="18" fill="#ffffff" stroke="#111827" stroke-width="1.5" paint-order="stroke">PASS HANDS</text>
<text x="90" y="238" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="#64748b">wildpasshands ${copy}</text>`);
}

function reversePackColoredCard(color, kind, copy) {
  const fill = COLORS[color];
  const isDraw = kind === "reverseDraw2";
  const label = isDraw ? "REV +2" : "REV SKIP";
  const glyph = isDraw ? "↻+2" : "↻⊘";
  return frame(`${corner(fill, isDraw ? "+2" : "SKIP")}
<ellipse cx="90" cy="132" rx="64" ry="80" fill="${fill}" transform="rotate(-14 90 132)"/>
<text x="90" y="142" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="44" fill="#ffffff" stroke="#111827" stroke-width="2.5" paint-order="stroke">${glyph}</text>
<text x="90" y="196" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="800" fill="#ffffff" stroke="#111827" stroke-width="1.5" paint-order="stroke">${label}</text>
<text x="90" y="238" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="#64748b">${color} ${isDraw ? "reversedraw2" : "reverseskip"} ${copy}</text>`);
}

function reversePackWildCard(kind, copy) {
  const power = kind === "wildPowerReverse";
  const label = power ? "POWER REVERSE" : "NO U!";
  const glyph = power ? "↻↻" : "NO U";
  return frame(`<g>
<path d="M9 23 A14 14 0 0 1 23 9 L157 9 A14 14 0 0 1 171 23 L90 135 Z" fill="${COLORS.red}"/>
<path d="M171 23 A14 14 0 0 1 171 247 L90 135 Z" fill="${COLORS.yellow}"/>
<path d="M171 247 A14 14 0 0 1 157 261 L23 261 A14 14 0 0 1 9 247 L90 135 Z" fill="${COLORS.green}"/>
<path d="M9 247 A14 14 0 0 1 9 23 L90 135 Z" fill="${COLORS.blue}"/>
</g>
<ellipse cx="90" cy="132" rx="60" ry="78" fill="#0f172a" transform="rotate(-12 90 132)"/>
<text x="90" y="142" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="${power ? "46" : "48"}" fill="#ffffff">${glyph}</text>
<text x="90" y="196" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="800" fill="#ffffff" stroke="#e8402a" stroke-width="4" paint-order="stroke">${label}</text>
<text x="90" y="238" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="#64748b">${power ? "wildpowerreverse" : "wildnou"} ${copy}</text>`);
}

function stackPackColoredCard(color, kind, copy) {
  const fill = COLORS[color];
  const value = kind === "stack1" ? 1 : 2;
  return frame(`${corner(fill, `+${value}`)}
<ellipse cx="90" cy="132" rx="64" ry="80" fill="${fill}" transform="rotate(-14 90 132)"/>
<text x="90" y="142" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="40" fill="#ffffff" stroke="#111827" stroke-width="2.5" paint-order="stroke">STACK +${value}</text>
<text x="90" y="238" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="#64748b">${color} ${kind} ${copy}</text>`);
}

function stackPackWildCard(kind, copy) {
  const numbered = kind === "wildStackNumber";
  const label = numbered ? "STACK #" : "STACK +3";
  return frame(`<g>
<path d="M9 23 A14 14 0 0 1 23 9 L157 9 A14 14 0 0 1 171 23 L90 135 Z" fill="${COLORS.red}"/>
<path d="M171 23 A14 14 0 0 1 171 247 L90 135 Z" fill="${COLORS.yellow}"/>
<path d="M171 247 A14 14 0 0 1 157 261 L23 261 A14 14 0 0 1 9 247 L90 135 Z" fill="${COLORS.green}"/>
<path d="M9 247 A14 14 0 0 1 9 23 L90 135 Z" fill="${COLORS.blue}"/>
</g>
<ellipse cx="90" cy="132" rx="60" ry="78" fill="#0f172a" transform="rotate(-12 90 132)"/>
<text x="90" y="142" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="42" fill="#ffffff">${numbered ? "#" : "+3"}</text>
<text x="90" y="196" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="800" fill="#ffffff" stroke="#e8402a" stroke-width="4" paint-order="stroke">${label}</text>
<text x="90" y="238" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="#64748b">${numbered ? "wildstacknumber" : "wildstack3"} ${copy}</text>`);
}

const LIGHT_PALETTE = {
  red: [COLORS.red, "#ff8a75"],
  yellow: [COLORS.yellow, "#ffe680"],
  green: [COLORS.green, "#6ee7a8"],
  blue: [COLORS.blue, "#8ab6ff"],
};
const DARK_PALETTE = {
  pink: ["#c2185b", "#ff5c9a"],
  teal: ["#00796b", "#2de1c2"],
  orange: ["#d95400", "#ff9e40"],
  purple: ["#6a1b9a", "#c471ed"],
};

function darkFrame(inner, pair) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 270" width="180" height="270" role="img">
<defs>
<radialGradient id="dglow"><stop offset="0" stop-color="${pair[1]}" stop-opacity="0.45"/><stop offset="1" stop-color="${pair[1]}" stop-opacity="0"/></radialGradient>
</defs>
<rect x="3" y="3" width="174" height="264" rx="18" fill="#08080c" stroke="#000000" stroke-width="5"/>
<rect x="9" y="9" width="162" height="252" rx="14" fill="url(#dglow)" stroke="#000000" stroke-width="2"/>
${inner}
</svg>`;
}

function lightCorner(pair, label) {
  return `<g fill="${pair[0]}" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="22">
<text x="22" y="34">${label}</text>
<text x="158" y="246" text-anchor="end" transform="rotate(180 158 246)">${label}</text>
</g>`;
}

function darkCorner(pair, label) {
  return `<g fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="20" style="filter:drop-shadow(0 0 6px ${pair[1]})">
<text x="22" y="34">${label}</text>
<text x="158" y="246" text-anchor="end" transform="rotate(180 158 246)">${label}</text>
</g>`;
}

function classicLabel(text, x, y, size, stroke) {
  return `<text x="${x}" y="${y}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="${size}" fill="#ffffff" stroke="${stroke}" stroke-width="2" paint-order="stroke">${text}</text>`;
}

function classicCaption(text, dark) {
  return `<text x="90" y="238" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="${dark ? "#94a3b8" : "#64748b"}">${text}</text>`;
}

const THEMES = {
  light: {
    colors: LIGHT_PALETTE,
    frame: (inner) => frame(inner),
    corner: lightCorner,
    stroke: "#111827",
    dark: false,
    wildColors: [LIGHT_PALETTE.red[0], LIGHT_PALETTE.yellow[0], LIGHT_PALETTE.green[0], LIGHT_PALETTE.blue[0]],
  },
  dark: {
    colors: DARK_PALETTE,
    frame: (inner, pair) => darkFrame(inner, pair),
    corner: darkCorner,
    stroke: "#000000",
    dark: true,
    wildColors: [DARK_PALETTE.pink[0], DARK_PALETTE.teal[0], DARK_PALETTE.orange[0], DARK_PALETTE.purple[0]],
  },
};

function quadrants(colors) {
  return `<g>
<path d="M9 23 A14 14 0 0 1 23 9 L157 9 A14 14 0 0 1 171 23 L90 135 Z" fill="${colors[0]}"/>
<path d="M171 23 A14 14 0 0 1 171 247 L90 135 Z" fill="${colors[1]}"/>
<path d="M171 247 A14 14 0 0 1 157 261 L23 261 A14 14 0 0 1 9 247 L90 135 Z" fill="${colors[2]}"/>
<path d="M9 247 A14 14 0 0 1 9 23 L90 135 Z" fill="${colors[3]}"/>
</g>`;
}

function flipSymbol(pair, stroke) {
  return `<g>
<circle cx="90" cy="132" r="52" fill="${pair[0]}" stroke="${stroke}" stroke-width="3"/>
<path d="M90 80 A52 52 0 0 1 90 184 Z" fill="${pair[1]}"/>
<path d="M56 108 A40 40 0 0 1 116 104" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/>
<polygon points="120,98 124,116 104,112" fill="#ffffff"/>
<path d="M124 156 A40 40 0 0 1 64 160" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/>
<polygon points="60,166 56,148 76,152" fill="#ffffff"/>
</g>`;
}

function colorWheel(colors, cx, cy, r, stroke) {
  return `<g>
<path d="M${cx} ${cy} L${cx} ${cy - r} A${r} ${r} 0 0 1 ${cx + r} ${cy} Z" fill="${colors[0]}"/>
<path d="M${cx} ${cy} L${cx + r} ${cy} A${r} ${r} 0 0 1 ${cx} ${cy + r} Z" fill="${colors[1]}"/>
<path d="M${cx} ${cy} L${cx} ${cy + r} A${r} ${r} 0 0 1 ${cx - r} ${cy} Z" fill="${colors[2]}"/>
<path d="M${cx} ${cy} L${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx} ${cy - r} Z" fill="${colors[3]}"/>
<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${stroke}" stroke-width="3"/>
<circle cx="${cx}" cy="${cy}" r="8" fill="${stroke}" stroke="#ffffff" stroke-width="2"/>
</g>`;
}

function flipNumber(theme, color, value, copy) {
  const pair = theme.colors[color];
  const inner = `${theme.corner(pair, String(value))}
<ellipse cx="90" cy="135" rx="62" ry="78" fill="${pair[0]}" transform="rotate(-18 90 135)"/>
${classicLabel(String(value), 90, 158, 86, theme.stroke)}
${classicCaption(`${theme.dark ? "dark" : "light"} ${color} ${value} ${copy}`, theme.dark)}`;
  return theme.frame(inner, pair);
}

function flipAction(theme, color, cornerText, text, glyph, kind, copy) {
  const pair = theme.colors[color];
  const inner = `${theme.corner(pair, cornerText)}
<ellipse cx="90" cy="135" rx="62" ry="78" fill="${pair[0]}" transform="rotate(-18 90 135)"/>
${classicLabel(glyph, 90, 146, 56, theme.stroke)}
${classicLabel(text, 90, 186, 16, theme.stroke)}
${classicCaption(`${theme.dark ? "dark" : "light"} ${color} ${kind} ${copy}`, theme.dark)}`;
  return theme.frame(inner, pair);
}

function flipFlip(theme, color, copy) {
  const pair = theme.colors[color];
  const inner = `${theme.corner(pair, "FLIP")}
${flipSymbol(pair, theme.stroke)}
${classicLabel("FLIP", 90, 214, 20, theme.stroke)}
${classicCaption(`${theme.dark ? "dark" : "light"} ${color} flip ${copy}`, theme.dark)}`;
  return theme.frame(inner, pair);
}

function flipWild(theme, kind, text, copy, colors) {
  const pair = theme.dark ? DARK_PALETTE.purple : LIGHT_PALETTE.red;
  const inner = `${theme.corner(pair, "WILD")}
${quadrants(colors)}
<ellipse cx="90" cy="135" rx="60" ry="74" fill="${theme.dark ? "#050509" : "#0f172a"}" transform="rotate(-18 90 135)"/>
${classicLabel("W", 90, 150, 64, theme.stroke)}
${classicLabel(text, 90, 188, 16, theme.stroke)}
${classicCaption(`${theme.dark ? "dark" : "light"} ${kind} ${copy}`, theme.dark)}`;
  return theme.frame(inner, pair);
}

function flipWildDraw(theme, kind, text, glyph, copy, colors) {
  const pair = theme.dark ? DARK_PALETTE.purple : LIGHT_PALETTE.red;
  const isColor = kind === "wilddrawcolor";
  const center = isColor ? colorWheel(colors, 90, 118, 40, theme.stroke) : classicLabel(glyph, 90, 142, 64, theme.stroke);
  const inner = `${theme.corner(pair, isColor ? "WDC" : "+2")}
${quadrants(colors)}
<ellipse cx="90" cy="135" rx="60" ry="74" fill="${theme.dark ? "#050509" : "#0f172a"}" transform="rotate(-18 90 135)"/>
${center}
${classicLabel(text, 90, isColor ? 196 : 188, isColor ? 14 : 16, theme.stroke)}
${classicCaption(`${theme.dark ? "dark" : "light"} ${kind} ${copy}`, theme.dark)}`;
  return theme.frame(inner, pair);
}

const FLIP_ACTIONS = {
  light: [
    ["draw1", "DRAW1", "DRAW 1", "+1"],
    ["reverse", "REV", "REVERSE", "↻"],
    ["skip", "SKIP", "SKIP", "⊘"],
  ],
  dark: [
    ["draw5", "+5", "DRAW 5", "+5"],
    ["reverse", "REV", "REVERSE", "↻"],
    ["skipeveryone", "SKIP", "SKIP ALL", "⊘"],
  ],
};

mkdirSync(OUT, { recursive: true });

writeFileSync(path.join(OUT, "card-back.svg"), frame(`<g>
<rect x="22" y="22" width="136" height="226" rx="14" fill="#0f172a"/>
<path d="M90 40 150 90 90 140 30 90Z" fill="${COLORS.red}"/>
<path d="M150 90 150 180 90 230 90 140Z" fill="${COLORS.yellow}"/>
<path d="M90 140 150 180 90 230 30 180Z" fill="${COLORS.green}"/>
<path d="M30 90 90 140 90 230 30 180Z" fill="${COLORS.blue}"/>
<text x="90" y="110" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="30" fill="#ffffff">MG</text>
</g>`));

let count = 0;
for (const color of Object.keys(COLORS)) {
  for (let value = 0; value <= 9; value += 1) {
    const copies = value === 0 ? 1 : 2;
    for (let copy = 0; copy < copies; copy += 1) {
      writeFileSync(path.join(OUT, `${color}-${value}-${copy}.svg`), numberCard(color, value, copy));
      count += 1;
    }
  }
  for (const kind of ["skip", "reverse", "draw2"]) {
    for (let copy = 0; copy < 2; copy += 1) {
      writeFileSync(path.join(OUT, `${color}-${kind}-${copy}.svg`), actionCard(color, kind, copy));
      count += 1;
    }
  }
  for (const kind of ["hit1", "hit2"]) {
    const damage = kind === "hit1" ? 1 : 2;
    for (let copy = 0; copy < damage; copy += 1) {
      writeFileSync(path.join(OUT, `${color}-${kind}-${copy}.svg`), hitCard(color, damage, copy));
      count += 1;
    }
  }
  for (let copy = 0; copy < 2; copy += 1) {
    writeFileSync(path.join(OUT, `${color}-discardall-${copy}.svg`), discardAllCard(color, copy));
    count += 1;
  }
  for (let copy = 0; copy < 2; copy += 1) {
    writeFileSync(path.join(OUT, `${color}-draw4-${copy}.svg`), draw4Card(color, copy));
    writeFileSync(path.join(OUT, `${color}-skipeveryone-${copy}.svg`), skipEveryoneCard(color, copy));
    count += 2;
  }
  writeFileSync(path.join(OUT, `${color}-discardall-2.svg`), discardAllCard(color, 2));
  count += 1;
}
for (const kind of ["wild", "wild4"]) {
  for (let copy = 0; copy < 4; copy += 1) {
    writeFileSync(path.join(OUT, `${kind}-${copy}.svg`), wildCard(kind, copy));
    count += 1;
  }
}
for (let copy = 0; copy < 4; copy += 1) {
  writeFileSync(path.join(OUT, `wildattack-${copy}.svg`), wildAttackCard(copy));
  count += 1;
}
for (let copy = 0; copy < 4; copy += 1) {
  writeFileSync(path.join(OUT, `wilddraw6-${copy}.svg`), wildDrawCard(6, copy));
  writeFileSync(path.join(OUT, `wilddraw10-${copy}.svg`), wildDrawCard(10, copy));
  count += 2;
}
for (let copy = 0; copy < 8; copy += 1) {
  writeFileSync(path.join(OUT, `wildreverse4-${copy}.svg`), wildReverse4Card(copy));
  writeFileSync(path.join(OUT, `wildroulette-${copy}.svg`), wildRouletteCard(copy));
  count += 2;
}
for (const color of Object.keys(COLORS)) {
  writeFileSync(path.join(OUT, `${color}-reversedraw2-0.svg`), reversePackColoredCard(color, "reverseDraw2", 0));
  writeFileSync(path.join(OUT, `${color}-reverseskip-0.svg`), reversePackColoredCard(color, "reverseSkip", 0));
  count += 2;
}
for (let copy = 0; copy < 4; copy += 1) {
  writeFileSync(path.join(OUT, `wildpowerreverse-${copy}.svg`), reversePackWildCard("wildPowerReverse", copy));
  writeFileSync(path.join(OUT, `wildnou-${copy}.svg`), reversePackWildCard("wildNoU", copy));
  count += 2;
}
for (const color of Object.keys(COLORS)) {
  writeFileSync(path.join(OUT, `${color}-stack1-0.svg`), stackPackColoredCard(color, "stack1", 0));
  writeFileSync(path.join(OUT, `${color}-stack2-0.svg`), stackPackColoredCard(color, "stack2", 0));
  count += 2;
}
for (let copy = 0; copy < 4; copy += 1) {
  writeFileSync(path.join(OUT, `wildstack3-${copy}.svg`), stackPackWildCard("wildStack3", copy));
  writeFileSync(path.join(OUT, `wildstacknumber-${copy}.svg`), stackPackWildCard("wildStackNumber", copy));
  count += 2;
}
for (const color of Object.keys(COLORS)) {
  writeFileSync(path.join(OUT, `${color}-swap1-0.svg`), swap1Card(color, 0));
  writeFileSync(path.join(OUT, `${color}-refreshhand-0.svg`), refreshHandCard(color, 0));
  count += 2;
}
for (let copy = 0; copy < 4; copy += 1) {
  writeFileSync(path.join(OUT, `wildforcetrade-${copy}.svg`), wildForceTradeCard(copy));
  writeFileSync(path.join(OUT, `wildpasshands-${copy}.svg`), wildPassHandsCard(copy));
  count += 2;
}
for (const side of ["light", "dark"]) {
  const theme = THEMES[side];
  for (const color of Object.keys(theme.colors)) {
    for (let value = 1; value <= 9; value += 1) {
      for (let copy = 0; copy < 2; copy += 1) {
        writeFileSync(path.join(OUT, `${side}-${color}-${value}-${copy}.svg`), flipNumber(theme, color, value, copy));
        count += 1;
      }
    }
    for (const [kind, cornerText, text, glyph] of FLIP_ACTIONS[side]) {
      for (let copy = 0; copy < 2; copy += 1) {
        writeFileSync(path.join(OUT, `${side}-${color}-${kind}-${copy}.svg`), flipAction(theme, color, cornerText, text, glyph, kind, copy));
        count += 1;
      }
    }
    for (let copy = 0; copy < 2; copy += 1) {
      writeFileSync(path.join(OUT, `${side}-${color}-flip-${copy}.svg`), flipFlip(theme, color, copy));
      count += 1;
    }
  }
  for (let copy = 0; copy < 4; copy += 1) {
    writeFileSync(path.join(OUT, `${side}-wild-${copy}.svg`), flipWild(theme, "wild", "WILD", copy, theme.wildColors));
    const drawKind = side === "light" ? "wilddraw2" : "wilddrawcolor";
    const drawText = side === "light" ? "WILD DRAW 2" : "WILD DRAW COLOR";
    writeFileSync(path.join(OUT, `${side}-${drawKind}-${copy}.svg`), flipWildDraw(theme, drawKind, drawText, "+2", copy, theme.wildColors));
    count += 2;
  }
}
console.log(`wrote ${count} card SVGs to ${OUT}`);
