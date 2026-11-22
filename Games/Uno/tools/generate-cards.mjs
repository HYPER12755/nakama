import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT = path.resolve("web/public/cards");
const COLORS = {
  red: "#e8402a",
  yellow: "#f2c600",
  green: "#1fa45b",
  blue: "#2464d6",
};

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
console.log(`wrote ${count} card SVGs to ${OUT}`);
