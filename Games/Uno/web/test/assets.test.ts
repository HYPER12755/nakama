import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const cardsDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../public/cards");

describe("Uno card assets", () => {
  it("ships one SVG per card plus a back in both sets", () => {
    for (const set of ["cards", "cards-neon"]) {
      const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), `../public/${set}`);
      const files = readdirSync(dir).filter((name) => name.endsWith(".svg"));
      expect(files, `${set} count`).toHaveLength(569);
      expect(files, `${set} back`).toContain("card-back.svg");
      expect(files, `${set} number`).toContain("red-0-0.svg");
      expect(files, `${set} action`).toContain("blue-draw2-1.svg");
      expect(files, `${set} wild`).toContain("wild-3.svg");
      expect(files, `${set} wild4`).toContain("wild4-0.svg");
    }
  });

  it("ships attack-mode card art in both sets", () => {
    const expected: string[] = [];
    for (const color of ["red", "yellow", "green", "blue"]) {
      expected.push(`${color}-hit1-0.svg`);
      for (let copy = 0; copy < 2; copy += 1) {
        expected.push(`${color}-hit2-${copy}.svg`);
        expected.push(`${color}-discardall-${copy}.svg`);
      }
    }
    for (let copy = 0; copy < 4; copy += 1) {
      expected.push(`wildattack-${copy}.svg`);
    }
    expect(expected).toHaveLength(24);
    for (const set of ["cards", "cards-neon"]) {
      const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), `../public/${set}`);
      const files = readdirSync(dir).filter((name) => name.endsWith(".svg"));
      for (const name of expected) {
        expect(files, `${set}/${name}`).toContain(name);
      }
    }
  });

  it("ships No Mercy card art in both sets", () => {
    const expected: string[] = [];
    for (const color of ["red", "yellow", "green", "blue"]) {
      for (let copy = 0; copy < 2; copy += 1) {
        expected.push(`${color}-draw4-${copy}.svg`);
        expected.push(`${color}-skipeveryone-${copy}.svg`);
      }
      expected.push(`${color}-discardall-2.svg`);
    }
    for (let copy = 0; copy < 4; copy += 1) {
      expected.push(`wilddraw6-${copy}.svg`);
      expected.push(`wilddraw10-${copy}.svg`);
    }
    for (let copy = 0; copy < 8; copy += 1) {
      expected.push(`wildreverse4-${copy}.svg`);
      expected.push(`wildroulette-${copy}.svg`);
    }
    expect(expected).toHaveLength(44);
    for (const set of ["cards", "cards-neon"]) {
      const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), `../public/${set}`);
      const files = readdirSync(dir).filter((name) => name.endsWith(".svg"));
      for (const name of expected) {
        expect(files, `${set}/${name}`).toContain(name);
      }
    }
  });

  it("ships Uno Flip light and dark card art in both sets", () => {
    const expected: string[] = [];
    for (const side of ["light", "dark"]) {
      const colors = side === "light" ? ["red", "yellow", "green", "blue"] : ["pink", "teal", "orange", "purple"];
      for (const color of colors) {
        for (let value = 1; value <= 9; value += 1) {
          for (let copy = 0; copy < 2; copy += 1) {
            expected.push(`${side}-${color}-${value}-${copy}.svg`);
          }
        }
        const kinds = side === "light" ? ["draw1", "reverse", "skip", "flip"] : ["draw5", "reverse", "skipeveryone", "flip"];
        for (const kind of kinds) {
          for (let copy = 0; copy < 2; copy += 1) {
            expected.push(`${side}-${color}-${kind}-${copy}.svg`);
          }
        }
      }
      for (let copy = 0; copy < 4; copy += 1) {
        expected.push(`${side}-wild-${copy}.svg`);
        expected.push(`${side}-${side === "light" ? "wilddraw2" : "wilddrawcolor"}-${copy}.svg`);
      }
    }
    expect(expected).toHaveLength(224);
    for (const set of ["cards", "cards-neon"]) {
      const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), `../public/${set}`);
      const files = readdirSync(dir).filter((name) => name.endsWith(".svg"));
      for (const name of expected) {
        expect(files, `${set}/${name}`).toContain(name);
      }
    }
  });

  it("ships UNO Swap Pack card art in both sets", () => {
    const expected: string[] = [];
    for (const color of ["red", "yellow", "green", "blue"]) {
      expected.push(`${color}-swap1-0.svg`);
      expected.push(`${color}-refreshhand-0.svg`);
    }
    for (let copy = 0; copy < 4; copy += 1) {
      expected.push(`wildforcetrade-${copy}.svg`);
      expected.push(`wildpasshands-${copy}.svg`);
    }
    expect(expected).toHaveLength(16);
    for (const set of ["cards", "cards-neon"]) {
      const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), `../public/${set}`);
      const files = readdirSync(dir).filter((name) => name.endsWith(".svg"));
      for (const name of expected) {
        expect(files, `${set}/${name}`).toContain(name);
      }
      for (const [name, label] of [
        ["red-swap1-0.svg", "SWAP 1"],
        ["blue-refreshhand-0.svg", "REFRESH HAND"],
        ["wildforcetrade-0.svg", "FORCE TRADE"],
        ["wildpasshands-0.svg", "PASS HANDS"],
      ]) {
        expect(readFileSync(path.join(dir, name), "utf8"), `${set}/${name} label`).toContain(label);
      }
    }
  });

  it("ships UNO Reverse Pack card art in both sets", () => {
    const expected: string[] = [];
    for (const color of ["red", "yellow", "green", "blue"]) {
      expected.push(`${color}-reversedraw2-0.svg`);
      expected.push(`${color}-reverseskip-0.svg`);
    }
    for (let copy = 0; copy < 4; copy += 1) {
      expected.push(`wildpowerreverse-${copy}.svg`);
      expected.push(`wildnou-${copy}.svg`);
    }
    expect(expected).toHaveLength(16);
    for (const set of ["cards", "cards-neon"]) {
      const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), `../public/${set}`);
      const files = readdirSync(dir).filter((name) => name.endsWith(".svg"));
      for (const name of expected) {
        expect(files, `${set}/${name}`).toContain(name);
      }
      for (const [name, label] of [
        ["red-reversedraw2-0.svg", "REVERSE +2"],
        ["blue-reverseskip-0.svg", "REVERSE SKIP"],
        ["wildpowerreverse-0.svg", "POWER REVERSE"],
        ["wildnou-0.svg", "NO U!"],
      ]) {
        expect(readFileSync(path.join(dir, name), "utf8"), `${set}/${name} label`).toContain(label);
      }
    }
  });

  it("ships Stack Pack card art in both sets", () => {
    const expected: string[] = [];
    for (const color of ["red", "yellow", "green", "blue"]) {
      expected.push(`${color}-stack1-0.svg`);
      expected.push(`${color}-stack2-0.svg`);
    }
    for (let copy = 0; copy < 4; copy += 1) {
      expected.push(`wildstack3-${copy}.svg`);
      expected.push(`wildstacknumber-${copy}.svg`);
    }
    expect(expected).toHaveLength(16);
    for (const set of ["cards", "cards-neon"]) {
      const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), `../public/${set}`);
      const files = readdirSync(dir).filter((name) => name.endsWith(".svg"));
      for (const name of expected) {
        expect(files, `${set}/${name}`).toContain(name);
      }
      for (const [name, label] of [
        ["red-stack1-0.svg", "STACK +1"],
        ["blue-stack2-0.svg", "STACK +2"],
        ["wildstack3-0.svg", "STACK +3"],
        ["wildstacknumber-0.svg", "STACK #"],
      ]) {
        expect(readFileSync(path.join(dir, name), "utf8"), `${set}/${name} label`).toContain(label);
      }
    }
  });

  it("ships Speed Pack card art in both sets", () => {
    const expected: string[] = [];
    const values: Record<string, number[]> = {
      red: [3, 4, 5], yellow: [1, 2, 3], green: [7, 8, 9], blue: [5, 6, 7],
    };
    for (const [color, list] of Object.entries(values)) {
      for (const value of list) {
        expected.push(`${color}-speedup-${value}.svg`);
      }
    }
    for (let copy = 0; copy < 4; copy += 1) {
      expected.push(`wilddoublespeed-${copy}.svg`);
    }
    expect(expected).toHaveLength(16);
    for (const set of ["cards", "cards-neon"]) {
      const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), `../public/${set}`);
      const files = readdirSync(dir).filter((name) => name.endsWith(".svg"));
      for (const name of expected) {
        expect(files, `${set}/${name}`).toContain(name);
      }
      for (const [name, label] of [
        ["red-speedup-3.svg", "SPEED +1"],
        ["wilddoublespeed-0.svg", "DOUBLE SPEED"],
      ]) {
        expect(readFileSync(path.join(dir, name), "utf8"), `${set}/${name} label`).toContain(label);
      }
    }
  });

  it("ships All Wild card art in both sets", () => {
    const expected = [
      "awWild-0.svg", "awReverse-0.svg", "awSkip-0.svg", "awSkipTwo-0.svg",
      "awDrawTwo-0.svg", "awDrawFour-0.svg", "awTargetDrawTwo-0.svg", "awForcedSwap-0.svg",
    ];
    for (const set of ["cards", "cards-neon"]) {
      const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), `../public/${set}`);
      const files = readdirSync(dir).filter((name) => name.endsWith(".svg"));
      for (const name of expected) {
        expect(files, `${set}/${name}`).toContain(name);
      }
      expect(readFileSync(path.join(dir, "awDrawFour-0.svg"), "utf8")).toContain("DRAW 4");
    }
  });

  it("ships Dare card art in both sets", () => {
    const expected = [
      "red-dare-0.svg", "yellow-dare-0.svg", "green-dare-0.svg", "blue-dare-0.svg",
      "wilddare-0.svg", "wilddare-1.svg", "wilddare-2.svg", "wilddare-3.svg",
    ];
    for (const set of ["cards", "cards-neon"]) {
      const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), `../public/${set}`);
      const files = readdirSync(dir).filter((name) => name.endsWith(".svg"));
      for (const name of expected) {
        expect(files, `${set}/${name}`).toContain(name);
      }
      expect(readFileSync(path.join(dir, "wilddare-0.svg"), "utf8")).toContain("WILD DARE");
    }
  });

  it("ships Showdown card art in both sets", () => {
    const expected = [
      "red-showdown-0.svg", "yellow-showdown-0.svg", "green-showdown-0.svg",
      "blue-showdown-0.svg", "wildshowdown-0.svg",
    ];
    for (const set of ["cards", "cards-neon"]) {
      const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), `../public/${set}`);
      const files = readdirSync(dir).filter((name) => name.endsWith(".svg"));
      for (const name of expected) {
        expect(files, `${set}/${name}`).toContain(name);
      }
      expect(readFileSync(path.join(dir, "wildshowdown-0.svg"), "utf8")).toContain("WILD SHOWDOWN");
    }
  });

  it("ships Power Grab card art in both sets", () => {
    const expected: string[] = [];
    for (const color of ["red", "yellow", "green", "blue"]) {
      for (const power of ["U", "N", "O", "!"]) {
        expected.push(`${color}-power-${power}-0.svg`);
      }
      expected.push(`${color}-draw1-0.svg`);
      expected.push(`${color}-grab2towers-0.svg`);
    }
    expected.push("wildgrabtower-0.svg");
    for (const set of ["cards", "cards-neon"]) {
      const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), `../public/${set}`);
      const files = readdirSync(dir).filter((name) => name.endsWith(".svg"));
      for (const name of expected) {
        expect(files, `${set}/${name}`).toContain(name);
      }
      expect(readFileSync(path.join(dir, "red-power-U-0.svg"), "utf8")).toContain("POWER");
    }
  });

  it("ships Mod card art in both sets", () => {
    for (const set of ["cards", "cards-neon"]) {
      const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), `../public/${set}`);
      const files = readdirSync(dir).filter((name) => name.endsWith(".svg"));
      for (let copy = 0; copy < 4; copy += 1) {
        expect(files, `${set}/modcard-${copy}.svg`).toContain(`modcard-${copy}.svg`);
      }
      expect(readFileSync(path.join(dir, "modcard-0.svg"), "utf8")).toContain("MOD");
    }
  });

  it("ships Minimalist card art in both sets", () => {
    for (const set of ["cards", "cards-neon"]) {
      const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), `../public/${set}`);
      const files = readdirSync(dir).filter((name) => name.endsWith(".svg"));
      for (const name of ["minimalist-red-0-0.svg", "minimalist-blue-9-0.svg", "minimalist-wild-0.svg", "minimalist-wild4-0.svg"]) {
        expect(files, `${set}/${name}`).toContain(name);
      }
      for (const color of ["red", "yellow", "green", "blue"]) {
        for (const kind of ["skip", "reverse", "draw2"]) {
          expect(files, `${set}/minimalist-${color}-${kind}-0.svg`).toContain(`minimalist-${color}-${kind}-0.svg`);
        }
      }
    }
  });

  it("ships a real SVG document for every card", () => {
    const files = readdirSync(cardsDir).filter((name) => name.endsWith(".svg"));
    for (const file of files) {
      const target = path.join(cardsDir, file);
      expect(existsSync(target)).toBe(true);
      const svg = readFileSync(target, "utf8");
      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
    }
  });
});
