-- Tests for the pure Lua chess rules.
--
-- Run from Games/:
--   lua Chess/server/test/chess_rules_test.lua
-- or from the repository root:
--   lua Games/Chess/server/test/chess_rules_test.lua

local script_path = arg[0] or "Chess/server/test/chess_rules_test.lua"
local script_dir = script_path:match("^(.*)[/\\]") or "."
local server_dir = script_dir .. "/.."
local games_dir = script_dir .. "/../../.."

local rules = assert(dofile(server_dir .. "/chess_rules.lua"))
local json = assert(dofile(script_dir .. "/json.lua"))

local tests_run = 0
local tests_passed = 0
local tests_failed = 0

local function test(name, callback)
  tests_run = tests_run + 1
  local ok, err = xpcall(callback, debug.traceback)
  if ok then
    tests_passed = tests_passed + 1
    print("[ok] " .. name)
  else
    tests_failed = tests_failed + 1
    print("[FAIL] " .. name)
    print(err)
  end
end

local function assert_equal(actual, expected, message)
  if actual ~= expected then
    error(
      (message or "assert_equal")
        .. ": expected "
        .. tostring(expected)
        .. ", got "
        .. tostring(actual),
      2
    )
  end
end

local function assert_truthy(value, message)
  if not value then
    error(message or "expected a truthy value", 2)
  end
end

local function assert_nil(value, message)
  if value ~= nil then
    error((message or "expected nil") .. ", got " .. tostring(value), 2)
  end
end

local function play(game, from_square, to_square, promotion)
  local move, err = game:move({
    from = from_square,
    to = to_square,
    promotion = promotion,
  })
  assert_truthy(move, err or ("move failed: " .. from_square .. to_square))
  return move
end

local function perft(game, depth)
  if depth == 0 then
    return 1
  end

  local moves = game:legal_moves()
  if depth == 1 then
    return #moves
  end

  local total = 0
  for _, move in ipairs(moves) do
    local undo = game:apply_move(move, false)
    total = total + perft(game, depth - 1)
    game:unapply(undo)
  end
  return total
end

local function read_vectors()
  local path = games_dir .. "/Chess/tests/vectors.json"
  local file = assert(io.open(path, "rb"), "could not open " .. path)
  local content = file:read("*a")
  file:close()
  return json.decode(content)
end

test("shared parity vectors", function()
  local vectors = read_vectors()
  assert_truthy(vectors.positions, "vectors.positions is missing")
  assert_equal(#vectors.positions, 3, "vector count")

  for _, position in ipairs(vectors.positions) do
    local game = rules.new(position.fen)
    local moves = game:legal_moves()
    assert_equal(#moves, position.legalMoves, position.name)
  end
end)

test("initial position metadata", function()
  local game = rules.new()
  assert_equal(game.turn, "w")
  assert_equal(game:fen(), rules.DEFAULT_FEN)
  assert_equal(#game:pieces(), 32)
  assert_equal(#game:legal_moves(), 20)
  assert_equal(#game:legal_moves("e2"), 2)
  assert_equal(game:piece_at("e1"), "K")
  assert_equal(game:piece_at("e8"), "k")
  assert_nil(game:piece_at("e4"))
end)

test("legal move and FEN after e4", function()
  local game = rules.new()
  local move = play(game, "e2", "e4")

  assert_equal(move.san, "e4")
  assert_equal(move.uci, "e2e4")
  assert_equal(move.flags, "b")
  assert_equal(move.captured, nil)
  assert_equal(game.turn, "b")
  assert_equal(game.ep, "e3")
  assert_equal(game:piece_at("e4"), "P")
  assert_nil(game:piece_at("e2"))
  assert_equal(
    game:fen(),
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"
  )
end)

test("illegal move is rejected without changing state", function()
  local game = rules.new()
  local move, err = game:move({ from = "e2", to = "e5" })

  assert_nil(move)
  assert_truthy(err)
  assert_equal(game:fen(), rules.DEFAULT_FEN)
  assert_equal(#game:history_san(), 0)
end)

test("fool's mate is checkmate", function()
  local game = rules.new()
  play(game, "f2", "f3")
  play(game, "e7", "e5")
  play(game, "g2", "g4")
  local final_move = play(game, "d8", "h4")

  local status = game:status()
  assert_equal(final_move.san, "Qh4#")
  assert_equal(status.status, "checkmate")
  assert_equal(status.winner, "b")
  assert_equal(status.in_check, true)
  assert_equal(status.is_game_over, true)
  assert_equal(#game:legal_moves(), 0)
end)

test("kingside castling moves king and rook", function()
  local game = rules.new()
  play(game, "e2", "e4")
  play(game, "e7", "e5")
  play(game, "g1", "f3")
  play(game, "b8", "c6")
  play(game, "f1", "c4")
  play(game, "g8", "f6")
  local move = play(game, "e1", "g1")

  assert_equal(move.san, "O-O")
  assert_equal(move.flags, "k")
  assert_equal(game:piece_at("g1"), "K")
  assert_equal(game:piece_at("f1"), "R")
  assert_nil(game:piece_at("e1"))
  assert_nil(game:piece_at("h1"))
  assert_equal(game.castling.wK, false)
  assert_equal(game.castling.wQ, false)
end)

test("queenside castling moves king and rook", function()
  local game = rules.new()
  play(game, "d2", "d4")
  play(game, "d7", "d5")
  play(game, "b1", "c3")
  play(game, "b8", "c6")
  play(game, "c1", "f4")
  play(game, "c8", "f5")
  play(game, "d1", "d2")
  play(game, "d8", "d7")
  local move = play(game, "e1", "c1")

  assert_equal(move.san, "O-O-O")
  assert_equal(move.flags, "q")
  assert_equal(game:piece_at("c1"), "K")
  assert_equal(game:piece_at("d1"), "R")
  assert_nil(game:piece_at("a1"))
  assert_equal(game.castling.wK, false)
  assert_equal(game.castling.wQ, false)
end)

test("en passant captures the pawn behind the target", function()
  local game = rules.new()
  play(game, "e2", "e4")
  play(game, "a7", "a6")
  play(game, "e4", "e5")
  play(game, "d7", "d5")
  local move = play(game, "e5", "d6")

  assert_equal(move.san, "exd6")
  assert_equal(move.flags, "e")
  assert_equal(move.captured, "p")
  assert_equal(move.uci, "e5d6")
  assert_equal(game:piece_at("d6"), "P")
  assert_nil(game:piece_at("d5"))
  assert_nil(game.ep)
end)

test("promotion to queen and knight", function()
  local promotion_fen = "8/P7/8/8/8/8/8/k6K w - - 0 1"

  local queen_game = rules.new(promotion_fen)
  local queen_move = play(queen_game, "a7", "a8", "q")
  assert_equal(queen_move.san, "a8=Q+")
  assert_equal(queen_move.promotion, "q")
  assert_equal(queen_game:piece_at("a8"), "Q")

  local knight_game = rules.new(promotion_fen)
  local knight_move = play(knight_game, "a7", "a8", "n")
  assert_equal(knight_move.san, "a8=N")
  assert_equal(knight_move.promotion, "n")
  assert_equal(knight_game:piece_at("a8"), "N")
end)

test("stalemate is detected", function()
  local game = rules.new("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1")
  local status = game:status()

  assert_equal(status.status, "stalemate")
  assert_nil(status.winner)
  assert_equal(status.in_check, false)
  assert_equal(status.is_game_over, true)
  assert_equal(#game:legal_moves(), 0)
end)

test("checkmate is detected", function()
  local game = rules.new("7k/6Q1/6K1/8/8/8/8/8 b - - 0 1")
  local status = game:status()

  assert_equal(status.status, "checkmate")
  assert_equal(status.winner, "w")
  assert_equal(status.in_check, true)
  assert_equal(status.is_game_over, true)
  assert_equal(#game:legal_moves(), 0)
end)

test("insufficient material is detected", function()
  local kings_only = rules.new("8/8/8/8/8/8/8/K6k w - - 0 1")
  local kings_only_status = kings_only:status()
  assert_equal(kings_only_status.status, "draw")
  assert_equal(kings_only_status.reason, "insufficient material")

  local bishop_only = rules.new("7k/8/8/8/8/8/8/KB6 w - - 0 1")
  local bishop_only_status = bishop_only:status()
  assert_equal(bishop_only_status.status, "draw")
  assert_equal(bishop_only_status.reason, "insufficient material")
end)

test("fifty-move rule is detected", function()
  local game = rules.new("4k3/8/8/8/8/8/8/4K2R w - - 99 1")
  play(game, "h1", "h2")

  local status = game:status()
  assert_equal(status.status, "draw")
  assert_equal(status.reason, "fifty-move rule")
  assert_equal(status.is_game_over, true)
end)

test("threefold repetition is detected", function()
  local game = rules.new()
  play(game, "g1", "f3")
  play(game, "g8", "f6")
  play(game, "f3", "g1")
  play(game, "f6", "g8")
  play(game, "g1", "f3")
  play(game, "g8", "f6")
  play(game, "f3", "g1")
  play(game, "f6", "g8")

  local status = game:status()
  assert_equal(status.status, "draw")
  assert_equal(status.reason, "threefold repetition")
  assert_equal(status.is_game_over, true)
end)

test("undo restores the previous position", function()
  local game = rules.new()
  play(game, "e2", "e4")

  local undone = game:undo()
  assert_truthy(undone)
  assert_equal(undone.san, "e4")
  assert_equal(game:fen(), rules.DEFAULT_FEN)
  assert_equal(game.turn, "w")
  assert_nil(game:piece_at("e4"))
  assert_equal(#game:history_san(), 0)
  assert_nil(game:undo())
end)

test("FEN round-trips through a new game", function()
  local game = rules.new()
  play(game, "e2", "e4")
  play(game, "e7", "e5")
  play(game, "g1", "f3")
  play(game, "b8", "c6")
  play(game, "f1", "b5")

  local fen = game:fen()
  local restored = rules.new(fen)
  assert_equal(restored:fen(), fen)
  assert_equal(#restored:legal_moves(), #game:legal_moves())
end)

test("SAN disambiguates two knights moving to the same square", function()
  local game = rules.new("4k3/8/8/8/8/5N2/8/1N2K3 w - - 0 1")
  local move = play(game, "b1", "d2")

  assert_equal(move.san, "Nbd2")
end)

test("PGN records numbered moves and SAN", function()
  local game = rules.new()
  play(game, "e2", "e4")
  play(game, "e7", "e5")
  play(game, "g1", "f3")

  assert_equal(game:pgn(), "1. e4 e5 2. Nf3")
end)

test("JSON-friendly state and action serialization", function()
  local game = rules.new()
  local state = game:get_state()

  assert_equal(state.fen, rules.DEFAULT_FEN)
  assert_equal(state.turn, "w")
  assert_equal(state.status, "active")
  assert_equal(state.winner, nil)
  assert_equal(state.inCheck, false)
  assert_equal(state.moveNumber, 1)
  assert_equal(#state.history, 0)
  assert_nil(state.lastMove)
  assert_equal(#state.board, 32)

  local king
  for _, piece in ipairs(state.board) do
    if piece.square == "e1" then
      king = piece
    end
  end
  assert_truthy(king)
  assert_equal(king.type, "k")
  assert_equal(king.color, "w")

  assert_equal(#state.legalMoves.e2, 2)
  local e4_move
  for _, move in ipairs(state.legalMoves.e2) do
    if move.to == "e4" then
      e4_move = move
    end
  end
  assert_truthy(e4_move)
  assert_equal(e4_move.san, "e4")
  assert_equal(e4_move.piece, "p")
  assert_equal(e4_move.uci, "e2e4")

  local grouped_count = 0
  for _, moves in pairs(state.legalMoves) do
    grouped_count = grouped_count + #moves
  end
  assert_equal(grouped_count, 20)

  play(game, "e2", "e4")
  state = game:get_state()
  assert_equal(state.turn, "b")
  assert_equal(#state.history, 1)
  assert_equal(state.lastMove.san, "e4")
  assert_equal(state.lastMove.piece, "p")
  assert_equal(state.lastMove.uci, "e2e4")

  local capture_game = rules.new()
  play(capture_game, "e2", "e4")
  play(capture_game, "d7", "d5")
  play(capture_game, "e4", "d5")
  local capture_state = capture_game:get_state()
  assert_equal(capture_state.lastMove.piece, "p")
  assert_equal(capture_state.lastMove.captured, "p")
  assert_equal(capture_state.lastMove.flags, "c")

  local action, action_error = rules.parse_action({
    type = "move",
    from = "e2",
    to = "e4",
    promotion = "Q",
  })
  assert_truthy(action, action_error)
  assert_equal(action.promotion, "q")

  local unsupported, unsupported_error = rules.parse_action({ type = "resign" })
  assert_nil(unsupported)
  assert_truthy(unsupported_error)

  local bad_promotion, promotion_error = rules.parse_action({
    from = "e2",
    to = "e4",
    promotion = "k",
  })
  assert_nil(bad_promotion)
  assert_truthy(promotion_error)
end)

test("perft initial position", function()
  local game = rules.new()
  assert_equal(perft(game, 1), 20)
  assert_equal(perft(game, 2), 400)
  assert_equal(perft(game, 3), 8902)
  assert_equal(game:fen(), rules.DEFAULT_FEN)
end)

test("perft kiwipete", function()
  local game = rules.new(
    "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1"
  )
  assert_equal(perft(game, 1), 48)
  assert_equal(perft(game, 2), 2039)
end)

print("")
print(
  string.format(
    "%d/%d tests passed",
    tests_passed,
    tests_run
  )
)

if tests_failed > 0 then
  os.exit(1)
end
