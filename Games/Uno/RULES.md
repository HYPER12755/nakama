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

## No Mercy (optional mode, official Mattel Show 'Em No Mercy rules)

No Mercy is **off by default**: games created without an explicit mode use
classic rules. The mode is authoritative state, is included in state payloads,
and all matchmaker tickets for a game must agree on it. Everything not
described here behaves as in classic UNO. The single-hand build and scoring
flow are unchanged.

**Deck (168 cards).** Four colours (red, yellow, green, blue):
numbers 0-9 with two of each number per colour (80), Skip 3/colour (12),
Reverse 3/colour (12), Draw Two 3/colour (12), coloured Draw Four 2/colour (8),
Discard All 3/colour (12), Skip Everyone 2/colour (8). Wild cards: Wild Reverse
Draw Four (8), Wild Colour Roulette (8), Wild Draw Six (4), Wild Draw Ten (4).
There are **no plain Wild cards and no classic Wild Draw Four cards** in this
mode. Coloured action card IDs are `<color>-draw4-0/1`,
`<color>-skipeveryone-0/1`, `<color>-discardall-0/1/2`; wild IDs are
`wilddraw6-0..3`, `wilddraw10-0..3`, `wildreverse4-0..7`, `wildroulette-0..7`.
The starter is flipped until a **number card** appears; action and wild cards
never start a hand.

- **Draw until playable.** If the current player holds no legal card, they draw
  one card at a time until a playable card is drawn, then play it. Drawing is
  not allowed while a legal card is held. If the draw pile empties, the discard
  pile is reshuffled into it while the top card is kept; drawn cards leave the
  pile for good, so this always terminates. The playable drawn card stays
  pending as `drawnCardId` and is the only card that may then be played.
- **Stacking.** Draw cards have values: Draw Two = 2, coloured Draw Four = 4,
  Wild Reverse Draw Four = 4, Wild Draw Six = 6, Wild Draw Ten = 10. Playing one
  starts a pending stack aimed at the next player. That player may take the
  whole accumulated amount with a draw request, or stack a draw card of
  **equal or higher value regardless of colour**, adding its value and passing
  the stack on. A lower-value card cannot be stacked. There is no bluffing or
  challenge in this mode.
- **Mercy rule.** Any player who reaches 25 or more cards at any point is out:
  their hand is set aside and their turns are skipped. They remain in the seat
  order. When only one active player remains, that player wins immediately.
  State exposes `out: boolean` on every seat.
- **Seven and Zero are always active.** A number 7 requires a valid `targetId`
  naming a different active player and swaps the two hands. A number 0 rotates
  every active player's hand in the current direction; eliminated seats are
  untouched. Both resolve before the win check.
- **Coloured Draw Four.** Playable on its colour or on another Draw Four. The
  next player takes four or stacks; the colour does **not** change and there is
  no challenge.
- **Wild Draw Six / Wild Draw Ten.** The player chooses a colour; the next
  player draws 6/10 or stacks a card of equal or higher value.
- **Wild Reverse Draw Four.** The player chooses a colour, direction reverses,
  and the next player in the **new** direction draws four or stacks. With two
  players this targets the actor.
- **Wild Colour Roulette.** The player who plays it does not choose a colour;
  instead the **next player** chooses one. The reveal then draws cards from the
  draw pile one at a time until a card of the chosen colour appears (wilds do
  not count), adding every revealed card to the chooser's hand, then passes the
  turn. The choice is authoritative. A final Roulette card wins immediately.
- **Discard All.** Playable on its colour or another Discard All; all of the
  actor's cards of that colour are discarded with it, winning if the hand is
  then empty.
- **Skip Everyone.** All other active players lose their turn and the actor
  plays again. Reverse with two players acts like Skip.
- **Scoring (unchanged single-hand build).** Number = face value, action card
  (including coloured Draw Four, Discard All and Skip Everyone) = 20, wild and
  wild variant (including Wild Draw Six/Ten, Wild Reverse Four and Wild Colour
  Roulette) = 50; first to 500 wins.

### No Mercy integration contract

- Mode string: `noMercy` (core `UNO_MODE.NO_MERCY`, Lua `RULES_MODES`).
- Colour choice action: `chooseColour` (core `Action`) / `choose_colour`
  (server); carries `playerId` and `color`/`colour`. Aliases `chooseColor`,
  `chosenColor` and `color` are accepted.
- Protocol opcode: `108` = `COLOR_CHOOSE` (core `UNO_CLIENT_OP.COLOR_CHOOSE`,
  also exported as `UNO_COLOR_CHOOSE_OP`; Lua `protocol.OP.COLOR_CHOOSE`);
  payload `{ colour: <color> }`
  (also accepts `color` or `chosenColor`).
- State fields: `pendingStack` gains `value` (last draw card's value) alongside
  `kind`, `amount`, `ownerId`, `targetId`, `color`, `pendingWinnerId`;
  `pendingRoulette` is `{ chooserId, ownerId }` or null; each player in the
  state payload has `out`. Clients must gate `COLOR_CHOOSE` on
  `pendingRoulette.chooserId` and show no other action while it is set.
- MOVE broadcasts include `action` (with its `type`), `chosenColor` and
  `targetId`. The Lua server stores these internally as `pending_stack.value`,
  `pending_roulette` and `player.out` and publishes the camelCase shape above.

## Flip (optional mode, official Mattel UNO Flip! rules)

Flip is **off by default**: games created without an explicit mode use classic
rules. The mode is authoritative state, is included in state payloads, and all
matchmaker tickets for a game must agree on it. Everything not described here
behaves as in classic UNO.

**Physical deck (112 two-sided cards).** A card has a light side and a dark side.
Light colours are red, yellow, green and blue; dark colours are pink, teal,
orange and purple. Each side has the numbers 1-9 twice per colour (72 cards),
Draw One / Reverse / Skip / Flip twice per colour (32 cards), four Wild cards and
four Wild Draw Two (light) / Wild Draw Color (dark) cards. There is no 0 and no
classic Draw Two or Wild Draw Four. A visible-side card ID encodes the side:
`light-red-1-0`, `light-red-draw1-0`, `light-red-flip-0`, `light-wild-0`,
`light-wilddraw2-0`, `dark-pink-1-0`, `dark-pink-draw5-0`,
`dark-pink-skipeveryone-0`, `dark-pink-flip-0`, `dark-wild-0`,
`dark-wilddrawcolor-0`, and so on.

`flipCard(card)` maps a visible card to the opposite physical side: red↔pink,
yellow↔orange, green↔teal, blue↔purple; number values and copies are preserved;
Draw One↔Draw Five, Skip↔Skip Everyone, Reverse↔Reverse, Flip↔Flip, Wild↔Wild and
Wild Draw Two↔Wild Draw Color. Wild cards always have no colour. `flipColor`
exposes the colour pairing, and `LIGHT_COLORS` / `DARK_COLORS` list the side
colours. `buildDeck("flip")` returns the 112 light-side visible cards.

- **Flip card.** Playable only on a matching colour or on another Flip card. When
  played, every card in the draw pile, discard pile and every hand is replaced by
  its opposite side; the draw pile order is reversed; the discard pile order is
  reversed so the just-played card becomes the bottom; `flipSide` changes to the
  opposite side. The continuing colour becomes the colour of the new top card,
  except that a wild new top uses `chosenColor` from the play if supplied, or the
  most common colour of the actor's post-flip hand. The new top card's action is
  not triggered. Play then advances one seat.
- **Light actions.** Draw One: the next player draws one and loses their turn.
  Skip: the next player loses their turn. Reverse: direction flips, and with two
  players it acts like Skip. Wild: the player chooses the continuing colour.
  Wild Draw Two: the player chooses a colour, the next player draws two and loses
  their turn; it is legal only with no card of the current colour in the actor's
  hand. A challenged guilty play makes the owner draw two; an innocent play makes
  the challenger draw four; declining makes the target draw two.
- **Dark actions.** Draw Five: the next player draws five and loses their turn.
  Skip Everyone: all other players lose their turn and the actor plays again.
  Reverse and Wild behave as on the light side. Wild Draw Color: the player
  chooses a colour; the target draws from the draw pile until a card of that
  colour appears (wilds do not count), keeps every revealed card and loses the
  turn. It is legal only with no card of the current colour in the actor's hand.
  A challenged guilty play makes the owner draw until the colour; an innocent
  play makes the challenger do so plus two extra cards; declining makes the
  target draw until the colour. A normal draw is always a single card.
- **Matching.** A card matches by colour, by number against another number of
  the same value, or by the same symbol/kind. Wild cards always match. An action
  on a player's final card resolves before the win is declared, including Flip
  and Wild Draw Two / Wild Draw Color challenges.

### Flip integration contract

- Mode string: `flip` (core `UNO_MODE.FLIP`, Lua `RULES_MODES`).
- State field: `flipSide` is `"light"` or `"dark"` (Lua internal `flip_side`).
  It is included in every core state and Lua state payload.
- `PendingChallenge` gains optional `kind`, `amount` and `color` for Wild Draw
  Two / Wild Draw Color challenges (`kind: "wildDraw2" | "wildDrawColor"`;
  `amount: 2` for Wild Draw Two, `0` for Wild Draw Color; `color` is the chosen
  colour). The Lua server stores this as `pending_challenge.kind` / `.amount` /
  `.color` and publishes it in camelCase under `pendingChallenge`.
- Wild cards require `chosenColor` on play (aliases `chooseColor`, `chosenColor`
  and `color` are accepted); the Lua internal action uses `chosen_color`.
- No new protocol opcodes are needed: plays use the normal play request, draws
  the normal draw request and challenges the normal challenge request.
- AI uses the active side's colours for wild colour choices and avoids Flip card
  loops by preferring other legal cards. Score handling keeps wild variants at
  50 points and other action cards at 20.

## Swap Pack (optional mode, official Mattel UNO Swap Pack add-on)

Swap Pack is **off by default**: games created without an explicit mode use
classic rules. The mode is authoritative state, is included in state payloads,
and all matchmaker tickets for a game must agree on it. Everything not described
here behaves as in classic UNO, including matching by colour/number/symbol,
drawing one card, Wild Draw Four challenges, and immediate win on an empty hand.

**Deck (124 cards).** `buildDeck("swapPack")` is the classic 108-card deck plus
16 new cards appended in this exact order:

- `<color>-swap1-0` for red, yellow, green, blue (4)
- `<color>-refreshhand-0` for red, yellow, green, blue (4)
- `wildforcetrade-0..3` (4, colourless)
- `wildpasshands-0..3` (4, colourless)

The colour card IDs are `red-swap1-0`, `red-refreshhand-0`, and so on. All four
kinds are action cards for scoring (`swap1` and `refreshHand` score 20; the two
wild variants score 50, like other wild actions). A starting Wild Force Trade or
Wild Pass Hands is treated like a starting Wild: the engine assigns the most
common colour of the first player's hand and the action does not trigger.

**Play semantics and required fields.** A play request for any of these cards
carries the normal `playerId` / `cardId` plus the fields below. The canonical
core fields are camelCase; the Lua server action uses snake_case and accepts
both spellings from the client. Invalid fields reject the play and leave the
state unchanged.

- **Swap 1** (`swap1`, `red-swap1-0`): playable on a matching colour or on
  another Swap 1. Requires `targetId` and `giveCardId`. `targetId` must be a
  different seated player with a non-empty hand; `giveCardId` must name a card
  in the actor's hand *other than the played Swap 1 card*. The actor takes one
  card at random from the target's hand and gives that player the chosen card.
  The random index is derived from the authoritative `seed` with
  `randomInt(seed, hand.length)` and then advances the seed with `nextSeed`, so
  the server owns the randomness and every client can reproduce it. The two
  cards are exchanged in place (the received card is appended to the actor's
  hand, the given card replaces the taken card in the target's hand). Missing or
  invalid `targetId` returns `missing_target`; missing or invalid `giveCardId`
  returns `unknown_card`. Play then advances one seat.
- **Refresh Hand** (`refreshHand`, `red-refreshhand-0`): playable on a matching
  colour or on another Refresh Hand. No extra fields. After the card is
  discarded, the actor's entire remaining hand is placed at the **bottom** of
  the discard pile (behind the played Refresh Hand card), preserving order, and
  the actor draws exactly that many cards from the draw pile, recycling the
  discard pile if needed. An actor whose hand was empty after playing wins once
  the draw resolves. Play then advances one seat.
- **Wild Force Trade** (`wildForceTrade`, `wildforcetrade-0`): a wild, always
  playable. Requires `targetId`, `tradeWithId` and `chosenColor`. Both IDs must
  name seated players, may include the actor, and must be distinct. Those two
  players swap their entire hands simultaneously (after the played card leaves
  the actor's hand); the actor chooses the continuing colour. Missing,
  identical or unknown IDs return `missing_target`, and a missing colour
  returns `missing_color`. Play then advances one seat.
- **Wild Pass Hands** (`wildPassHands`, `wildpasshands-0`): a wild, always
  playable. Requires `chosenColor` (missing returns `missing_color`). Every
  seated player, including the actor, passes their entire hand to the next
  player in the current direction simultaneously, using the same active-seat
  rotation as Seven-O's number 0. The actor chooses the continuing colour. Play
  then advances one seat.

### Events and replay

Each new play emits the normal `play` event and replay step plus one extra entry
describing its effect. Event types are `swap1`, `refreshHand`, `wildForceTrade`
and `wildPassHands`; replay actions use the same names. Swap 1 replay carries
`targetId`, `giveCardId` and `receivedCardId`; Force Trade carries `targetId`
and `tradeWithId`; Refresh Hand carries `count` (`String(count)` in the event's
`text`); Pass Hands carries only the card ID. Wild colour choices are already
captured by the standard play entry's `color`.

### Swap Pack integration contract

- Mode string: `swapPack` (core `UNO_MODE.SWAP_PACK`, Lua `RULES_MODES`).
- Play fields: `targetId` (Lua `target_id`), `giveCardId` (`give_card_id`),
  `tradeWithId` (`trade_with_id`) and `chosenColor` (`chosen_color`). They are
  forwarded from `PLAY_REQUEST` into the Lua action and echoed in the camelCase
  `MOVE` broadcast alongside `targetId` and `chosenColor`. No new opcodes are
  needed: plays, draws and challenges reuse the existing request opcodes.
- State payloads expose `rulesMode: "swapPack"` in `MATCH_STARTED` and `STATE`.
- Randomness is server-owned: the Swap 1 target card is chosen from the state
  seed, and both engines advance that seed identically, so a given seed and
  action sequence produce identical hands and outcomes.
- AI chooses a non-actor target with the largest hand and gives away its lowest
  scoring card for Swap 1; Force Trade swaps the actor's hand with that target
  (the actor is one participant); Pass Hands and Refresh Hand need no target.
  Every new wild carries a legal `chosenColor`, so automated play never stalls.

## Dare

Dare uses a 108-card playable deck: 76 numbered cards, eight Reverse, eight
Skip, eight Dare and eight Wild Dare. Four printed Dare List cards are reference
cards and are not part of the playable pile. It is available locally and in
private/quick online matches as mode string `dare` (core `UNO_MODE.DARE`, Lua
`RULES_MODES`). No new opcodes are needed.

### Dare cards

- **Dare** (`dare`, `red-dare-0`): eight coloured copies, two per colour.
  Playable on a matching colour or another Dare. The next player chooses to
  draw 2 or accept the dare shown on the selected Dare List card.
- **Wild Dare** (`wildDare`, `wilddare-0`): eight wild copies. Always playable;
  the actor chooses the continuing colour. The next player gets the same
  draw-or-dare choice.

The digital game models the choice authoritatively: declining draws 2 and
skips the target's turn; accepting declares the dare complete with no penalty.
Players can agree socially what counts as completing the dare, as with the
physical game.

### Resolution and events

Both cards open a `pendingChallenge` with `kind` set to `dare` or `wildDare`,
`amount` 2 and the chosen colour for Wild Dare. The target answers with the
existing challenge request. Accepting emits `dareAccepted`; taking the penalty
emits `dareDraw` and makes the target draw 2. Either way the next player after
the target takes the turn.

### Scoring and integration

Number cards score face value; Reverse, Skip and Dare score 20; Wild Dare
scores 50. The web board renders all Dare card art in both sets and relabels the
challenge overlay as a draw-or-dare choice. AI declines dares by default.

## All Wild

All Wild is a standalone 112-card deck in which every card is wild. It is
available locally and in private/quick online matches as mode string `allWild`
(core `UNO_MODE.ALL_WILD`, Lua `RULES_MODES`). State payloads expose
`rulesMode: "allWild"`. No new opcodes are needed.

### Deck and cards

| Card | Copies | Effect |
| --- | ---: | --- |
| Wild (`awWild`) | 54 | Discard and pass the turn. |
| Wild Reverse (`awReverse`) | 14 | Reverse direction. With two active players this skips the opponent. |
| Wild Skip (`awSkip`) | 14 | The next player loses their turn. |
| Wild Skip Two (`awSkipTwo`) | 6 | The next two players lose their turns. |
| Wild Draw Two (`awDrawTwo`) | 10 | The next player draws 2 and loses their turn. |
| Wild Draw Four (`awDrawFour`) | 6 | The next player draws 4 and loses their turn; there is no challenge. |
| Wild Targeted Draw Two (`awTargetDrawTwo`) | 4 | A chosen player draws 2 but keeps their next turn. |
| Wild Forced Swap (`awForcedSwap`) | 4 | Exchange your remaining hand with a chosen player. |

Every card is always playable; neither colour nor number matching applies, and
no colour choice is required. Targeted cards require `targetId`, which the web
board supplies with a player picker.

### Scoring and events

Plain Wild scores 20 points in `scoreHand`; all action cards score 50. Targeted
Draw Two and Forced Swap emit matching events and replay entries carrying the
chosen `targetId`. Other effects reuse the standard play event.

### Integration contract

- Deck: 112 cards; a wildcard starter receives the first player's most common
  colour so the state always has a current colour, although colour never limits
  play.
- AI scores action cards above plain Wild cards and selects a legal target for
  targeted actions.
- The web board renders one purpose-built art file per All Wild card type in
  both classic and neon sets, maps duplicate card IDs to that art, and shows a
  target picker for targeted actions.

## Speed Pack

Speed Pack keeps the classic 108-card deck and adds 16 dedicated cards for a
124-card deck. It is available locally and in private/quick online matches as
mode string `speedPack` (core `UNO_MODE.SPEED_PACK`, Lua `RULES_MODES`). State
payloads expose `rulesMode: "speedPack"`, `speedLevel`, `speedPlayed` and
`speedTarget`. No new opcodes are needed.

### Added cards

- **Speed Up** (`speedUp`, `red-speedup-3`): twelve coloured copies, three per
  colour, each carrying one Speed Up icon and a printed number. It is played by
  matching colour or another Speed Up card and raises the pace by one level.
- **Wild Double Speed** (`wildDoubleSpeed`, `wilddoublespeed-0`): four wild
  copies. Always playable; choosing a colour raises the pace by two levels.

### Turn sequence

- The game starts at speed level 1. When a player finishes a turn, every player
  must play that many cards on their next turn, in sequence. Each card must
  match the previously played card.
- A Speed Up icon raises `speedLevel` immediately, but the increase applies to
  the next player. The current turn still ends after `speedTarget` cards.
- Action cards only take effect when they are the last card of a speed turn. A
  Draw Two played before the target is reached simply continues the chain; one
  played last makes the next player draw two.
- If a player cannot play enough cards, they play what they can and then draw
  cards equal to the current speed level. The speed resets to 1, `speedPlayed`
  and `speedTarget` reset, and the next player takes a normal single-card turn.
  Using the Draw button intentionally triggers the same crash.

### Events and replay

Each Speed Up card emits a `speedUp` event and replay entry with the gain and
the resulting level. A crash emits `speedCrash` with the number of cards drawn.
The chosen colour of a Wild Double Speed is recorded by the standard play
entry.

### Integration contract

- Deck: 124 cards; a Wild Double Speed starter receives the first player's most
  common colour.
- AI scores Speed Up cards highly and plays them as part of its normal move
  selection; the existing loop naturally continues multi-card turns.
- The web board shows the current speed and `played/target` progress, renders
  all 16 new cards in both art sets, and exposes the new mode label and rules.

## Stack Pack

Stack Pack keeps the classic 108-card deck and adds 16 dedicated cards for a
124-card deck. It is available locally and in private/quick online matches as
mode string `stackPack` (core `UNO_MODE.STACK_PACK`, Lua `RULES_MODES`). State
payloads expose `rulesMode: "stackPack"`. No new opcodes are needed: stacks and
responses reuse the normal play/draw/challenge requests.

### Added cards

- **Stack 1** (`stack1`, `red-stack1-0`): four coloured copies, one per colour.
  Played on a matching colour, it opens a pending stack of 1 card. It can be
  played in response to a matching-colour Draw Two or Wild Four penalty, adding
  1 to that penalty, and can chain onto another Stack card.
- **Stack 2** (`stack2`, `red-stack2-0`): four coloured copies, one per colour.
  Same as Stack 1, adding 2 cards to the penalty.
- **Wild Stack 3** (`wildStack3`, `wildstack3-0`): four wild copies. Always
  playable; choosing a colour opens or adds a 3-card penalty.
- **Wild Stack Number** (`wildStackNumber`, `wildstacknumber-0`): four wild
  copies. Always playable; choosing a colour opens or adds a penalty whose size
  is revealed by flipping the draw pile until the first Number card appears.
  The number on that card sets the amount (a revealed 0 counts as 1). Flipped
  cards are placed under the discard pile in reveal order, using the same seed
  in both engines.

### Stacking and resolution

- A stack card played normally opens a pending stack aimed at the next player,
  who may answer with any legal Stack Pack card or take the accumulated cards
  and lose their turn.
- Coloured Stack 1/2 cards may answer a Draw Two or Wild Four only when their
  colour matches that draw penalty. Any coloured Stack card may chain onto a
  pending Stack Pack card; wild stack cards may answer any draw or stack
  penalty.
- Answering a Wild Four stack with a Stack card resolves the challenge: the
  bluff accusation is no longer available once the penalty has been passed on.
- If the stacker empties their hand, the win is deferred until the stack
  resolves, as with Progressive and Reverse Pack.

### Events and replay

Playing a Stack 1/2 or Wild Stack 3 emits a `stack` event and replay entry with
the amount added. Wild Stack Number emits `stackNumber` with the revealed
amount. Answering a pending stack emits another `stack` entry with the added
amount and the chosen colour on the standard play entry for wilds.

### Integration contract

- Deck: 124 cards; a wildcard starter receives the first player's most common
  colour before starting rules are applied.
- Pending stacks carry `kind`, `amount`, `color`, `ownerId` and `targetId` so
  the web overlay and both engines agree on the active penalty.
- AI scores the new cards and answers stacks with legal Stack Pack responses.
- The web board renders all 16 added cards in classic and neon art, exposes
  legal stack responses on the overlay, and opens the colour picker for wild
  stack cards.

## Reverse Pack

Reverse Pack keeps the classic 108-card deck and adds 16 dedicated cards for a
124-card deck. It is available locally and in private/quick online matches as
mode string `reversePack` (core `UNO_MODE.REVERSE_PACK`, Lua `RULES_MODES`).
State payloads expose `rulesMode: "reversePack"`. All new effects reuse the
standard play request opcodes; no new opcode is needed.

### Added cards

- **Reverse Draw 2** (`reverseDraw2`, `red-reversedraw2-0`): four coloured
  copies, one per colour. Playable on a matching colour, on any Reverse or Draw
  Two, or on another Reverse Draw 2 regardless of colour. It reverses direction,
  then aims a normal Draw Two stack at the next player in the new direction.
  Like classic Draw Two in this mode, the stack may be answered only with Wild
  NO U; players without one take the accumulated cards.
- **Reverse Skip** (`reverseSkip`, `red-reverseskip-0`): four coloured copies,
  one per colour. Playable on a matching colour, on any Reverse or Skip, or on
  another Reverse Skip regardless of colour. It reverses direction and skips the
  next player.
- **Wild Power Reverse** (`wildPowerReverse`, `wildpowerreverse-0`): four wild
  copies. Always playable; choosing a colour reverses direction and gives the
  actor another turn.
- **Wild NO U** (`wildNoU`, `wildnou-0`): four wild copies. Always playable as a
  normal turn; choosing a colour reverses direction and advances. Its main use
  is defensive: when a Reverse Pack Draw Two stack or Wild Four challenge
  targets the actor, the target may play NO U instead of taking or challenging.
  NO U chooses a colour, reverses direction, makes the stack owner or Wild Four
  player draw the accumulated amount, and passes the turn to the next player in
  the new direction.

### Matching and resolution

- Reverse Pack hybrids match both of their component actions across colours:
  Reverse Draw 2 counts as Reverse and Draw Two, and Reverse Skip counts as
  Reverse and Skip. Ordinary Reverse, Skip and Draw Two can answer those hybrids.
- Wild Power Reverse and Wild NO U are wilds and require `chosenColor`.
- Draw Two uses a pending stack in Reverse Pack, so normal Draw Two cards cannot
  be chained; only Wild NO U answers it. The Wild Four pending challenge also
  exposes NO U to the target while retaining the classic accept/challenge
  options.
- A final card played as a reverse or stack effect is a deferred win: the hand
  empties immediately but the game waits until the resulting stack or challenge
  resolves before awarding the winner.

### Events and replay

NO U responses emit a `wildNoU` event and replay entry with the actor and card
ID. The chosen colour is recorded by the standard play entry, as with other
wilds. Reverse Draw 2, Reverse Skip and Wild Power Reverse reuse the standard
play event and replay entry; their effects are deterministic from the card kind
and current direction.

### Integration contract

- Deck: 124 cards; the starter is never Wild Four, Wild Power Reverse or Wild
  NO U, and a wildcard starter receives the first player's most common colour
  before starting rules are applied.
- AI knows the hybrid matching rules, assigns scores to the new cards, and
  answers stacks/challenges with NO U when legal.
- The web board exposes NO U on both the stack and challenge overlays, opens the
  colour picker for it, and renders all 16 added cards in both classic and neon
  art sets.
