The sounds of a chess table
==========================

Every sound in this folder is a real recording of a board, downloaded with
the game, so a table sounds like a table and not like a machine.

There are nine sets of sounds, and a player chooses one in the settings of
the game:

  moongames    the house set. It is a mix of three of the lichess themes,
               because each theme has one sound the others do not have: the
               table sounds come from the standard theme, the loud moments
               from the futuristic theme, and the checkmate from the robot
               theme. This is the default.

  standard     the sounds of the table itself.
  futuristic  the loud moments.
  robot        a machine that plays the table.
  woodland    the table in the woods.
  piano        the table in notes.
  nes          the table in a game from the eighties.
  sfx          the table in a game from the nineties.
  lisp         the table in short sounds.

The eight named sets come from the lichess sound set, which is released
under the MIT licence:

    https://github.com/lichess-org/lila/tree/master/public/sound

Each set has the same twelve sounds, named for the moment they belong to:

  move      a piece is put down on the board
  capture   a piece is taken off the board
  select    a piece is picked up
  check     the king is in check
  checkmate the game is over
  win       the player won
  lose      the player lost
  draw      the game was drawn
  error     a move was refused
  notify    the other player has gone
  lowtime   the clock is running out
  start     the game has begun

A few of the lichess themes do not have every one of these sounds. Where a
theme is missing one, the standard theme supplies it, so a set is always
complete.

Every file is fetched the first time it is needed and then kept, so the game
never waits for a sound and the table is never silent.
