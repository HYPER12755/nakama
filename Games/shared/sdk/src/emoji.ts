/**
 * Curated chat emoji data shared by MoonGames-owned chat surfaces.
 *
 * Emoji are allowed only as message content. These values are never used as
 * UI icons; controls stay SVG/vector based.
 */

export interface ChatEmojiGroup {
  id: string;
  label: string;
  emojis: readonly string[];
}

export const CHAT_EMOJI_GROUPS: readonly ChatEmojiGroup[] = [
  {
    id: "smileys",
    label: "Smileys",
    emojis: [
      "😀",
      "😄",
      "😁",
      "😊",
      "🙂",
      "😉",
      "😍",
      "🥳",
      "😎",
      "🤔",
      "😅",
      "😂",
      "😮",
      "😢",
      "😭",
      "😴",
    ],
  },
  {
    id: "gestures",
    label: "Gestures",
    emojis: ["👋", "👍", "👏", "🙌", "🤝", "🙏", "💪", "👀", "🫡", "🤞"],
  },
  {
    id: "hearts",
    label: "Hearts",
    emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🤍", "🖤", "💖", "💫"],
  },
  {
    id: "celebration",
    label: "Celebration",
    emojis: ["🎉", "🎊", "✨", "🔥", "💯", "⭐", "🏆", "🥇", "🎯", "🚀"],
  },
  {
    id: "games",
    label: "Games",
    emojis: ["♟️", "🎲", "🃏", "🎮", "🏁", "⏱️", "🧠", "🛡️", "⚔️", "🏅"],
  },
  {
    id: "nature",
    label: "Nature",
    emojis: ["🌙", "☀️", "🌈", "🌊", "🌿", "🌸", "🦊", "🐼", "🦉", "🐢"],
  },
];

export const CHAT_EMOJI_MAX_RECENT = 16;

export function chatEmojiValues(): string[] {
  return CHAT_EMOJI_GROUPS.flatMap((group) => [...group.emojis]);
}

export function isChatEmoji(value: string): boolean {
  return chatEmojiValues().includes(value);
}

export function rememberRecentEmoji(
  recents: readonly string[],
  emoji: string,
  limit = CHAT_EMOJI_MAX_RECENT,
): string[] {
  if (!isChatEmoji(emoji)) {
    return [...recents];
  }
  return [emoji, ...recents.filter((item) => item !== emoji)].slice(
    0,
    Math.max(0, limit),
  );
}

export interface EmojiInsertion {
  value: string;
  caret: number;
}

/**
 * Insert emoji at the current selection without dropping selected text.
 * The picker closes after insertion, so this keeps the caret ready for typing.
 */
export function insertEmojiAtSelection(
  value: string,
  emoji: string,
  selectionStart: number,
  selectionEnd: number,
  maxLength = 1000,
): EmojiInsertion {
  const start = Math.max(0, Math.min(value.length, selectionStart));
  const end = Math.max(start, Math.min(value.length, selectionEnd));
  const available = Math.max(0, maxLength - (value.length - (end - start)));
  const inserted = [...emoji].slice(0, available).join("");
  const next = value.slice(0, start) + inserted + value.slice(end);
  return { value: next, caret: start + inserted.length };
}
