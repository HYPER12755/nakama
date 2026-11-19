import { requestOpenMatchChat } from "../lib/chat";
import { Icon } from "./Icon";

/**
 * Fullscreen hides the normal chat dock. This shared control lives in the
 * board overlay and asks the active MatchChat to open itself.
 */
export function FullscreenChatButton() {
  return (
    <button
      type="button"
      className="fullscreen-chat-button"
      onClick={requestOpenMatchChat}
      aria-label="Open match chat"
      title="Match chat"
    >
      <Icon name="chat" size={18} />
    </button>
  );
}
