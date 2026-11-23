import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT = path.resolve("web/public/cards-neon");
const NEON = {
  red: ["#FF1744", "#FF5252"],
  yellow: ["#FFEA00", "#FFE082"],
  green: ["#00E676", "#69F0AE"],
  blue: ["#2979FF", "#82B1FF"],
  wild: ["#E040FB", "#18FFFF"],
};
const FOUR = ["#FF1744", "#FFEA00", "#00E676", "#2979FF"];
const QUADRANT = `<path d="M90 135 L90 52 A83 83 0 0 1 173 135 Z" fill="${FOUR[0]}"/>
<path d="M90 135 L173 135 A83 83 0 0 1 90 218 Z" fill="${FOUR[1]}"/>
<path d="M90 135 L90 218 A83 83 0 0 1 7 135 Z" fill="${FOUR[2]}"/>
<path d="M90 135 L7 135 A83 83 0 0 1 90 52 Z" fill="${FOUR[3]}"/>`;

function burstPoints(cx, cy, spikes, outer, inner, rotation = 0) {
  const points = [];
  for (let i = 0; i < spikes * 2; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI / spikes) * i + rotation;
    points.push(`${(cx + Math.cos(angle) * radius).toFixed(1)},${(cy + Math.sin(angle) * radius).toFixed(1)}`);
  }
  return points.join(" ");
}

function surface(inner, colors) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 270" width="180" height="270" role="img">
<defs>
<linearGradient id="edge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${colors[0]}"/><stop offset="1" stop-color="${colors[1]}"/></linearGradient>
<radialGradient id="glow"><stop offset="0" stop-color="${colors[0]}" stop-opacity="0.42"/><stop offset="1" stop-color="${colors[0]}" stop-opacity="0"/></radialGradient>
<filter id="soft"><feGaussianBlur stdDeviation="8"/></filter>
</defs>
<rect x="3" y="3" width="174" height="264" rx="10" fill="#0A0A0E" stroke="url(#edge)" stroke-width="4"/>
<rect x="6" y="6" width="168" height="258" rx="8" fill="none" stroke="#FF003C" stroke-opacity="0.65" stroke-width="0.8"/>
<rect x="9" y="9" width="162" height="252" rx="7" fill="url(#glow)"/>
${inner}
</svg>`;
}

function corner(text) {
  return `<g font-family="Arial, Helvetica, sans-serif" font-weight="800" font-style="italic" fill="#fff" font-size="17">
<text x="14" y="26">${text}</text>
<text x="166" y="252" text-anchor="end" transform="rotate(180 166 252)">${text}</text>
</g>`;
}

function numberCard(color, value) {
  const c = NEON[color];
  return surface(`
<g transform="rotate(-30 90 135)">
<rect x="28" y="55" width="124" height="160" rx="46" fill="none" stroke="url(#edge)" stroke-width="9" filter="url(#soft)" opacity="0.75"/>
<rect x="28" y="55" width="124" height="160" rx="46" fill="none" stroke="url(#edge)" stroke-width="8"/>
<rect x="28" y="55" width="124" height="160" rx="46" fill="none" stroke="#fff" stroke-opacity="0.9" stroke-width="2"/>
</g>
<text x="90" y="158" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="92" font-weight="900" font-style="italic" fill="#fff" style="filter:drop-shadow(0 0 14px ${c[0]})">${value}</text>
${corner(String(value))}`, c);
}

function actionCard(color, kind) {
  const c = NEON[color];
  const glyph = kind === "skip" ? "⊘" : kind === "reverse" ? "⇄" : "+2";
  return surface(`
<g transform="rotate(45 90 135)">
<rect x="50" y="95" width="80" height="80" rx="14" fill="none" stroke="url(#edge)" stroke-width="9" filter="url(#soft)" opacity="0.7"/>
<rect x="50" y="95" width="80" height="80" rx="14" fill="none" stroke="url(#edge)" stroke-width="8"/>
<rect x="50" y="95" width="80" height="80" rx="14" fill="none" stroke="#fff" stroke-opacity="0.9" stroke-width="2"/>
</g>
<text x="90" y="156" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="62" font-weight="900" font-style="italic" fill="#fff" style="filter:drop-shadow(0 0 18px ${c[0]})">${glyph}</text>
${corner(glyph)}`, c);
}

function wildCard(kind) {
  const label = kind === "wild" ? "W" : "+4";
  return surface(`
<g opacity="0.9">${QUADRANT}</g>
<circle cx="90" cy="135" r="66" fill="#0A0A0E" fill-opacity="0.5"/>
<circle cx="90" cy="135" r="66" fill="none" stroke="url(#edge)" stroke-width="12" filter="url(#soft)" opacity="0.7"/>
<circle cx="90" cy="135" r="66" fill="none" stroke="url(#edge)" stroke-width="10"/>
<circle cx="90" cy="135" r="66" fill="none" stroke="#fff" stroke-opacity="0.9" stroke-width="3"/>
<text x="90" y="160" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${kind === "wild" ? "64" : "76"}" font-weight="900" font-style="italic" fill="#fff" style="filter:drop-shadow(0 0 20px #E040FB)">${label}</text>
${corner(label)}`, NEON.wild);
}

function hitCard(color, damage) {
  const c = NEON[color];
  const label = `HIT ${damage}`;
  const burst = burstPoints(90, 132, 10, 76, 56, -Math.PI / 2);
  return surface(`
<polygon points="${burst}" fill="none" stroke="url(#edge)" stroke-width="9" filter="url(#soft)" opacity="0.7"/>
<polygon points="${burst}" fill="none" stroke="url(#edge)" stroke-width="8"/>
<polygon points="${burst}" fill="none" stroke="#fff" stroke-opacity="0.9" stroke-width="2"/>
<text x="90" y="154" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="74" font-weight="900" font-style="italic" fill="#fff" style="filter:drop-shadow(0 0 18px ${c[0]})">${damage}</text>
<text x="90" y="230" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="900" font-style="italic" fill="#fff" style="filter:drop-shadow(0 0 10px ${c[0]})">${label}</text>
${corner(`HIT${damage}`)}`, c);
}

function discardAllCard(color) {
  const c = NEON[color];
  return surface(`
<g transform="translate(90 128)">
<rect x="-34" y="-42" width="46" height="68" rx="6" fill="none" stroke="url(#edge)" stroke-width="3" transform="rotate(-16 -12 0)"/>
<rect x="-10" y="-42" width="46" height="68" rx="6" fill="none" stroke="url(#edge)" stroke-width="3" transform="rotate(12 12 0)"/>
<path d="M-20 -22 L20 22 M20 -22 L-20 22" stroke="#fff" stroke-width="9" stroke-linecap="round" filter="url(#soft)" opacity="0.8"/>
<path d="M-20 -22 L20 22 M20 -22 L-20 22" stroke="${c[0]}" stroke-width="5" stroke-linecap="round"/>
</g>
<text x="90" y="200" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="900" font-style="italic" fill="#fff" style="filter:drop-shadow(0 0 10px ${c[0]})">DISCARD ALL</text>
${corner("DISC")}`, c);
}

function wildAttackCard() {
  const burst = burstPoints(90, 135, 12, 76, 60, -Math.PI / 2);
  return surface(`
<g opacity="0.9">${QUADRANT}</g>
<circle cx="90" cy="135" r="70" fill="#0A0A0E" fill-opacity="0.62"/>
<polygon points="${burst}" fill="none" stroke="url(#edge)" stroke-width="9" filter="url(#soft)" opacity="0.8"/>
<polygon points="${burst}" fill="none" stroke="url(#edge)" stroke-width="7"/>
<text x="90" y="143" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="900" font-style="italic" fill="#fff" style="filter:drop-shadow(0 0 18px #FF003C)">ATTACK!</text>
${corner("ATK!")}`, NEON.wild);
}

function draw4Card(color, amount) {
  const c = NEON[color];
  const label = `+${amount}`;
  return surface(`
<g transform="translate(90 126)">
<rect x="-46" y="-26" width="48" height="72" rx="6" fill="none" stroke="url(#edge)" stroke-width="3" transform="rotate(-20 -22 0)"/>
<rect x="-30" y="-30" width="48" height="72" rx="6" fill="none" stroke="url(#edge)" stroke-width="3" transform="rotate(-7 -6 0)"/>
<rect x="-12" y="-30" width="48" height="72" rx="6" fill="none" stroke="url(#edge)" stroke-width="3" transform="rotate(7 12 0)"/>
<rect x="4" y="-26" width="48" height="72" rx="6" fill="none" stroke="url(#edge)" stroke-width="3" transform="rotate(20 28 0)"/>
</g>
<text x="90" y="206" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="900" font-style="italic" fill="#fff" style="filter:drop-shadow(0 0 16px ${c[0]})">${label}</text>
${corner(label)}`, c);
}

function skipEveryoneCard(color) {
  const c = NEON[color];
  return surface(`
<g transform="translate(90 118)" fill="none" stroke="url(#edge)" stroke-width="3">
<circle cx="-32" cy="-6" r="9"/>
<rect x="-44" y="6" width="24" height="30" rx="10"/>
<circle cx="0" cy="-6" r="9"/>
<rect x="-12" y="6" width="24" height="30" rx="10"/>
<circle cx="32" cy="-6" r="9"/>
<rect x="20" y="6" width="24" height="30" rx="10"/>
</g>
<path d="M40 86 L140 154" stroke="#fff" stroke-width="9" stroke-linecap="round" filter="url(#soft)" opacity="0.8"/>
<path d="M40 86 L140 154" stroke="${c[0]}" stroke-width="5" stroke-linecap="round"/>
<text x="90" y="210" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="900" font-style="italic" fill="#fff" style="filter:drop-shadow(0 0 10px ${c[0]})">SKIP ALL</text>
${corner("SKIP")}`, c);
}

function wildDrawCard(amount) {
  const label = `+${amount}`;
  const size = amount === 10 ? 56 : 68;
  return surface(`
<g opacity="0.9">${QUADRANT}</g>
<circle cx="90" cy="135" r="66" fill="#0A0A0E" fill-opacity="0.5"/>
<circle cx="90" cy="135" r="66" fill="none" stroke="url(#edge)" stroke-width="12" filter="url(#soft)" opacity="0.7"/>
<circle cx="90" cy="135" r="66" fill="none" stroke="url(#edge)" stroke-width="10"/>
<circle cx="90" cy="135" r="66" fill="none" stroke="#fff" stroke-opacity="0.9" stroke-width="3"/>
<text x="90" y="158" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="900" font-style="italic" fill="#fff" style="filter:drop-shadow(0 0 20px #E040FB)">${label}</text>
${corner(label)}`, NEON.wild);
}

function wildReverse4Card() {
  return surface(`
<g opacity="0.9">${QUADRANT}</g>
<circle cx="90" cy="135" r="66" fill="#0A0A0E" fill-opacity="0.6"/>
<circle cx="90" cy="135" r="66" fill="none" stroke="url(#edge)" stroke-width="12" filter="url(#soft)" opacity="0.7"/>
<circle cx="90" cy="135" r="66" fill="none" stroke="url(#edge)" stroke-width="10"/>
<circle cx="90" cy="135" r="66" fill="none" stroke="#fff" stroke-opacity="0.9" stroke-width="3"/>
<text x="90" y="148" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="62" font-weight="900" font-style="italic" fill="#fff" style="filter:drop-shadow(0 0 18px #18FFFF)">↻</text>
<text x="90" y="192" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="900" font-style="italic" fill="#fff" style="filter:drop-shadow(0 0 10px #E040FB)">REVERSE +4</text>
${corner("REV+4")}`, NEON.wild);
}

function wildRouletteCard() {
  const wheel = `
<path d="M90 126 L90 70 A56 56 0 0 1 146 126 Z" fill="${FOUR[0]}"/>
<path d="M90 126 L146 126 A56 56 0 0 1 90 182 Z" fill="${FOUR[1]}"/>
<path d="M90 126 L90 182 A56 56 0 0 1 34 126 Z" fill="${FOUR[2]}"/>
<path d="M90 126 L34 126 A56 56 0 0 1 90 70 Z" fill="${FOUR[3]}"/>
<circle cx="90" cy="126" r="56" fill="none" stroke="#fff" stroke-width="3"/>
<circle cx="90" cy="126" r="10" fill="#0A0A0E" stroke="#fff" stroke-width="2"/>
<polygon points="90,58 83,74 97,74" fill="#fff"/>`;
  return surface(`
<g opacity="0.5">${QUADRANT}</g>
<circle cx="90" cy="128" r="64" fill="#0A0A0E" fill-opacity="0.6"/>
<circle cx="90" cy="128" r="64" fill="none" stroke="url(#edge)" stroke-width="9" filter="url(#soft)" opacity="0.8"/>
${wheel}
<text x="90" y="212" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="900" font-style="italic" fill="#fff" style="filter:drop-shadow(0 0 10px #E040FB)">ROULETTE</text>
${corner("RLT")}`, NEON.wild);
}

function back() {
  return surface(`
<g transform="rotate(-20 90 135)">
<rect x="28" y="96" width="124" height="78" rx="38" fill="none" stroke="url(#edge)" stroke-width="9" filter="url(#soft)" opacity="0.75"/>
<rect x="28" y="96" width="124" height="78" rx="38" fill="none" stroke="url(#edge)" stroke-width="8"/>
<rect x="28" y="96" width="124" height="78" rx="38" fill="none" stroke="#fff" stroke-opacity="0.9" stroke-width="2"/>
</g>
<text x="90" y="150" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="900" font-style="italic" fill="#fff" style="filter:drop-shadow(0 0 16px #18FFFF)">UNO</text>`, NEON.wild);
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
<g transform="translate(-32 2) scale(0.82) rotate(180)">${handIcon(stroke, "#0A0A0E")}</g>
<g transform="translate(32 2) scale(0.82)">${handIcon(stroke, "#0A0A0E")}</g>
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
<g transform="translate(-28 -28) scale(0.7) rotate(-25)">${handIcon(stroke, "#0A0A0E")}</g>
<g transform="translate(28 28) scale(0.7) rotate(155)">${handIcon(stroke, "#0A0A0E")}</g>
<g fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
<path d="M-44 -4 A46 46 0 0 1 44 -4"/>
<polygon points="46,4 34,-8 56,-8" fill="#ffffff" stroke="none"/>
<path d="M44 4 A46 46 0 0 1 -44 4"/>
<polygon points="-46,-4 -58,8 -34,8" fill="#ffffff" stroke="none"/>
</g>
</g>`;
}

function swap1Card(color, copy) {
  const c = NEON[color];
  return surface(`
<g transform="rotate(-12 90 128)">
<ellipse cx="90" cy="128" rx="62" ry="68" fill="none" stroke="url(#edge)" stroke-width="9" filter="url(#soft)" opacity="0.7"/>
<ellipse cx="90" cy="128" rx="62" ry="68" fill="none" stroke="url(#edge)" stroke-width="7"/>
<ellipse cx="90" cy="128" rx="62" ry="68" fill="none" stroke="#fff" stroke-opacity="0.85" stroke-width="2"/>
</g>
<g style="filter:drop-shadow(0 0 8px ${c[0]})">${swapSymbol("#0A0A0E", "#ffffff")}</g>
${neonLabel("SWAP 1", 90, 214, 19, c)}
${neonCaption(`swap1 ${copy}`, true)}`, c);
}

function refreshHandCard(color, copy) {
  const c = NEON[color];
  return surface(`
<g transform="rotate(-12 90 128)">
<ellipse cx="90" cy="128" rx="62" ry="68" fill="none" stroke="url(#edge)" stroke-width="9" filter="url(#soft)" opacity="0.7"/>
<ellipse cx="90" cy="128" rx="62" ry="68" fill="none" stroke="url(#edge)" stroke-width="7"/>
<ellipse cx="90" cy="128" rx="62" ry="68" fill="none" stroke="#fff" stroke-opacity="0.85" stroke-width="2"/>
</g>
<g style="filter:drop-shadow(0 0 8px ${c[0]})">${refreshSymbol()}</g>
<g transform="translate(90 136) scale(0.72)" style="filter:drop-shadow(0 0 8px ${c[0]})">${handIcon("#ffffff", "#0A0A0E")}</g>
${neonLabel("REFRESH HAND", 90, 214, 17, c)}
${neonCaption(`refreshhand ${copy}`, true)}`, c);
}

function wildForceTradeCard(copy) {
  return surface(`
<g opacity="0.9">${QUADRANT}</g>
<ellipse cx="90" cy="132" rx="60" ry="70" fill="#0A0A0E" fill-opacity="0.62" transform="rotate(-12 90 132)"/>
<ellipse cx="90" cy="132" rx="60" ry="70" fill="none" stroke="url(#edge)" stroke-width="8" transform="rotate(-12 90 132)"/>
<g style="filter:drop-shadow(0 0 10px #18FFFF)">${forceTradeSymbol("#ffffff")}</g>
${neonLabel("FORCE TRADE", 90, 216, 17, NEON.wild)}
${neonCaption(`wildforcetrade ${copy}`, true)}`, NEON.wild);
}

function wildPassHandsCard(copy) {
  return surface(`
<g opacity="0.9">${QUADRANT}</g>
<ellipse cx="90" cy="132" rx="60" ry="70" fill="#0A0A0E" fill-opacity="0.62" transform="rotate(-12 90 132)"/>
<ellipse cx="90" cy="132" rx="60" ry="70" fill="none" stroke="url(#edge)" stroke-width="8" transform="rotate(-12 90 132)"/>
<g style="filter:drop-shadow(0 0 10px #18FFFF)">${passHandsSymbol("#ffffff")}</g>
${neonLabel("PASS HANDS", 90, 216, 17, NEON.wild)}
${neonCaption(`wildpasshands ${copy}`, true)}`, NEON.wild);
}

function reversePackColoredCard(color, kind, copy) {
  const c = NEON[color];
  const isDraw = kind === "reverseDraw2";
  const label = isDraw ? "REVERSE +2" : "REVERSE SKIP";
  const glyph = isDraw ? "↻+2" : "↻⊘";
  return surface(`
<g transform="rotate(-12 90 128)">
<ellipse cx="90" cy="128" rx="62" ry="68" fill="none" stroke="url(#edge)" stroke-width="9" filter="url(#soft)" opacity="0.7"/>
<ellipse cx="90" cy="128" rx="62" ry="68" fill="none" stroke="url(#edge)" stroke-width="7"/>
<ellipse cx="90" cy="128" rx="62" ry="68" fill="none" stroke="#fff" stroke-opacity="0.85" stroke-width="2"/>
</g>
<g style="filter:drop-shadow(0 0 10px ${c[0]})">
<text x="90" y="150" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-style="italic" font-size="44" fill="#ffffff">${glyph}</text>
</g>
${neonLabel(label, 90, 214, 16, c)}
${neonCaption(`${isDraw ? "reversedraw2" : "reverseskip"} ${copy}`, true)}`, c);
}

function reversePackWildCard(kind, copy) {
  const power = kind === "wildPowerReverse";
  const label = power ? "POWER REVERSE" : "NO U!";
  const glyph = power ? "↻↻" : "NO U";
  return surface(`
<g opacity="0.9">${QUADRANT}</g>
<ellipse cx="90" cy="132" rx="60" ry="70" fill="#0A0A0E" fill-opacity="0.62" transform="rotate(-12 90 132)"/>
<ellipse cx="90" cy="132" rx="60" ry="70" fill="none" stroke="url(#edge)" stroke-width="8" transform="rotate(-12 90 132)"/>
<g style="filter:drop-shadow(0 0 12px #18FFFF)">
<text x="90" y="150" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-style="italic" font-size="46" fill="#ffffff">${glyph}</text>
</g>
${neonLabel(label, 90, 216, 16, NEON.wild)}
${neonCaption(`${power ? "wildpowerreverse" : "wildnou"} ${copy}`, true)}`, NEON.wild);
}

function stackPackColoredCard(color, kind, copy) {
  const c = NEON[color];
  const value = kind === "stack1" ? 1 : 2;
  return surface(`
<g transform="rotate(-12 90 128)">
<ellipse cx="90" cy="128" rx="62" ry="68" fill="none" stroke="url(#edge)" stroke-width="9" filter="url(#soft)" opacity="0.7"/>
<ellipse cx="90" cy="128" rx="62" ry="68" fill="none" stroke="url(#edge)" stroke-width="7"/>
<ellipse cx="90" cy="128" rx="62" ry="68" fill="none" stroke="#fff" stroke-opacity="0.85" stroke-width="2"/>
</g>
<g style="filter:drop-shadow(0 0 10px ${c[0]})">
<text x="90" y="150" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-style="italic" font-size="32" fill="#ffffff">STACK +${value}</text>
</g>
${neonCaption(`${color} ${kind} ${copy}`, true)}`, c);
}

function stackPackWildCard(kind, copy) {
  const numbered = kind === "wildStackNumber";
  const label = numbered ? "STACK #" : "STACK +3";
  return surface(`
<g opacity="0.9">${QUADRANT}</g>
<ellipse cx="90" cy="132" rx="60" ry="70" fill="#0A0A0E" fill-opacity="0.62" stroke="url(#edge)" stroke-width="8" transform="rotate(-12 90 132)"/>
<g style="filter:drop-shadow(0 0 12px #18FFFF)">
<text x="90" y="142" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-style="italic" font-size="44" fill="#ffffff">${numbered ? "#" : "+3"}</text>
</g>
${neonLabel(label, 90, 216, 16, NEON.wild)}
${neonCaption(`${numbered ? "wildstacknumber" : "wildstack3"} ${copy}`, true)}`, NEON.wild);
}

function speedPackColoredCard(color, value, copy) {
  const c = NEON[color];
  return surface(`
<g transform="rotate(-12 90 128)">
<ellipse cx="90" cy="128" rx="62" ry="68" fill="none" stroke="url(#edge)" stroke-width="9" filter="url(#soft)" opacity="0.7"/>
<ellipse cx="90" cy="128" rx="62" ry="68" fill="none" stroke="url(#edge)" stroke-width="7"/>
<ellipse cx="90" cy="128" rx="62" ry="68" fill="none" stroke="#fff" stroke-opacity="0.85" stroke-width="2"/>
</g>
<g style="filter:drop-shadow(0 0 10px ${c[0]})">
<text x="90" y="140" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-style="italic" font-size="64" fill="#ffffff">${value}</text>
</g>
${neonLabel("SPEED +1", 90, 196, 14, c)}
${neonCaption(`${color} speedup ${value} ${copy}`, true)}`, c);
}

function speedPackWildCard(copy) {
  return surface(`
<g opacity="0.9">${QUADRANT}</g>
<ellipse cx="90" cy="132" rx="60" ry="70" fill="#0A0A0E" fill-opacity="0.62" stroke="url(#edge)" stroke-width="8" transform="rotate(-12 90 132)"/>
<g style="filter:drop-shadow(0 0 12px #18FFFF)">
<text x="90" y="140" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-style="italic" font-size="50" fill="#ffffff">+2</text>
</g>
${neonLabel("DOUBLE SPEED", 90, 196, 14, NEON.wild)}
${neonCaption(`wilddoublespeed ${copy}`, true)}`, NEON.wild);
}

function powerCard(color, label) {
  const c = NEON[color];
  return surface(`
<g transform="rotate(-12 90 128)">
<ellipse cx="90" cy="128" rx="62" ry="68" fill="none" stroke="url(#edge)" stroke-width="9" filter="url(#soft)" opacity="0.7"/>
<ellipse cx="90" cy="128" rx="62" ry="68" fill="none" stroke="url(#edge)" stroke-width="7"/>
<ellipse cx="90" cy="128" rx="62" ry="68" fill="none" stroke="#fff" stroke-opacity="0.85" stroke-width="2"/>
</g>
<g style="filter:drop-shadow(0 0 10px ${c[0]})">
<text x="90" y="148" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-style="italic" font-size="44" fill="#ffffff">${label}</text>
</g>
${neonLabel("POWER", 90, 205, 14, c)}`, c);
}

function wildGrabTowerCard() {
  return surface(`
<g opacity="0.9">${QUADRANT}</g>
<ellipse cx="90" cy="132" rx="60" ry="70" fill="#0A0A0E" fill-opacity="0.62" stroke="url(#edge)" stroke-width="8" transform="rotate(-12 90 132)"/>
<g style="filter:drop-shadow(0 0 12px #18FFFF)">
<text x="90" y="142" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-style="italic" font-size="34" fill="#ffffff">GRAB</text>
</g>
${neonLabel("WILD TOWER", 90, 200, 14, NEON.wild)}`, NEON.wild);
}

function showdownNumberCard(color, value, copy) {
  const c = NEON[color];
  return surface(`
<g transform="rotate(-12 90 128)">
<ellipse cx="90" cy="128" rx="62" ry="68" fill="none" stroke="url(#edge)" stroke-width="9" filter="url(#soft)" opacity="0.7"/>
<ellipse cx="90" cy="128" rx="62" ry="68" fill="none" stroke="url(#edge)" stroke-width="7"/>
<ellipse cx="90" cy="128" rx="62" ry="68" fill="none" stroke="#fff" stroke-opacity="0.85" stroke-width="2"/>
</g>
<g style="filter:drop-shadow(0 0 10px ${c[0]})">
<text x="90" y="140" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-style="italic" font-size="62" fill="#ffffff">${value}</text>
</g>
${neonLabel("SHOWDOWN", 90, 195, 14, c)}
${neonCaption(`${color} showdown ${value} ${copy}`, true)}`, c);
}

function wildShowdownCard(copy) {
  return surface(`
<g opacity="0.9">${QUADRANT}</g>
<ellipse cx="90" cy="132" rx="60" ry="70" fill="#0A0A0E" fill-opacity="0.62" stroke="url(#edge)" stroke-width="8" transform="rotate(-12 90 132)"/>
<g style="filter:drop-shadow(0 0 12px #18FFFF)">
<text x="90" y="140" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-style="italic" font-size="46" fill="#ffffff">S</text>
</g>
${neonLabel("WILD SHOWDOWN", 90, 196, 13, NEON.wild)}
${neonCaption(`wildshowdown ${copy}`, true)}`, NEON.wild);
}

function dareCard(color, copy) {
  const c = NEON[color];
  return surface(`
<g transform="rotate(-12 90 128)">
<ellipse cx="90" cy="128" rx="62" ry="68" fill="none" stroke="url(#edge)" stroke-width="9" filter="url(#soft)" opacity="0.7"/>
<ellipse cx="90" cy="128" rx="62" ry="68" fill="none" stroke="url(#edge)" stroke-width="7"/>
<ellipse cx="90" cy="128" rx="62" ry="68" fill="none" stroke="#fff" stroke-opacity="0.85" stroke-width="2"/>
</g>
<g style="filter:drop-shadow(0 0 10px ${c[0]})">
<text x="90" y="150" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-style="italic" font-size="58" fill="#ffffff">?</text>
</g>
${neonLabel("DARE", 90, 214, 16, c)}
${neonCaption(`${color} dare ${copy}`, true)}`, c);
}

function wildDareCard(copy) {
  return surface(`
<g opacity="0.9">${QUADRANT}</g>
<ellipse cx="90" cy="132" rx="60" ry="70" fill="#0A0A0E" fill-opacity="0.62" stroke="url(#edge)" stroke-width="8" transform="rotate(-12 90 132)"/>
<g style="filter:drop-shadow(0 0 12px #18FFFF)">
<text x="90" y="142" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-style="italic" font-size="54" fill="#ffffff">?</text>
</g>
${neonLabel("WILD DARE", 90, 216, 15, NEON.wild)}
${neonCaption(`wilddare ${copy}`, true)}`, NEON.wild);
}

function modCardArt() {
  return surface(`
<g opacity="0.9">${QUADRANT}</g>
<ellipse cx="90" cy="132" rx="60" ry="70" fill="#0A0A0E" fill-opacity="0.62" stroke="url(#edge)" stroke-width="8" transform="rotate(-12 90 132)"/>
<g style="filter:drop-shadow(0 0 12px #18FFFF)">
<text x="90" y="142" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-style="italic" font-size="48" fill="#ffffff">MOD</text>
</g>
${neonLabel("GIVE A COLOUR", 90, 200, 13, NEON.wild)}`, NEON.wild);
}

const ALL_WILD_ART = [
  ["awWild", "WILD"],
  ["awReverse", "REVERSE"],
  ["awSkip", "SKIP"],
  ["awSkipTwo", "SKIP 2"],
  ["awDrawTwo", "DRAW 2"],
  ["awDrawFour", "DRAW 4"],
  ["awTargetDrawTwo", "TARGET 2"],
  ["awForcedSwap", "SWAP"],
];

function allWildCard(label) {
  return surface(`
<g opacity="0.9">${QUADRANT}</g>
<ellipse cx="90" cy="132" rx="60" ry="70" fill="#0A0A0E" fill-opacity="0.62" stroke="url(#edge)" stroke-width="8" transform="rotate(-12 90 132)"/>
<g style="filter:drop-shadow(0 0 12px #18FFFF)">
<text x="90" y="142" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-style="italic" font-size="${label.length > 5 ? 24 : 32}" fill="#ffffff">${label}</text>
</g>
${neonLabel("ALL WILD", 90, 196, 14, NEON.wild)}`, NEON.wild);
}

const LIGHT_PALETTE = {
  red: ["#e8402a", "#ff8a75"],
  yellow: ["#f2c600", "#ffe680"],
  green: ["#1fa45b", "#69f0ae"],
  blue: ["#2464d6", "#82b1ff"],
};
const DARK_PALETTE = {
  pink: ["#c2185b", "#ff5c9a"],
  teal: ["#00796b", "#2de1c2"],
  orange: ["#d95400", "#ff9e40"],
  purple: ["#6a1b9a", "#c471ed"],
};

function lightSurface(inner, pair) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 270" width="180" height="270" role="img">
<defs>
<linearGradient id="edge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${pair[0]}"/><stop offset="1" stop-color="${pair[1]}"/></linearGradient>
<radialGradient id="glow"><stop offset="0" stop-color="${pair[1]}" stop-opacity="0.4"/><stop offset="1" stop-color="${pair[1]}" stop-opacity="0"/></radialGradient>
<filter id="soft"><feGaussianBlur stdDeviation="6"/></filter>
</defs>
<rect x="3" y="3" width="174" height="264" rx="14" fill="#ffffff" stroke="#ffffff" stroke-width="4"/>
<rect x="9" y="9" width="162" height="252" rx="10" fill="#f8fafc" stroke="url(#edge)" stroke-width="2"/>
<rect x="12" y="12" width="156" height="246" rx="8" fill="url(#glow)"/>
${inner}
</svg>`;
}

function darkSurface(inner, pair) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 270" width="180" height="270" role="img">
<defs>
<linearGradient id="edge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${pair[0]}"/><stop offset="1" stop-color="${pair[1]}"/></linearGradient>
<radialGradient id="glow"><stop offset="0" stop-color="${pair[0]}" stop-opacity="0.42"/><stop offset="1" stop-color="${pair[0]}" stop-opacity="0"/></radialGradient>
<filter id="soft"><feGaussianBlur stdDeviation="8"/></filter>
</defs>
<rect x="3" y="3" width="174" height="264" rx="10" fill="#0A0A0E" stroke="#000000" stroke-width="5"/>
<rect x="7" y="7" width="166" height="256" rx="8" fill="none" stroke="url(#edge)" stroke-width="3" filter="url(#soft)" opacity="0.7"/>
<rect x="9" y="9" width="162" height="252" rx="7" fill="url(#glow)" stroke="#000000" stroke-width="2"/>
${inner}
</svg>`;
}

function lightCorner(pair, text) {
  return `<g font-family="Arial, Helvetica, sans-serif" font-weight="900" font-style="italic" font-size="18" fill="${pair[0]}" style="filter:drop-shadow(0 0 4px ${pair[1]})">
<text x="14" y="26">${text}</text>
<text x="166" y="252" text-anchor="end" transform="rotate(180 166 252)">${text}</text>
</g>`;
}

function neonLabel(text, x, y, size, pair, weight = 900) {
  return `<text x="${x}" y="${y}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="${weight}" font-style="italic" font-size="${size}" fill="${pair[0]}" style="filter:drop-shadow(0 0 10px ${pair[1]})">${text}</text>`;
}

function neonCaption(text, dark) {
  return `<text x="90" y="238" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="9" font-weight="700" font-style="italic" fill="${dark ? "#b9c2d0" : "#64748b"}">${text}</text>`;
}

const THEMES = {
  light: {
    colors: LIGHT_PALETTE,
    frame: (inner, pair) => lightSurface(inner, pair),
    corner: lightCorner,
    stroke: "#0f172a",
    dark: false,
    wildColors: [LIGHT_PALETTE.red[0], LIGHT_PALETTE.yellow[0], LIGHT_PALETTE.green[0], LIGHT_PALETTE.blue[0]],
  },
  dark: {
    colors: DARK_PALETTE,
    frame: (inner, pair) => darkSurface(inner, pair),
    corner: (pair, text) => corner(text),
    stroke: "#000000",
    dark: true,
    wildColors: [DARK_PALETTE.pink[0], DARK_PALETTE.teal[0], DARK_PALETTE.orange[0], DARK_PALETTE.purple[0]],
  },
};

function quadrants(colors) {
  return `<g opacity="0.85">
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
<g transform="rotate(-18 90 135)">
<ellipse cx="90" cy="135" rx="62" ry="78" fill="none" stroke="url(#edge)" stroke-width="9" filter="url(#soft)" opacity="0.6"/>
<ellipse cx="90" cy="135" rx="62" ry="78" fill="none" stroke="url(#edge)" stroke-width="7"/>
</g>
${neonLabel(String(value), 90, 158, 86, pair)}
${neonCaption(`${theme.dark ? "dark" : "light"} ${color} ${value} ${copy}`, theme.dark)}`;
  return theme.frame(inner, pair);
}

function flipAction(theme, color, cornerText, text, glyph, kind, copy) {
  const pair = theme.colors[color];
  const inner = `${theme.corner(pair, cornerText)}
<g transform="rotate(45 90 135)">
<rect x="50" y="95" width="80" height="80" rx="14" fill="none" stroke="url(#edge)" stroke-width="9" filter="url(#soft)" opacity="0.6"/>
<rect x="50" y="95" width="80" height="80" rx="14" fill="none" stroke="url(#edge)" stroke-width="7"/>
</g>
${neonLabel(glyph, 90, 146, 54, pair)}
${neonLabel(text, 90, 186, 15, pair, 800)}
${neonCaption(`${theme.dark ? "dark" : "light"} ${color} ${kind} ${copy}`, theme.dark)}`;
  return theme.frame(inner, pair);
}

function flipFlip(theme, color, copy) {
  const pair = theme.colors[color];
  const inner = `${theme.corner(pair, "FLIP")}
${flipSymbol(pair, theme.stroke)}
${neonLabel("FLIP", 90, 214, 20, pair)}
${neonCaption(`${theme.dark ? "dark" : "light"} ${color} flip ${copy}`, theme.dark)}`;
  return theme.frame(inner, pair);
}

function flipWild(theme, kind, text, copy, colors) {
  const pair = theme.dark ? DARK_PALETTE.purple : LIGHT_PALETTE.red;
  const inner = `${theme.corner(pair, "WILD")}
${quadrants(colors)}
<ellipse cx="90" cy="135" rx="60" ry="74" fill="#0A0A0E" fill-opacity="0.6" transform="rotate(-18 90 135)"/>
<ellipse cx="90" cy="135" rx="60" ry="74" fill="none" stroke="url(#edge)" stroke-width="8" transform="rotate(-18 90 135)"/>
${neonLabel("W", 90, 150, 64, pair)}
${neonLabel(text, 90, 188, 18, pair)}
${neonCaption(`${theme.dark ? "dark" : "light"} ${kind} ${copy}`, theme.dark)}`;
  return theme.frame(inner, pair);
}

function flipWildDraw(theme, kind, text, glyph, copy, colors) {
  const pair = theme.dark ? DARK_PALETTE.purple : LIGHT_PALETTE.red;
  const isColor = kind === "wilddrawcolor";
  const center = isColor ? colorWheel(colors, 90, 118, 40, theme.stroke) : neonLabel(glyph, 90, 142, 64, pair);
  const inner = `${theme.corner(pair, isColor ? "WDC" : "+2")}
${quadrants(colors)}
<ellipse cx="90" cy="135" rx="60" ry="74" fill="#0A0A0E" fill-opacity="0.6" transform="rotate(-18 90 135)"/>
<ellipse cx="90" cy="135" rx="60" ry="74" fill="none" stroke="url(#edge)" stroke-width="8" transform="rotate(-18 90 135)"/>
${center}
${neonLabel(text, 90, isColor ? 196 : 188, isColor ? 13 : 15, pair, 800)}
${neonCaption(`${theme.dark ? "dark" : "light"} ${kind} ${copy}`, theme.dark)}`;
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
writeFileSync(path.join(OUT, "card-back.svg"), back());
let count = 1;
for (const color of Object.keys(NEON).filter((c) => c !== "wild")) {
  for (let value = 0; value <= 9; value += 1) {
    for (let copy = 0; copy < (value === 0 ? 1 : 2); copy += 1) {
      writeFileSync(path.join(OUT, `${color}-${value}-${copy}.svg`), numberCard(color, value));
      count += 1;
    }
  }
  for (const kind of ["skip", "reverse", "draw2"]) {
    for (let copy = 0; copy < 2; copy += 1) {
      writeFileSync(path.join(OUT, `${color}-${kind}-${copy}.svg`), actionCard(color, kind));
      count += 1;
    }
  }
  for (const kind of ["hit1", "hit2"]) {
    const damage = kind === "hit1" ? 1 : 2;
    for (let copy = 0; copy < damage; copy += 1) {
      writeFileSync(path.join(OUT, `${color}-${kind}-${copy}.svg`), hitCard(color, damage));
      count += 1;
    }
  }
  for (let copy = 0; copy < 2; copy += 1) {
    writeFileSync(path.join(OUT, `${color}-discardall-${copy}.svg`), discardAllCard(color));
    count += 1;
  }
  for (let copy = 0; copy < 2; copy += 1) {
    writeFileSync(path.join(OUT, `${color}-draw4-${copy}.svg`), draw4Card(color, 4));
    writeFileSync(path.join(OUT, `${color}-skipeveryone-${copy}.svg`), skipEveryoneCard(color));
    count += 2;
  }
  writeFileSync(path.join(OUT, `${color}-discardall-2.svg`), discardAllCard(color));
  count += 1;
}
for (const kind of ["wild", "wild4"]) {
  for (let copy = 0; copy < 4; copy += 1) {
    writeFileSync(path.join(OUT, `${kind}-${copy}.svg`), wildCard(kind));
    count += 1;
  }
}
for (let copy = 0; copy < 4; copy += 1) {
  writeFileSync(path.join(OUT, `wildattack-${copy}.svg`), wildAttackCard());
  count += 1;
}
for (let copy = 0; copy < 4; copy += 1) {
  writeFileSync(path.join(OUT, `wilddraw6-${copy}.svg`), wildDrawCard(6));
  writeFileSync(path.join(OUT, `wilddraw10-${copy}.svg`), wildDrawCard(10));
  count += 2;
}
for (let copy = 0; copy < 8; copy += 1) {
  writeFileSync(path.join(OUT, `wildreverse4-${copy}.svg`), wildReverse4Card());
  writeFileSync(path.join(OUT, `wildroulette-${copy}.svg`), wildRouletteCard());
  count += 2;
}
for (const color of Object.keys(NEON).filter((c) => c !== "wild")) {
  writeFileSync(path.join(OUT, `${color}-reversedraw2-0.svg`), reversePackColoredCard(color, "reverseDraw2", 0));
  writeFileSync(path.join(OUT, `${color}-reverseskip-0.svg`), reversePackColoredCard(color, "reverseSkip", 0));
  count += 2;
}
for (let copy = 0; copy < 4; copy += 1) {
  writeFileSync(path.join(OUT, `wildpowerreverse-${copy}.svg`), reversePackWildCard("wildPowerReverse", copy));
  writeFileSync(path.join(OUT, `wildnou-${copy}.svg`), reversePackWildCard("wildNoU", copy));
  count += 2;
}
for (const color of Object.keys(NEON).filter((c) => c !== "wild")) {
  writeFileSync(path.join(OUT, `${color}-stack1-0.svg`), stackPackColoredCard(color, "stack1", 0));
  writeFileSync(path.join(OUT, `${color}-stack2-0.svg`), stackPackColoredCard(color, "stack2", 0));
  count += 2;
}
for (let copy = 0; copy < 4; copy += 1) {
  writeFileSync(path.join(OUT, `wildstack3-${copy}.svg`), stackPackWildCard("wildStack3", copy));
  writeFileSync(path.join(OUT, `wildstacknumber-${copy}.svg`), stackPackWildCard("wildStackNumber", copy));
  count += 2;
}
const SPEED_VALUES = { red: [3, 4, 5], yellow: [1, 2, 3], green: [7, 8, 9], blue: [5, 6, 7] };
for (const [color, values] of Object.entries(SPEED_VALUES)) {
  for (const value of values) {
    writeFileSync(path.join(OUT, `${color}-speedup-${value}.svg`), speedPackColoredCard(color, value, 0));
    count += 1;
  }
}
for (let copy = 0; copy < 4; copy += 1) {
  writeFileSync(path.join(OUT, `wilddoublespeed-${copy}.svg`), speedPackWildCard(copy));
  count += 1;
}
for (const [kind, label] of ALL_WILD_ART) {
  writeFileSync(path.join(OUT, `${kind}-0.svg`), allWildCard(label));
  count += 1;
}
for (const color of Object.keys(NEON).filter((c) => c !== "wild")) {
  writeFileSync(path.join(OUT, `${color}-dare-0.svg`), dareCard(color, 0));
  count += 1;
}
for (let copy = 0; copy < 4; copy += 1) {
  writeFileSync(path.join(OUT, `wilddare-${copy}.svg`), wildDareCard(copy));
  count += 1;
}
for (const color of Object.keys(NEON).filter((c) => c !== "wild")) {
  writeFileSync(path.join(OUT, `${color}-showdown-0.svg`), showdownNumberCard(color, 0, 0));
  count += 1;
}
writeFileSync(path.join(OUT, "wildshowdown-0.svg"), wildShowdownCard(0));
count += 1;
for (const color of Object.keys(NEON).filter((c) => c !== "wild")) {
  for (const power of ["U", "N", "O", "!"]) {
    writeFileSync(path.join(OUT, `${color}-power-${power}-0.svg`), powerCard(color, power));
    count += 1;
  }
  writeFileSync(path.join(OUT, `${color}-draw1-0.svg`), powerCard(color, "+1"));
  count += 1;
  writeFileSync(path.join(OUT, `${color}-grab2towers-0.svg`), powerCard(color, "G2"));
  count += 1;
}
writeFileSync(path.join(OUT, "wildgrabtower-0.svg"), wildGrabTowerCard());
count += 1;
for (let copy = 0; copy < 4; copy += 1) {
  writeFileSync(path.join(OUT, `modcard-${copy}.svg`), modCardArt());
  count += 1;
}
for (const color of Object.keys(NEON).filter((c) => c !== "wild")) {
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
console.log(`wrote ${count} neon card SVGs to ${OUT}`);
