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
  const quadrant = `<path d="M90 135 L90 52 A83 83 0 0 1 173 135 Z" fill="${FOUR[0]}"/>
<path d="M90 135 L173 135 A83 83 0 0 1 90 218 Z" fill="${FOUR[1]}"/>
<path d="M90 135 L90 218 A83 83 0 0 1 7 135 Z" fill="${FOUR[2]}"/>
<path d="M90 135 L7 135 A83 83 0 0 1 90 52 Z" fill="${FOUR[3]}"/>`;
  return surface(`
<g opacity="0.9">${quadrant}</g>
<circle cx="90" cy="135" r="66" fill="#0A0A0E" fill-opacity="0.5"/>
<circle cx="90" cy="135" r="66" fill="none" stroke="url(#edge)" stroke-width="12" filter="url(#soft)" opacity="0.7"/>
<circle cx="90" cy="135" r="66" fill="none" stroke="url(#edge)" stroke-width="10"/>
<circle cx="90" cy="135" r="66" fill="none" stroke="#fff" stroke-opacity="0.9" stroke-width="3"/>
<text x="90" y="160" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${kind === "wild" ? "64" : "76"}" font-weight="900" font-style="italic" fill="#fff" style="filter:drop-shadow(0 0 20px #E040FB)">${label}</text>
${corner(label)}`, NEON.wild);
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
}
for (const kind of ["wild", "wild4"]) {
  for (let copy = 0; copy < 4; copy += 1) {
    writeFileSync(path.join(OUT, `${kind}-${copy}.svg`), wildCard(kind));
    count += 1;
  }
}
console.log(`wrote ${count} neon card SVGs to ${OUT}`);
