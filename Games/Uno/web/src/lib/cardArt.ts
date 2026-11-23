import type { Card, CardKind, Color } from "@moongames/uno-core";

export type UnoCardSet = "classic" | "neon";

const PALETTE: Record<string, { main: string; deep: string; light: string }> = {
  red: { main: "#ef3b36", deep: "#8f1317", light: "#ff8a7a" },
  yellow: { main: "#f7bf18", deep: "#a36b00", light: "#ffe98a" },
  green: { main: "#16a55e", deep: "#075c37", light: "#7ff0b4" },
  blue: { main: "#2f70e6", deep: "#123a86", light: "#8fb8ff" },
  pink: { main: "#ec4fa4", deep: "#8a1459", light: "#ff9ad2" },
  teal: { main: "#14b8b0", deep: "#075f61", light: "#80f2ea" },
  orange: { main: "#ef8a2b", deep: "#9b4306", light: "#ffc184" },
  purple: { main: "#8f5ce8", deep: "#4a238f", light: "#c7a7ff" },
  wild: { main: "#111827", deep: "#020617", light: "#64748b" },
};

const LABELS: Partial<Record<CardKind, string>> = {
  skip: "SKIP",
  reverse: "REVERSE",
  draw2: "DRAW 2",
  wild: "WILD",
  wild4: "WILD +4",
  hit1: "HIT 1",
  hit2: "HIT 2",
  discardAll: "DISCARD ALL",
  wildAttack: "ATTACK",
  draw4: "DRAW 4",
  skipEveryone: "SKIP ALL",
  wildDraw6: "DRAW 6",
  wildDraw10: "DRAW 10",
  wildReverse4: "REVERSE 4",
  wildRoulette: "ROULETTE",
  draw1: "DRAW 1",
  flip: "FLIP",
  draw5: "DRAW 5",
  wildDraw2: "WILD +2",
  wildDrawColor: "DRAW COLOUR",
  swap1: "SWAP 1",
  refreshHand: "REFRESH HAND",
  wildForceTrade: "FORCE TRADE",
  wildPassHands: "PASS HANDS",
  reverseDraw2: "REVERSE +2",
  reverseSkip: "REVERSE SKIP",
  wildPowerReverse: "POWER REVERSE",
  wildNoU: "NO U!",
  wildDoubleSpeed: "DOUBLE SPEED",
  awWild: "WILD",
  awReverse: "REVERSE",
  awSkip: "SKIP",
  awSkipTwo: "SKIP TWO",
  awDrawTwo: "DRAW TWO",
  awDrawFour: "DRAW FOUR",
  awTargetDrawTwo: "TARGET +2",
  awForcedSwap: "FORCE SWAP",
  dare: "DARE",
  wildDare: "WILD DARE",
  dareList: "DARE",
  wildShowdown: "SHOWDOWN",
  modCard: "MOD",
  grab2Towers: "GRAB 2",
  wildGrabTower: "TOWER GRAB",
  stack1: "STACK +1",
  stack2: "STACK +2",
  wildStack3: "STACK +3",
  wildStackNumber: "STACK #",
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function svgDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function paletteFor(card: Card): { main: string; deep: string; light: string } {
  return PALETTE[card.color ?? "wild"] ?? PALETTE.wild;
}

function copyNumber(card: Card): number {
  const match = card.id.match(/-(\d+)$/);
  return match === null ? 0 : Number(match[1]);
}

const SHORT_LABELS: Partial<Record<CardKind, string>> = {
  reverse: "REV",
  reverseSkip: "R-SKIP",
  reverseDraw2: "R+2",
  skipEveryone: "ALL",
  discardAll: "ALL",
  wildReverse4: "R+4",
  wildRoulette: "WHEEL",
  wildDraw2: "W+2",
  wildDraw6: "W+6",
  wildDraw10: "W+10",
  wildDoubleSpeed: "2X",
  wildPowerReverse: "PWR",
  wildGrabTower: "TOWER",
  wildStackNumber: "STACK",
  wildStack3: "S+3",
  wildShowdown: "SHOW",
  wildForceTrade: "TRADE",
  wildPassHands: "PASS",
  wildAttack: "ATK",
  wildDare: "DARE",
  refreshHand: "FRESH",
  grab2Towers: "GRAB2",
  showdownNumber: "SHOW",
  modCard: "MOD",
};

function labelFor(card: Card): string {
  if (card.kind === "number") return String(card.value ?? 0);
  if (card.kind === "speedUp") return `SPEED +${copyNumber(card) + 1}`;
  if (card.kind === "showdownNumber") return `SHOWDOWN ${card.value ?? 0}`;
  return LABELS[card.kind] ?? card.kind.replace(/([a-z])([A-Z])/g, "$1 $2").toUpperCase();
}

function shortLabelFor(card: Card): string {
  if (card.kind === "number") return String(card.value ?? 0);
  if (card.kind === "speedUp") return `S+${copyNumber(card) + 1}`;
  return SHORT_LABELS[card.kind] ?? labelFor(card).slice(0, 5);
}

function pinwheel(): string {
  return [
    '<path d="M90 18 154 72 90 135 26 72Z" fill="#ef3b36"/>',
    '<path d="M162 90 154 154 90 135 154 72Z" fill="#f7bf18"/>',
    '<path d="M90 162 26 154 90 135 154 154Z" fill="#16a55e"/>',
    '<path d="M18 90 26 26 90 135 26 72Z" fill="#2f70e6"/>',
    '<ellipse cx="90" cy="135" rx="61" ry="74" fill="#0b1224" stroke="#f8fafc" stroke-width="3"/>',
  ].join("");
}

function bolt(cx: number, cy: number, scale = 1): string {
  return `<g transform="translate(${cx} ${cy}) scale(${scale})"><path d="M6 -34 -18 4 -2 4 -12 34 22 -8 4 -8 18 -34Z" fill="#f7bf18" stroke="#fff7d6" stroke-width="2" stroke-linejoin="round"/></g>`;
}

function glyphFor(card: Card, main: string, light: string): string {
  const big = (text: string, size = 72) =>
    `<text x="90" y="156" text-anchor="middle" font-family="'Arial Black',Arial,sans-serif" font-weight="900" font-size="${size}" fill="#ffffff" stroke="#0b1224" stroke-width="4" paint-order="stroke">${escapeXml(text)}</text>`;
  switch (card.kind) {
    case "number":
      return big(String(card.value ?? 0), 92);
    case "skip":
    case "awSkip":
      return `<circle cx="90" cy="135" r="54" fill="none" stroke="#ffffff" stroke-width="15"/><path d="M50 175 130 95" stroke="#ffffff" stroke-width="16" stroke-linecap="round"/>`;
    case "reverse":
    case "awReverse":
    case "wildPowerReverse":
      return `<path d="M48 118c8-28 45-42 71-22l-18 4 8 20 32-8-8-32-8 8C100 62 50 78 40 118Z" fill="#ffffff"/><path d="M132 152c-8 28-45 42-71 22l18-4-8-20-32 8 8 32 8-8c25 26 75 10 85-30Z" fill="${light}"/>`;
    case "draw1":
    case "draw2":
    case "draw4":
    case "draw5":
    case "wildDraw2":
    case "wildDraw6":
    case "wildDraw10":
    case "awDrawTwo":
    case "awDrawFour":
    case "awTargetDrawTwo": {
      const amount = card.kind === "draw1" ? 1 : card.kind === "draw2" || card.kind === "awDrawTwo" || card.kind === "awTargetDrawTwo" ? 2 : card.kind === "draw4" || card.kind === "awDrawFour" || card.kind === "wildDraw2" ? 4 : card.kind === "draw5" ? 5 : card.kind === "wildDraw6" ? 6 : 10;
      return `<g><rect x="48" y="82" width="58" height="88" rx="8" fill="#ffffff" stroke="#0b1224" stroke-width="4" transform="rotate(-12 77 126)"/><rect x="74" y="82" width="58" height="88" rx="8" fill="${light}" stroke="#0b1224" stroke-width="4" transform="rotate(10 103 126)"/>${big(`+${amount}`, 46)}</g>`;
    }
    case "hit1":
    case "wildAttack":
      return `<circle cx="90" cy="135" r="62" fill="none" stroke="#ffffff" stroke-width="6" stroke-dasharray="10 8"/>${bolt(90, 135, 1.25)}`;
    case "hit2":
      return `<circle cx="90" cy="135" r="62" fill="none" stroke="#ffffff" stroke-width="6" stroke-dasharray="10 8"/>${bolt(64, 128, 0.85)}${bolt(116, 142, 0.85)}`;
    case "discardAll":
      return `<path d="M34 178c34 28 78 28 112 0" fill="none" stroke="#ffffff" stroke-width="12" stroke-linecap="round"/><path d="M48 96h84M48 118h84M48 140h60" stroke="${light}" stroke-width="10" stroke-linecap="round"/>`;
    case "modCard":
      return `<g fill="#f8fafc"><path d="M90 62 105 74 123 69 130 87 148 94 143 112 155 127 142 141 146 159 128 164 118 181 100 176 84 188 70 175 52 178 48 159 32 151 38 133 28 118 42 105 40 86 59 83 69 67Z"/><circle cx="90" cy="128" r="28" fill="#0b1224"/></g>${big("MOD", 30)}`;
    case "dare":
    case "wildDare":
    case "dareList":
      return `<path d="M90 60c30 18 44 44 40 70-3 20-18 30-40 30s-37-10-40-30c-4-26 10-52 40-70Z" fill="${main}" stroke="#ffffff" stroke-width="5"/>${big("?", 92)}`;
    case "showdownNumber":
    case "wildShowdown":
      return `<path d="M40 92 140 176M140 92 40 176" stroke="#ffffff" stroke-width="12" stroke-linecap="round"/><circle cx="90" cy="134" r="22" fill="${main}" stroke="#f8fafc" stroke-width="5"/>`;
    case "grab2Towers":
    case "wildGrabTower":
      return `<path d="M54 180V94h24v86M102 180V68h24v112M138 180v-58h18v58" fill="${light}" stroke="#0b1224" stroke-width="4"/><path d="M46 94h40M94 68h40" stroke="#ffffff" stroke-width="8" stroke-linecap="round"/>`;
    case "stack1":
    case "stack2":
    case "wildStack3":
    case "wildStackNumber":
      return `<g fill="${light}" stroke="#0b1224" stroke-width="4"><rect x="42" y="154" width="96" height="42" rx="8"/><rect x="52" y="118" width="96" height="42" rx="8"/><rect x="62" y="82" width="96" height="42" rx="8"/></g>`;
    case "speedUp":
    case "wildDoubleSpeed":
      return `<path d="M42 102h54l-22-30h54l-22-30M138 168H84l22 30H52l22 30" fill="none" stroke="#ffffff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>`;
    case "reverseDraw2":
      return `<path d="M48 114c10-24 44-34 68-16l-18 4 8 18 30-8-8-30-8 8c-25-20-66-6-78 24Z" fill="#ffffff"/>${big("+2", 42)}`;
    case "reverseSkip":
      return `<path d="M46 114c10-24 44-34 68-16l-18 4 8 18 30-8-8-30-8 8c-25-20-66-6-78 24Z" fill="#ffffff"/><circle cx="94" cy="150" r="22" fill="none" stroke="#ffffff" stroke-width="10"/>`;
    case "wildNoU":
      return big("NO U!", 44);
    case "wildRoulette":
      return `<circle cx="90" cy="135" r="60" fill="#0b1224" stroke="#f8fafc" stroke-width="6"/><path d="M90 135 90 82M90 135 137 135M90 135 58 176" stroke="#ffffff" stroke-width="10" stroke-linecap="round"/><circle cx="90" cy="135" r="12" fill="#f7bf18"/>`;
    case "flip":
      return `<rect x="42" y="82" width="96" height="106" rx="10" fill="${light}" stroke="#ffffff" stroke-width="5" transform="rotate(-10 90 135)"/><rect x="42" y="82" width="96" height="106" rx="10" fill="#0b1224" stroke="#f7bf18" stroke-width="5" transform="rotate(10 90 135)"/>`;
    case "swap1":
    case "wildForceTrade":
    case "awForcedSwap":
      return `<path d="M46 112h72l-18-18h28l30 30-30 30H64l18-18H46Z" fill="#ffffff"/><path d="M134 158H62l18 18H52l-30-30 30-30h70l-18 18h72Z" fill="${light}"/>`;
    case "refreshHand":
    case "wildPassHands":
      return `<path d="M46 132a44 44 0 0 1 76-30l-16 14 34 4-4-34-12 12a62 62 0 0 0-98 44Z" fill="#ffffff"/><path d="M134 138a44 44 0 0 1-76 30l16-14-34-4 4 34 12-12a62 62 0 0 0 98-44Z" fill="${light}"/>`;
    case "awSkipTwo":
      return `<circle cx="66" cy="135" r="30" fill="none" stroke="#ffffff" stroke-width="11"/><circle cx="114" cy="135" r="30" fill="none" stroke="#ffffff" stroke-width="11"/><path d="M44 157 88 113M92 157 136 113" stroke="#ffffff" stroke-width="10" stroke-linecap="round"/>`;
    case "awWild":
    case "wild":
    case "wild4":
    case "wildDrawColor":
      return "";
    default:
      return `<path d="M90 70 148 135 90 200 32 135Z" fill="${light}" stroke="#ffffff" stroke-width="5"/>`;
  }
}

function texture(neon: boolean): string {
  return [
    '<defs>',
    `<linearGradient id="paper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${neon ? "#18213a" : "#ffffff"}"/><stop offset="0.55" stop-color="${neon ? "#0d1428" : "#fffdf7"}"/><stop offset="1" stop-color="${neon ? "#070b18" : "#f1eadc"}"/></linearGradient>`,
    '<pattern id="weave" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M0 6h12M6 0v12" stroke="#0f172a" stroke-opacity="0.06" stroke-width="1"/><circle cx="6" cy="6" r="1" fill="#0f172a" fill-opacity="0.05"/></pattern>',
    '<filter id="lift" x="-25%" y="-25%" width="150%" height="150%"><feDropShadow dx="0" dy="6" stdDeviation="7" flood-color="#020617" flood-opacity="0.45"/></filter>',
    '<linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.45"/><stop offset="0.45" stop-color="#ffffff" stop-opacity="0.05"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>',
    '</defs>',
  ].join("");
}

function frame(neon: boolean): string {
  const border = neon ? "#7dd3fc" : "#0f172a";
  return [
    `<rect x="3" y="3" width="174" height="264" rx="19" fill="url(#paper)" stroke="${border}" stroke-width="3" filter="url(#lift)"/>`,
    `<rect x="9" y="9" width="162" height="252" rx="14" fill="url(#weave)" stroke="${neon ? "#38bdf8" : "#cbd5e1"}" stroke-width="1.5"/>`,
    `<path d="M14 58Q90 6 166 58" fill="none" stroke="${neon ? "#38bdf8" : "#e2e8f0"}" stroke-opacity="0.7" stroke-width="2"/>`,
  ].join("");
}

export function cardSvg(card: Card, set: UnoCardSet = "classic"): string {
  const neon = set === "neon";
  const colors = paletteFor(card);
  const label = labelFor(card);
  const isWild = card.color === null;
  const pin = isWild ? pinwheel() : "";
  const glyph = glyphFor(card, colors.main, colors.light);
  const centreFill = isWild ? "#0b1224" : colors.main;
  const corner = shortLabelFor(card);
  const index = `<g fill="${isWild ? "#111827" : colors.deep}" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="18"><text x="22" y="36">${escapeXml(corner)}</text><text x="158" y="246" text-anchor="end" transform="rotate(180 158 246)">${escapeXml(corner)}</text></g>`;
  const middle = isWild
    ? `${pin}${glyph}<text x="90" y="152" text-anchor="middle" font-family="'Arial Black',Arial,sans-serif" font-weight="900" font-size="${label.length > 8 ? 22 : 34}" fill="#ffffff" stroke="#f7bf18" stroke-opacity="0.5" stroke-width="5" paint-order="stroke">${escapeXml(label)}</text>`
    : `<ellipse cx="90" cy="135" rx="62" ry="79" fill="${centreFill}" stroke="#ffffff" stroke-width="4" transform="rotate(-16 90 135)"/>${glyph}<text x="90" y="205" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="15" letter-spacing="1.5" fill="#ffffff" stroke="#0b1224" stroke-width="3" paint-order="stroke">${escapeXml(label)}</text>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 270" width="180" height="270" role="img" aria-label="${escapeXml(label)}">`,
    texture(neon),
    frame(neon),
    index,
    middle,
    '<path d="M12 12H168V258H12Z" fill="url(#sheen)" opacity="0.35" pointer-events="none"/>',
    `<text x="90" y="238" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="8" letter-spacing="2" fill="${neon ? "#94a3b8" : "#7c8798"}">MOON GAMES</text>`,
    '</svg>',
  ].join("");
}

export function cardBackSvg(set: UnoCardSet = "classic"): string {
  const neon = set === "neon";
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 270" width="180" height="270" role="img" aria-label="Moon Games card back">',
    texture(neon),
    `<rect x="3" y="3" width="174" height="264" rx="19" fill="#0b1224" stroke="${neon ? "#38bdf8" : "#d4af37"}" stroke-width="4" filter="url(#lift)"/>`,
    `<rect x="11" y="11" width="158" height="248" rx="13" fill="none" stroke="${neon ? "#7dd3fc" : "#f4d77a"}" stroke-opacity="0.8" stroke-width="2"/>`,
    `<rect x="18" y="18" width="144" height="234" rx="10" fill="url(#weave)" stroke="#ffffff" stroke-opacity="0.12"/>`,
    `<path d="M90 38 148 90 90 142 32 90Z" fill="#ef3b36" stroke="#ffffff" stroke-width="2"/>`,
    `<path d="M148 90 148 180 90 232 90 142Z" fill="#f7bf18" stroke="#ffffff" stroke-width="2"/>`,
    `<path d="M90 232 32 180 32 90 90 142Z" fill="#2f70e6" stroke="#ffffff" stroke-width="2"/>`,
    `<path d="M90 142 148 180 90 232 32 180Z" fill="#16a55e" stroke="#ffffff" stroke-width="2"/>`,
    '<ellipse cx="90" cy="137" rx="52" ry="63" fill="#0b1224" stroke="#f4d77a" stroke-width="3"/>',
    '<text x="90" y="148" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="46" fill="#f4d77a">M</text>',
    '<text x="90" y="222" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="9" letter-spacing="3" fill="#e2e8f0">MOON GAMES</text>',
    '</svg>',
  ].join("");
}

export function cardArtDataUri(card: Card, set: UnoCardSet = "classic"): string {
  return svgDataUri(cardSvg(card, set));
}

export function cardBackDataUri(set: UnoCardSet = "classic"): string {
  return svgDataUri(cardBackSvg(set));
}

const KIND_FROM_ID = new Map<string, CardKind>(
  (["number", "skip", "reverse", "draw2", "wild", "wild4", "hit1", "hit2", "discardAll", "wildAttack", "draw4", "skipEveryone", "wildDraw6", "wildDraw10", "wildReverse4", "wildRoulette", "draw1", "flip", "draw5", "wildDraw2", "wildDrawColor", "swap1", "refreshHand", "wildForceTrade", "wildPassHands", "reverseDraw2", "reverseSkip", "wildPowerReverse", "wildNoU", "speedUp", "wildDoubleSpeed", "awWild", "awReverse", "awSkip", "awSkipTwo", "awDrawTwo", "awDrawFour", "awTargetDrawTwo", "awForcedSwap", "dare", "wildDare", "dareList", "showdownNumber", "wildShowdown", "modCard", "grab2Towers", "wildGrabTower", "stack1", "stack2", "wildStack3", "wildStackNumber"] as CardKind[]).map((kind) => [kind.toLowerCase(), kind]),
);

function cardFromId(cardId: string): Card {
  const lower = cardId.toLowerCase();
  const color = (Object.keys(PALETTE).filter((name) => name !== "wild").find((name) => lower.startsWith(`${name}-`)) ?? null) as Color | null;
  const withoutColor = color === null ? lower : lower.slice(color.length + 1);
  const withoutCopy = withoutColor.replace(/-\d+$/, "").replace(/-power-.*$/, "");
  const kind = KIND_FROM_ID.get(withoutCopy.replace(/-/g, "")) ?? "number";
  const valueMatch = withoutCopy.match(/^\d+$/);
  return {
    id: cardId,
    color,
    kind,
    ...(valueMatch === null ? {} : { value: Number(valueMatch[0]) }),
  };
}

export function cardArtForId(cardId: string, set: UnoCardSet = "classic"): string {
  if (cardId === "card-back") return cardBackDataUri(set);
  return cardArtDataUri(cardFromId(cardId), set);
}
