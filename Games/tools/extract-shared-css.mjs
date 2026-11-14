// Extract the shared game UI stylesheet from the Chess client.
//
// The shared kit owns the components every title renders, so their rules
// live in one stylesheet. The extraction is a real CSS block walk, not a line
// range: a cut rule would leave an unclosed brace and the browser would throw
// away every rule after it, including the rules of the app that imports it.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GAMES_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(GAMES_ROOT, "Chess", "web", "src", "styles.css");
const TARGET = path.join(GAMES_ROOT, "shared", "gameui", "src", "styles.css");

// The class prefixes the shared kit owns.
const SHARED_PREFIXES = [
  "mode-switch",
  "player-card",
  "player-avatar",
  "player-meta",
  "player-name",
  "player-subtitle",
  "player-trailing",
  "player-clock",
  "player-badge",
  "turn-dot",
  "toolbar-grid",
  "action-button",
  "profile-",
  "leaderboard-",
  "history-",
  "replay-",
  "invite-",
  "friend-invite-",
  "chat-",
  "emoji-picker",
  "account-",
  "auth-",
  "mini-button",
  "empty-state",
];

function isShared(selector) {
  const cleaned = selector.replace(/::?[a-z-]+(\([^)]*\))?/g, "");
  return SHARED_PREFIXES.some((prefix) =>
    cleaned
      .split(/[\s,>+~]/)
      .map((part) => part.trim())
      .filter(Boolean)
      .some((part) => part.startsWith(".") && part.includes(prefix)),
  );
}

/**
 * Split a stylesheet into top level blocks. A block is either an at-rule with
 * a body or a style rule. Nested bodies are kept whole.
 */
function parseBlocks(css) {
  const blocks = [];
  let index = 0;
  while (index < css.length) {
    const braceStart = css.indexOf("{", index);
    if (braceStart === -1) {
      break;
    }
    const prelude = css.slice(index, braceStart).trim();
    if (prelude.length === 0) {
      index = braceStart + 1;
      continue;
    }
    let depth = 1;
    let cursor = braceStart + 1;
    while (cursor < css.length && depth > 0) {
      const character = css[cursor];
      if (character === "{") {
        depth += 1;
      } else if (character === "}") {
        depth -= 1;
      }
      cursor += 1;
    }
    const body = css.slice(braceStart + 1, cursor - 1);
    blocks.push({ prelude, body, atRule: prelude.startsWith("@") });
    index = cursor;
  }
  return blocks;
}

function blockIsShared(block) {
  if (block.atRule) {
    const inner = parseBlocks(block.body);
    return inner.some(blockIsShared);
  }
  return isShared(block.prelude);
}

function renderBlock(block) {
  if (block.atRule) {
    const inner = parseBlocks(block.body)
      .filter(blockIsShared)
      .map(renderBlock)
      .join("\n");
    return `${block.prelude} {\n${inner}\n}`;
  }
  return `${block.prelude} {\n${block.body}\n}`;
}

const source = await readFile(SOURCE, "utf8");
const blocks = parseBlocks(source);
const kept = blocks.filter(blockIsShared);
const rendered = kept.map(renderBlock).join("\n\n");

const header = `/* Shared MoonGames game UI kit.
   Generated from the Chess client by tools/extract-shared-css.mjs.
   Every title imports this file for the panels, chat, and controls it
   shares with the other titles. */\n\n`;

await writeFile(TARGET, `${header}${rendered}\n`, "utf8");
console.log(
  `Wrote ${path.relative(GAMES_ROOT, TARGET)} (${kept.length} blocks, ${rendered.length} bytes)`,
);
