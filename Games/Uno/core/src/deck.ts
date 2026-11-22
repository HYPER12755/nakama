import { COLORS, flipColor, LIGHT_COLORS, type Card, type CardKind, type Color, type GameMode } from "./types";
import { nextSeed, randomInt } from "./rng";

const FLIP_KIND: Partial<Record<CardKind, CardKind>> = {
  draw1: "draw5",
  draw5: "draw1",
  skip: "skipEveryone",
  skipEveryone: "skip",
  reverse: "reverse",
  flip: "flip",
  wild: "wild",
  wildDraw2: "wildDrawColor",
  wildDrawColor: "wildDraw2",
};

const FLIP_KIND_ID: Partial<Record<CardKind, string>> = {
  draw1: "draw1",
  draw5: "draw5",
  skip: "skip",
  skipEveryone: "skipeveryone",
  reverse: "reverse",
  flip: "flip",
  wild: "wild",
  wildDraw2: "wilddraw2",
  wildDrawColor: "wilddrawcolor",
};

export function cardId(card: Omit<Card, "id">): string {
  if (card.kind === "wild") return "wild";
  if (card.kind === "wild4") return "wild4";
  if (card.kind === "wildAttack") return "wildattack";
  if (card.kind === "wildDraw6") return "wilddraw6";
  if (card.kind === "wildDraw10") return "wilddraw10";
  if (card.kind === "wildReverse4") return "wildreverse4";
  if (card.kind === "wildRoulette") return "wildroulette";
  if (card.kind === "wildForceTrade") return "wildforcetrade";
  if (card.kind === "wildPassHands") return "wildpasshands";
  if (card.kind === "swap1") return `${card.color}-swap1`;
  if (card.kind === "refreshHand") return `${card.color}-refreshhand`;
  if (card.kind === "discardAll") return `${card.color}-discardall`;
  if (card.kind === "skipEveryone") return `${card.color}-skipeveryone`;
  if (card.kind === "draw4") return `${card.color}-draw4`;
  return `${card.color}-${card.kind === "number" ? card.value : card.kind}`;
}

export function flipCard(card: Card): Card {
  const side = card.id.startsWith("light-") ? "dark" : card.id.startsWith("dark-") ? "light" : null;
  if (side === null) {
    return card;
  }
  const kind = FLIP_KIND[card.kind] ?? card.kind;
  const color = kind.startsWith("wild") || card.color === null ? null : flipColor(card.color);
  const copy = Number(card.id.slice(card.id.lastIndexOf("-") + 1));
  const kindId = card.kind === "number" ? String(card.value ?? 0) : FLIP_KIND_ID[kind] ?? kind;
  const id = color === null
    ? `${side}-${kindId}-${copy}`
    : `${side}-${color}-${kindId}-${copy}`;
  return {
    id,
    color,
    kind,
    ...(card.value === undefined ? {} : { value: card.value }),
  };
}

export function buildDeck(mode: GameMode = "classic"): Card[] {
  if (mode === "flip") {
    const deck: Card[] = [];
    for (const color of LIGHT_COLORS) {
      for (let value = 1; value <= 9; value += 1) {
        for (let copy = 0; copy < 2; copy += 1) {
          deck.push({ id: `light-${color}-${value}-${copy}`, color, kind: "number", value });
        }
      }
      for (const kind of ["draw1", "reverse", "skip", "flip"] as const) {
        for (let copy = 0; copy < 2; copy += 1) {
          deck.push({ id: `light-${color}-${kind}-${copy}`, color, kind });
        }
      }
    }
    for (let copy = 0; copy < 4; copy += 1) {
      deck.push({ id: `light-wild-${copy}`, color: null, kind: "wild" });
      deck.push({ id: `light-wilddraw2-${copy}`, color: null, kind: "wildDraw2" });
    }
    return deck;
  }
  if (mode === "noMercy") {
    const deck: Card[] = [];
    for (const color of COLORS) {
      for (let value = 0; value <= 9; value += 1) {
        for (let copy = 0; copy < 2; copy += 1) {
          const base = { color, kind: "number" as const, value };
          deck.push({ id: `${cardId(base)}-${copy}`, ...base });
        }
      }
      for (const kind of ["skip", "reverse", "draw2", "discardAll"] as const) {
        for (let copy = 0; copy < 3; copy += 1) {
          const base = { color, kind };
          deck.push({ id: `${cardId(base)}-${copy}`, ...base });
        }
      }
      for (const kind of ["draw4", "skipEveryone"] as const) {
        for (let copy = 0; copy < 2; copy += 1) {
          const base = { color, kind };
          deck.push({ id: `${cardId(base)}-${copy}`, ...base });
        }
      }
    }
    for (const [kind, copies] of [
      ["wildDraw6", 4],
      ["wildDraw10", 4],
      ["wildReverse4", 8],
      ["wildRoulette", 8],
    ] as const) {
      const base = { color: null, kind };
      for (let copy = 0; copy < copies; copy += 1) {
        deck.push({ id: `${cardId(base)}-${copy}`, ...base });
      }
    }
    return deck;
  }
  if (mode === "attack") {
    const deck: Card[] = [];
    for (const color of COLORS) {
      for (let value = 1; value <= 9; value += 1) {
        for (let copy = 0; copy < 2; copy += 1) {
          const base = { color, kind: "number" as const, value };
          deck.push({ id: `${cardId(base)}-${copy}`, ...base });
        }
      }
      for (const kind of ["hit1", "hit2", "discardAll"] as const) {
        const copies = kind === "hit1" ? 1 : 2;
        for (let copy = 0; copy < copies; copy += 1) {
          const base = { color, kind };
          deck.push({ id: `${cardId(base)}-${copy}`, ...base });
        }
      }
      for (const kind of ["reverse", "skip"] as const) {
        const copies = kind === "reverse" ? 1 : 2;
        for (let copy = 0; copy < copies; copy += 1) {
          const base = { color, kind };
          deck.push({ id: `${cardId(base)}-${copy}`, ...base });
        }
      }
    }
    for (const kind of ["wild", "wildAttack"] as const) {
      for (let copy = 0; copy < 4; copy += 1) {
        const base = { color: null, kind };
        deck.push({ id: `${cardId(base)}-${copy}`, ...base });
      }
    }
    return deck;
  }
  const deck: Card[] = [];
  for (const color of COLORS) {
    for (let value = 0; value <= 9; value += 1) {
      const count = value === 0 ? 1 : 2;
      for (let copy = 0; copy < count; copy += 1) {
        const base = { color, kind: "number" as const, value };
        deck.push({ id: `${cardId(base)}-${copy}`, ...base });
      }
    }
    for (const kind of ["skip", "reverse", "draw2"] as const) {
      for (let copy = 0; copy < 2; copy += 1) {
        const base = { color, kind };
        deck.push({ id: `${cardId(base)}-${copy}`, ...base });
      }
    }
  }
  for (const kind of ["wild", "wild4"] as const) {
    for (let copy = 0; copy < 4; copy += 1) {
      const base = { color: null, kind };
      deck.push({ id: `${base.kind}-${copy}`, ...base });
    }
  }
  if (mode === "swapPack") {
    for (const kind of ["swap1", "refreshHand"] as const) {
      for (const color of LIGHT_COLORS) {
        const base = { color, kind };
        deck.push({ id: `${cardId(base)}-0`, ...base });
      }
    }
    for (const kind of ["wildForceTrade", "wildPassHands"] as const) {
      for (let copy = 0; copy < 4; copy += 1) {
        const base = { color: null, kind };
        deck.push({ id: `${cardId(base)}-${copy}`, ...base });
      }
    }
  }
  return deck;
}

export function shuffle(seed: number, cards: Card[]): { cards: Card[]; seed: number } {
  const result = cards.slice();
  let state = seed >>> 0;
  for (let index = result.length - 1; index > 0; index -= 1) {
    const pick = randomInt(state, index + 1);
    state = nextSeed(state);
    const temp = result[index];
    result[index] = result[pick];
    result[pick] = temp;
  }
  return { cards: result, seed: state };
}

export function isActionCard(card: Card): boolean {
  return card.kind !== "number";
}

export function colorName(color: Color): string {
  return color.charAt(0).toUpperCase() + color.slice(1);
}
