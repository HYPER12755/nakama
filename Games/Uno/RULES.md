# Uno Classic rules (implementation baseline)

Source: Mattel's official "Let's Play UNO!" instructions (service.mattel.com instruction sheets).

- Deck: 108 cards. Four colours (red, yellow, green, blue); each colour has one 0, two each of 1-9, two Skip, two Reverse, two Draw Two; plus four Wild and four Wild Draw Four.
- Deal seven cards to each player. Place the rest face down as the draw pile. Flip one card as the discard pile; if it is an action or wild card, flip again until a number card is showing.
- Play starts with the player left of the dealer and proceeds clockwise.
- On a turn, play one card matching the discard's colour, number, or symbol; or draw one card. A drawn card may be played immediately if legal; otherwise the turn passes. Drawing is allowed even with a playable card.
- Skip: the next player loses a turn. Reverse: direction flips; with two players it acts like Skip. Draw Two: the next player draws two and loses a turn.
- Wild: may always be played; the player chooses the continuing colour.
- Wild Draw Four: only legal when the hand has no card of the current colour and no wild card. The next player may draw four and lose a turn, or challenge. If the play was legal, the challenger draws six and loses a turn; if illegal, the player draws four and the challenger draws none. The chooser still selects the continuing colour.
- If the draw pile empties, reshuffle the discard pile (keeping the top card) into a new draw pile.
- A player who empties their hand wins the hand. Optional scoring (local only): number = face value, action = 20, wild/wild four = 50; first to 500 wins.
- Calling "UNO" is social and is not enforced by the server.

This build implements the classic hand only, with a single-winner result.
