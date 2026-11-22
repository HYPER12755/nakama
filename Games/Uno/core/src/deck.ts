import { COLORS, type Card, type Color, type GameMode } from "./types";
import { nextSeed, randomInt } from "./rng";

export function cardId(card: Omit<Card, "id">): string {
  if (card.kind === "wild") return "wild";
  if (card.kind === "wild4") return "wild4";
  if (card.kind === "wildAttack") return "wildattack";
  if (card.kind === "wildDraw6") return "wilddraw6";
  if (card.kind === "wildDraw10") return "wilddraw10";
  if (card.kind === "wildReverse4") return "wildreverse4";
  if (card.kind === "wildRoulette") return "wildroulette";
  if (card.kind === "discardAll") return `${card.color}-discardall`;
  if (card.kind === "skipEveryone") return `${card.color}-skipeveryone`;
  if (card.kind === "draw4") return `${card.color}-draw4`;
  return `${card.color}-${card.kind === "number" ? card.value : card.kind}`;
}

export function buildDeck(mode: GameMode = "classic"): Card[] {
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
