The sounds of a chess table
==========================

The sound files in this folder come from the lichess sound set, which is
released under the MIT licence:

    https://github.com/lichess-org/lila/tree/master/public/sound

Two themes are used, because they suit different moments:

  standard    the sounds of the table itself: a piece that is put down, a
              piece that is taken, the click of a piece, the warning of a
              refused move, the tick of a clock that is running out, and the
              note that the other player has gone.

  futuristic  the loud moments: the check, the win, the loss, the draw,
              and the call that starts the game.

  robot       the checkmate, because it is the one sound the other two
              themes do not have.

Every file is fetched the first time it is needed and then kept, so the
game never waits for a sound and the table is never silent.
