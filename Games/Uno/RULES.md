# Uno Classic rules (implementation baseline)

Source: Mattel's official "Let's Play UNO!" instructions (service.mattel.com instruction sheets).

- Deck: 108 cards. Four colours (red, yellow, green, blue); each colour has one 0, two each of 1-9, two Skip, two Reverse, two Draw Two; plus four Wild and four Wild Draw Four.
- Deal seven cards to each player. Place the rest face down as the draw pile and flip one card as the discard pile. The starting card takes effect immediately:
  - Wild Draw Four: return it to the draw pile and flip again until the starter is not a Wild Draw Four.
  - Wild: the first player chooses the continuing colour; the engine auto-picks the most common colour in that player's hand.
  - Skip: the first player is skipped and the second seat starts.
  - Reverse: the last seat acts as dealer and starts, and play proceeds counter-clockwise (direction -1).
  - Draw Two: the first player draws two, loses their turn, and the second seat starts.
  - Otherwise the first player starts and play proceeds clockwise.
- On a turn, play one card matching the discard's colour, number, or symbol; or draw one card. Wild cards always match. A drawn card may be played immediately if legal; otherwise the turn passes. Only one draw is allowed per turn, and no further draw is possible while a drawn card is still pending.
- Skip: the next player loses a turn. Reverse: direction flips; with two players it acts like Skip. Draw Two: the next player draws two and loses a turn.
- Wild: may always be played; the player chooses the continuing colour.
- Wild Draw Four: may be played even when the player holds a card of the current colour (a bluff); wild cards never count as a match. The next player chooses to take four and lose a turn, or to challenge:
  - Innocent play (no card of the current colour): the challenger draws six and loses the turn.
  - Guilty bluff: the player who played the card draws four, the challenger draws none, and the challenger loses the turn.
  - The player who played the card always chooses the continuing colour.
- A player who plays their final card wins the hand, with two exceptions: a final Draw Two makes the next player draw two before the win is declared, and a final Wild Draw Four only wins after the challenge is resolved (the owner still has an empty hand). A guilty challenge leaves that owner holding the four drawn cards, so the hand continues.
- If the draw pile empties, reshuffle the discard pile (keeping the top card) into a new draw pile.
- Optional scoring (local only): number = face value, action = 20, wild/wild four = 50; first to 500 wins.
- Calling "UNO" is social and is not enforced by the server.

## Seven-O (optional house rule)

Seven-O is a Mattel-listed optional house rule. It is **off by default**: every game
created without an explicit mode uses classic rules, including existing lobbies that
do not send a mode field. Both modes produce a single-winner result.

- When a player plays a **number 7**, that player swaps their entire hand with one
  other seated player of their choice. A target must be supplied and must be a
  different player who is seated in the game; otherwise the play is rejected with
  `missing_target`.
- When a player plays a **number 0**, every seated player's hand moves to the next
  player in the current direction at the same time. Direction is not changed.
- Either effect resolves before the winner is checked, then the played number card
  advances the turn by one as usual. All other cards behave exactly as in classic.
- The mode is authoritative state: it is set at game creation, is included in state
  payloads, and all matchmaker tickets for a game must agree on it.

## Progressive (optional house rule)

Progressive (also called "stacking" or "cumulative") is an optional Mattel house
rule. It is **off by default**: every game created without an explicit mode uses
classic rules, including existing lobbies that do not send a mode field. The mode is
authoritative state, is included in state payloads, and all matchmaker tickets for a
game must agree on it. All other behaviour matches classic UNO.

- Draw Two does not resolve immediately. Playing one creates a pending stack with
  `kind: "draw2"` and an amount of 2 aimed at the next player. Instead of drawing and
  losing their turn, that player may either take the whole amount (a draw request),
  or play one more Draw Two to add 2 and pass the stack onward. Only one Draw Two may
  be played into the stack per turn.
- Wild Draw Four uses the same stacking rule with `kind: "wild4"`; each additional
  Wild Draw Four adds 4, and the last player to play one chooses the continuing
  colour. Bluffing and challenge still apply. The pending stack records whether the
  most recent Wild Four was legal and the colour chosen with it.
- A challenge on a stacked Wild Four uses the accumulated amount: an innocent play
  makes the challenger draw amount + 2; a guilty bluff makes the owner draw amount;
  declining the challenge makes the target draw amount. In every case the turn skips
  the target.
- The two stacks never mix: a Draw Two cannot be played onto a Wild Four stack and a
  Wild Four cannot be played onto a Draw Two stack. Such a play is rejected.
- When a stack resolves (the target takes the cards), any player who played their
  final stacking card wins only if they still hold no cards at that point. If the
  stack was passed back to them and they had to take cards, play continues.

Server state exposes the stack as `pendingStack` with camelCase fields
`kind`, `amount`, `ownerId`, `targetId`, and optional `legal`, `color`, and
`pendingWinnerId`. The core state uses the same camelCase shape; the Lua server
internal state stores it as `pending_stack` with snake_case fields.

## Jump-In (optional house rule)

Jump-In is another optional Mattel-listed house rule. It is **off by default**:
games created without an explicit mode use classic rules. The mode is
authoritative state, is included in state payloads, and all matchmaker tickets
for a game must agree on it. Everything not described here behaves as in classic
UNO.

- Only **exact number-card matches** can jump in: the played card must be a
  number card of the same colour *and* the same value as the card it jumps onto
  (for example, a yellow 7 on a yellow 7). A number card of the same colour but
  a different value, or the same value in a different colour, is not a match.
- **Action-card jump-in cancellation is intentionally NOT enabled.** Skip,
  Reverse, Draw Two, Wild and Wild Draw Four cannot be used to jump in, and
  playing an action card does not open a jump window. Action cards resolve
  exactly as in classic UNO. A jump attempt with an action card is rejected.
- When a number card is played, a jump window of `JUMP_WINDOW_MS = 1800`
  milliseconds opens. Until it expires, only other seated players may play an
  exact matching number card as a jump. The player who opened the window cannot
  act while it is open; normal play resumes from the current turn once it
  closes. The server clears expired windows authoritatively.
- A valid jump removes the card from the jumper's hand, discards it, puts the
  turn on the jumper and advances it by one, and opens a fresh jump window for
  the jumper's card. A jumper who empties their hand wins immediately.
- A play attempted by the window owner (or any non-jump action during an open
  window) is rejected with `jump_window_open`. A jump with a card that is not an
  exact match, with an action card, or without an open window is rejected with
  `bad_jump`. A draw during an open window is also `jump_window_open`.

Core state exposes the window as `jumpWindow` with camelCase fields `cardId`,
`ownerId` and `expiresAt`; the Lua server stores it as `jump_window` with
`card_id`, `owner_id` and `expires_at`, and publishes the camelCase shape in
state payloads. Play requests carry `jump: true` (Lua `jump`) to attempt a jump.

## Attack (optional house rule, deterministic launcher)

Attack is based on Mattel's UNO Attack!, adapted so that the physical random
launcher is replaced by a **deterministic, server-owned launcher**. It is **off
by default**: games created without an explicit mode use classic rules. The mode
is authoritative state, is included in state payloads, and all matchmaker
tickets for a game must agree on it. Everything not described here behaves as
in classic UNO.

**Deterministic launcher deviation:** in the physical game a launcher fires a
random 0-3 cards per press. Here each press derives its count from the
authoritative `seed` with the existing RNG (`randomInt(seed, 4)`) and advances
the seed by one step, so every client reproduces the same count. No launcher
hardware or client-side randomness is involved.

- Deck: 112 cards. Per colour there are nine number values 1-9 with two copies
  each (18, no 0), one Hit 1, two Hit 2, two Discard All, one Reverse and two
  Skip; plus four Wild and four Wild Attack. There are no Draw Two or Wild Draw
  Four cards.
- Hit 1 / Hit 2: playable on a colour, number or symbol match. The next player
  must take one/two launcher hits or deflect. A hit adds `1`/`2` to an ongoing
  hit stack and passes the turn to the next player.
- Wild Attack: always playable; the player chooses a colour and a target seat.
  A `targetId` is required, and a missing, empty or invalid target is rejected
  with `missing_target`. The target must take two launcher hits; play continues
  after that target. When used to deflect, a Wild Attack adds two hits and may
  redirect them via `targetId`.
- Pending hits are exposed as `pendingHit` with camelCase fields `amount`,
  `ownerId` and `targetId`; the Lua server stores them as `pending_hit` with
  snake_case fields and publishes the camelCase shape in state payloads. Only
  the named target may act. They may take the hits with a draw request (one
  launcher press per hit, then their turn passes) or deflect with any Hit 1,
  Hit 2 or Wild Attack card regardless of colour. A disconnected target is
  auto-taken on timeout.
- Discard All: playable on a matching colour or another Discard All. When
  played, every card of that colour in the actor's hand is discarded along with
  the Discard All card; an actor who empties their hand wins.
- A normal draw presses the launcher once, adds the resulting 0-3 cards, and
  immediately passes the turn. Drawn cards cannot be played. The current
  player's `canDraw` is always true in this mode.
- Reverse with two players acts like Skip, as in the other modes.
