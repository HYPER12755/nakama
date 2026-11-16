The engine on the server
======================

The engine is the program that says what a position is worth. On lichess
the engines run on their own analysis servers, and the client asks them
over the network, so the engine never has to run inside the phone.

This is the same shape. The service here owns Stockfish and answers the
call lichess answers:

    POST /api/external-engine/{id}/analyse

The body carries the position, the moves that were played and the search
that is wanted:

    {
      "clientSecret": "",
      "work": {
        "sessionId": "moongames",
        "threads": 1,
        "hash": 16,
        "multiPv": 1,
        "variant": "chess",
        "initialFen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "moves": ["e2e4", "e7e5"],
        "by": "depth",
        "value": 12
      }
    }

The answer is a stream of lines, each one an evaluation that is deeper
than the last:

    {"keepalive":true}
    {"time":120,"depth":4,"nodes":2100,"pvs":[{"depth":4,"cp":12,"moves":["g1f3"]}]}
    {"time":1458,"depth":12,"nodes":48213,"pvs":[{"depth":12,"cp":-43,"moves":["a7a6"]}],
     "bestmove":"a7a6"}

The engine is Stockfish, spoken to over its own protocol, so it is the
same engine lichess uses. It is installed with:

    pkg install stockfish

The service is built and started with the rest of the stack:

    node tools/stack.mjs start engine

The client reaches it through the address the player came to, so a tunnel,
a proxy or a CDN needs that one address and nothing more.
