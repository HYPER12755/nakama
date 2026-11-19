/** A shared request that opens the active match chat, even in fullscreen. */
export const OPEN_MATCH_CHAT_EVENT = "moongames:open-match-chat";

export function requestOpenMatchChat(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_MATCH_CHAT_EVENT));
}
