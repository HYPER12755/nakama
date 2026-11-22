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
console.log(`wrote ${count} neon card SVGs to ${OUT}`);
