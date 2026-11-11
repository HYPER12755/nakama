-- MoonGames Chess — pure Lua rules engine.
--
-- This module has no Nakama dependencies. It can be loaded by the Nakama
-- runtime, or tested directly with a plain Lua 5.4 interpreter.
--
-- Board layout: board[rank][file], rank 1 = white's home rank, file 1 = a.
-- Pieces: uppercase = white, lowercase = black. Empty squares are nil.

local rules = {}

rules.DEFAULT_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

local KNIGHT_OFFSETS = {
  { -2, -1 },
  { -2, 1 },
  { -1, -2 },
  { -1, 2 },
  { 1, -2 },
  { 1, 2 },
  { 2, -1 },
  { 2, 1 },
}

local KING_OFFSETS = {
  { -1, -1 },
  { -1, 0 },
  { -1, 1 },
  { 0, -1 },
  { 0, 1 },
  { 1, -1 },
  { 1, 0 },
  { 1, 1 },
}

local BISHOP_DIRS = {
  { -1, -1 },
  { -1, 1 },
  { 1, -1 },
  { 1, 1 },
}

local ROOK_DIRS = {
  { -1, 0 },
  { 1, 0 },
  { 0, -1 },
  { 0, 1 },
}

local QUEEN_DIRS = {
  { -1, -1 },
  { -1, 1 },
  { 1, -1 },
  { 1, 1 },
  { -1, 0 },
  { 1, 0 },
  { 0, -1 },
  { 0, 1 },
}

local PROMOTION_PIECES = { "q", "r", "b", "n" }

local function inside(file, rank)
  return file >= 1 and file <= 8 and rank >= 1 and rank <= 8
end

local function opposite(color)
  return color == "w" and "b" or "w"
end

local function file_of(square)
  return string.byte(square, 1) - 96
end

local function rank_of(square)
  return tonumber(string.sub(square, 2, 2))
end

local function square_name(file, rank)
  return string.char(96 + file) .. rank
end

local function piece_color(piece)
  return piece:match("%u") and "w" or "b"
end

local function piece_type(piece)
  return piece:upper()
end

local function copy_castling(castling)
  return {
    wK = castling.wK,
    wQ = castling.wQ,
    bK = castling.bK,
    bQ = castling.bQ,
  }
end

local function has_flag(flags, flag)
  return string.find(flags, flag, 1, true) ~= nil
end

local function make_move(
  from_file,
  from_rank,
  to_file,
  to_rank,
  piece,
  captured,
  flags,
  promotion
)
  local from = square_name(from_file, from_rank)
  local to = square_name(to_file, to_rank)
  return {
    from = from,
    to = to,
    from_f = from_file,
    from_r = from_rank,
    to_f = to_file,
    to_r = to_rank,
    piece = piece,
    color = piece_color(piece),
    captured = captured,
    flags = flags,
    promotion = promotion,
    uci = from .. to .. (promotion or ""),
  }
end

local Game = {}
Game.__index = Game

local function new_game(fen)
  local self = setmetatable({}, Game)
  self:load(fen or rules.DEFAULT_FEN)
  return self
end

function Game:load(fen)
  local parts = {}
  for part in string.gmatch(fen, "%S+") do
    parts[#parts + 1] = part
  end

  assert(#parts >= 4, "invalid FEN: expected at least 4 fields")

  local rows = {}
  for row in string.gmatch(parts[1], "[^/]+") do
    rows[#rows + 1] = row
  end
  assert(#rows == 8, "invalid FEN: expected 8 ranks")

  local board = {}
  for rank = 1, 8 do
    board[rank] = {}
  end

  for index = 1, 8 do
    local rank = 9 - index
    local file = 1
    local row = rows[index]

    for position = 1, #row do
      local character = string.sub(row, position, position)
      if character:match("%d") then
        file = file + tonumber(character)
      elseif character:match("[pnbrqkPNBRQK]") then
        assert(file <= 8, "invalid FEN: rank overflow")
        board[rank][file] = character
        file = file + 1
      else
        error("invalid FEN character: " .. character)
      end
    end

    assert(file == 9, "invalid FEN: rank does not fill 8 files")
  end

  self.board = board
  self.turn = parts[2]
  assert(self.turn == "w" or self.turn == "b", "invalid FEN turn")

  self.castling = { wK = false, wQ = false, bK = false, bQ = false }
  if parts[3] ~= "-" then
    for index = 1, #parts[3] do
      local character = string.sub(parts[3], index, index)
      if character == "K" then
        self.castling.wK = true
      elseif character == "Q" then
        self.castling.wQ = true
      elseif character == "k" then
        self.castling.bK = true
      elseif character == "q" then
        self.castling.bQ = true
      else
        error("invalid FEN castling rights: " .. character)
      end
    end
  end

  self.ep = parts[4] == "-" and nil or parts[4]
  self.halfmove = tonumber(parts[5] or "0") or 0
  self.fullmove = tonumber(parts[6] or "1") or 1
  self.initial_fen = self:fen()
  self.history = {}
  self.positions = {}
  self.positions[self:position_key()] = 1

  return self
end

function Game:reset()
  return self:load(rules.DEFAULT_FEN)
end

function Game:board_fen()
  local rows = {}

  for rank = 8, 1, -1 do
    local row = {}
    local empty = 0

    for file = 1, 8 do
      local piece = self.board[rank][file]
      if piece then
        if empty > 0 then
          row[#row + 1] = tostring(empty)
          empty = 0
        end
        row[#row + 1] = piece
      else
        empty = empty + 1
      end
    end

    if empty > 0 then
      row[#row + 1] = tostring(empty)
    end

    rows[#rows + 1] = table.concat(row)
  end

  return table.concat(rows, "/")
end

function Game:castling_string()
  local value = ""
  if self.castling.wK then
    value = value .. "K"
  end
  if self.castling.wQ then
    value = value .. "Q"
  end
  if self.castling.bK then
    value = value .. "k"
  end
  if self.castling.bQ then
    value = value .. "q"
  end
  return value == "" and "-" or value
end

function Game:fen()
  return table.concat({
    self:board_fen(),
    self.turn,
    self:castling_string(),
    self.ep or "-",
    tostring(self.halfmove),
    tostring(self.fullmove),
  }, " ")
end

function Game:position_key()
  return table.concat({
    self:board_fen(),
    self.turn,
    self:castling_string(),
    self.ep or "-",
  }, " ")
end

function Game:piece_at(square)
  local file = file_of(square)
  local rank = rank_of(square)
  if not inside(file, rank) then
    return nil
  end
  return self.board[rank][file]
end

function Game:pieces()
  local result = {}
  for rank = 1, 8 do
    for file = 1, 8 do
      local piece = self.board[rank][file]
      if piece then
        result[#result + 1] = {
          square = square_name(file, rank),
          piece = piece,
          type = piece_type(piece),
          color = piece_color(piece),
        }
      end
    end
  end
  return result
end

function Game:find_king(color)
  local king = color == "w" and "K" or "k"
  for rank = 1, 8 do
    for file = 1, 8 do
      if self.board[rank][file] == king then
        return file, rank
      end
    end
  end
  return nil
end

function Game:is_square_attacked(file, rank, by_color)
  local board = self.board

  if by_color == "w" then
    if inside(file - 1, rank - 1) and board[rank - 1][file - 1] == "P" then
      return true
    end
    if inside(file + 1, rank - 1) and board[rank - 1][file + 1] == "P" then
      return true
    end
  else
    if inside(file - 1, rank + 1) and board[rank + 1][file - 1] == "p" then
      return true
    end
    if inside(file + 1, rank + 1) and board[rank + 1][file + 1] == "p" then
      return true
    end
  end

  local knight = by_color == "w" and "N" or "n"
  for _, offset in ipairs(KNIGHT_OFFSETS) do
    local next_file = file + offset[1]
    local next_rank = rank + offset[2]
    if inside(next_file, next_rank) and board[next_rank][next_file] == knight then
      return true
    end
  end

  local king = by_color == "w" and "K" or "k"
  for _, offset in ipairs(KING_OFFSETS) do
    local next_file = file + offset[1]
    local next_rank = rank + offset[2]
    if inside(next_file, next_rank) and board[next_rank][next_file] == king then
      return true
    end
  end

  local bishop = by_color == "w" and "B" or "b"
  local rook = by_color == "w" and "R" or "r"
  local queen = by_color == "w" and "Q" or "q"

  for _, direction in ipairs(BISHOP_DIRS) do
    local next_file = file + direction[1]
    local next_rank = rank + direction[2]

    while inside(next_file, next_rank) do
      local piece = board[next_rank][next_file]
      if piece then
        if piece == bishop or piece == queen then
          return true
        end
        break
      end
      next_file = next_file + direction[1]
      next_rank = next_rank + direction[2]
    end
  end

  for _, direction in ipairs(ROOK_DIRS) do
    local next_file = file + direction[1]
    local next_rank = rank + direction[2]

    while inside(next_file, next_rank) do
      local piece = board[next_rank][next_file]
      if piece then
        if piece == rook or piece == queen then
          return true
        end
        break
      end
      next_file = next_file + direction[1]
      next_rank = next_rank + direction[2]
    end
  end

  return false
end

function Game:is_in_check(color)
  local file, rank = self:find_king(color)
  if not file then
    return false
  end
  return self:is_square_attacked(file, rank, opposite(color))
end

function Game:add_castling_moves(moves, color)
  local rank = color == "w" and 1 or 8
  local king = color == "w" and "K" or "k"
  local rook = color == "w" and "R" or "r"
  local enemy = opposite(color)
  local board = self.board

  if board[rank][5] ~= king then
    return
  end

  local function empty(file)
    return board[rank][file] == nil
  end

  local function safe(file)
    return not self:is_square_attacked(file, rank, enemy)
  end

  if
    self.castling[color .. "K"]
    and board[rank][8] == rook
    and empty(6)
    and empty(7)
    and safe(5)
    and safe(6)
    and safe(7)
  then
    moves[#moves + 1] = make_move(5, rank, 7, rank, king, nil, "k", nil)
  end

  if
    self.castling[color .. "Q"]
    and board[rank][1] == rook
    and empty(2)
    and empty(3)
    and empty(4)
    and safe(5)
    and safe(4)
    and safe(3)
  then
    moves[#moves + 1] = make_move(5, rank, 3, rank, king, nil, "q", nil)
  end
end

function Game:generate_pseudo_moves(color)
  local moves = {}
  local board = self.board

  for rank = 1, 8 do
    for file = 1, 8 do
      local piece = board[rank][file]

      if piece and piece_color(piece) == color then
        local kind = piece_type(piece)

        if kind == "P" then
          local direction = color == "w" and 1 or -1
          local start_rank = color == "w" and 2 or 7
          local promotion_rank = color == "w" and 8 or 1
          local next_rank = rank + direction

          if inside(file, next_rank) and not board[next_rank][file] then
            if next_rank == promotion_rank then
              for _, promotion in ipairs(PROMOTION_PIECES) do
                moves[#moves + 1] =
                  make_move(file, rank, file, next_rank, piece, nil, "p", promotion)
              end
            else
              moves[#moves + 1] =
                make_move(file, rank, file, next_rank, piece, nil, "n", nil)

              if rank == start_rank then
                local double_rank = rank + (2 * direction)
                if inside(file, double_rank) and not board[double_rank][file] then
                  moves[#moves + 1] =
                    make_move(file, rank, file, double_rank, piece, nil, "b", nil)
                end
              end
            end
          end

          for _, file_delta in ipairs({ -1, 1 }) do
            local capture_file = file + file_delta

            if inside(capture_file, next_rank) then
              local target = board[next_rank][capture_file]

              if target and piece_color(target) ~= color then
                if next_rank == promotion_rank then
                  for _, promotion in ipairs(PROMOTION_PIECES) do
                    moves[#moves + 1] = make_move(
                      file,
                      rank,
                      capture_file,
                      next_rank,
                      piece,
                      target,
                      "cp",
                      promotion
                    )
                  end
                else
                  moves[#moves + 1] = make_move(
                    file,
                    rank,
                    capture_file,
                    next_rank,
                    piece,
                    target,
                    "c",
                    nil
                  )
                end
              elseif
                not target
                and self.ep
                and square_name(capture_file, next_rank) == self.ep
              then
                local captured = board[rank][capture_file]
                if
                  captured
                  and piece_type(captured) == "P"
                  and piece_color(captured) ~= color
                then
                  moves[#moves + 1] = make_move(
                    file,
                    rank,
                    capture_file,
                    next_rank,
                    piece,
                    captured,
                    "e",
                    nil
                  )
                end
              end
            end
          end
        elseif kind == "N" then
          for _, offset in ipairs(KNIGHT_OFFSETS) do
            local next_file = file + offset[1]
            local next_rank = rank + offset[2]

            if inside(next_file, next_rank) then
              local target = board[next_rank][next_file]
              if not target then
                moves[#moves + 1] =
                  make_move(file, rank, next_file, next_rank, piece, nil, "n", nil)
              elseif piece_color(target) ~= color then
                moves[#moves + 1] = make_move(
                  file,
                  rank,
                  next_file,
                  next_rank,
                  piece,
                  target,
                  "c",
                  nil
                )
              end
            end
          end
        elseif kind == "B" or kind == "R" or kind == "Q" then
          local directions
          if kind == "B" then
            directions = BISHOP_DIRS
          elseif kind == "R" then
            directions = ROOK_DIRS
          else
            directions = QUEEN_DIRS
          end

          for _, direction in ipairs(directions) do
            local next_file = file + direction[1]
            local next_rank = rank + direction[2]

            while inside(next_file, next_rank) do
              local target = board[next_rank][next_file]

              if not target then
                moves[#moves + 1] = make_move(
                  file,
                  rank,
                  next_file,
                  next_rank,
                  piece,
                  nil,
                  "n",
                  nil
                )
              else
                if piece_color(target) ~= color then
                  moves[#moves + 1] = make_move(
                    file,
                    rank,
                    next_file,
                    next_rank,
                    piece,
                    target,
                    "c",
                    nil
                  )
                end
                break
              end

              next_file = next_file + direction[1]
              next_rank = next_rank + direction[2]
            end
          end
        elseif kind == "K" then
          for _, offset in ipairs(KING_OFFSETS) do
            local next_file = file + offset[1]
            local next_rank = rank + offset[2]

            if inside(next_file, next_rank) then
              local target = board[next_rank][next_file]
              if not target then
                moves[#moves + 1] =
                  make_move(file, rank, next_file, next_rank, piece, nil, "n", nil)
              elseif piece_color(target) ~= color then
                moves[#moves + 1] = make_move(
                  file,
                  rank,
                  next_file,
                  next_rank,
                  piece,
                  target,
                  "c",
                  nil
                )
              end
            end
          end

          self:add_castling_moves(moves, color)
        end
      end
    end
  end

  return moves
end

local function update_castling_rights(
  game,
  moving_piece,
  from_file,
  from_rank,
  captured_piece,
  captured_file,
  captured_rank
)
  local moving_type = piece_type(moving_piece)
  local moving_color = piece_color(moving_piece)

  if moving_type == "K" then
    if moving_color == "w" then
      game.castling.wK = false
      game.castling.wQ = false
    else
      game.castling.bK = false
      game.castling.bQ = false
    end
  elseif moving_type == "R" then
    if moving_color == "w" then
      if from_file == 8 and from_rank == 1 then
        game.castling.wK = false
      elseif from_file == 1 and from_rank == 1 then
        game.castling.wQ = false
      end
    else
      if from_file == 8 and from_rank == 8 then
        game.castling.bK = false
      elseif from_file == 1 and from_rank == 8 then
        game.castling.bQ = false
      end
    end
  end

  if captured_piece and piece_type(captured_piece) == "R" then
    local captured_color = piece_color(captured_piece)
    if captured_color == "w" then
      if captured_file == 8 and captured_rank == 1 then
        game.castling.wK = false
      elseif captured_file == 1 and captured_rank == 1 then
        game.castling.wQ = false
      end
    else
      if captured_file == 8 and captured_rank == 8 then
        game.castling.bK = false
      elseif captured_file == 1 and captured_rank == 8 then
        game.castling.bQ = false
      end
    end
  end
end

function Game:apply_move(move, record, san)
  local board = self.board
  local changes = {}

  local function set(file, rank, piece)
    changes[#changes + 1] = {
      f = file,
      r = rank,
      old = board[rank][file],
    }
    board[rank][file] = piece
  end

  local undo = {
    changes = changes,
    turn = self.turn,
    castling = copy_castling(self.castling),
    ep = self.ep,
    halfmove = self.halfmove,
    fullmove = self.fullmove,
  }

  local piece = board[move.from_r][move.from_f]
  assert(piece, "no piece at move origin")

  local moving_type = piece_type(piece)
  local captured
  local captured_file
  local captured_rank

  if has_flag(move.flags, "e") then
    captured = board[move.from_r][move.to_f]
    captured_file = move.to_f
    captured_rank = move.from_r
  else
    captured = board[move.to_r][move.to_f]
    if captured then
      captured_file = move.to_f
      captured_rank = move.to_r
    end
  end

  update_castling_rights(
    self,
    piece,
    move.from_f,
    move.from_r,
    captured,
    captured_file,
    captured_rank
  )

  set(move.from_f, move.from_r, nil)

  if has_flag(move.flags, "e") and captured_file then
    set(captured_file, captured_rank, nil)
  end

  local placed = piece
  if moving_type == "P" and (move.to_r == 8 or move.to_r == 1) then
    local promotion = move.promotion or "q"
    placed = piece_color(piece) == "w" and string.upper(promotion)
      or string.lower(promotion)
  end

  set(move.to_f, move.to_r, placed)

  if has_flag(move.flags, "k") then
    local rank = move.from_r
    local rook = board[rank][8]
    set(8, rank, nil)
    set(6, rank, rook)
  elseif has_flag(move.flags, "q") then
    local rank = move.from_r
    local rook = board[rank][1]
    set(1, rank, nil)
    set(4, rank, rook)
  end

  if moving_type == "P" and math.abs(move.to_r - move.from_r) == 2 then
    self.ep = square_name(
      move.from_f,
      math.floor((move.from_r + move.to_r) / 2)
    )
  else
    self.ep = nil
  end

  if moving_type == "P" or captured ~= nil then
    self.halfmove = 0
  else
    self.halfmove = self.halfmove + 1
  end

  if self.turn == "b" then
    self.fullmove = self.fullmove + 1
  end

  self.turn = opposite(self.turn)

  if record then
    local stored_move = {}
    for key, value in pairs(move) do
      stored_move[key] = value
    end
    stored_move.san = san

    self.history[#self.history + 1] = {
      move = stored_move,
      undo = undo,
    }

    local key = self:position_key()
    self.positions[key] = (self.positions[key] or 0) + 1
    undo.recorded = true
  end

  return undo
end

function Game:unapply(undo)
  for index = #undo.changes, 1, -1 do
    local change = undo.changes[index]
    self.board[change.r][change.f] = change.old
  end

  self.turn = undo.turn
  self.castling = undo.castling
  self.ep = undo.ep
  self.halfmove = undo.halfmove
  self.fullmove = undo.fullmove
end

function Game:generate_legal_moves(color)
  color = color or self.turn
  local pseudo_moves = self:generate_pseudo_moves(color)
  local legal_moves = {}

  for _, move in ipairs(pseudo_moves) do
    local undo = self:apply_move(move, false)
    local valid = not self:is_in_check(color)
    self:unapply(undo)

    if valid then
      legal_moves[#legal_moves + 1] = move
    end
  end

  return legal_moves
end

function Game:legal_moves(from_square)
  local legal_moves = self:generate_legal_moves(self.turn)
  if not from_square then
    return legal_moves
  end

  local filtered = {}
  for _, move in ipairs(legal_moves) do
    if move.from == from_square then
      filtered[#filtered + 1] = move
    end
  end

  return filtered
end

function Game:disambiguation(move, legal_moves, kind)
  local same_file = false
  local same_rank = false
  local ambiguous = false

  for _, other in ipairs(legal_moves) do
    if
      other ~= move
      and piece_type(other.piece) == kind
      and other.to_f == move.to_f
      and other.to_r == move.to_r
    then
      ambiguous = true
      if other.from_f == move.from_f then
        same_file = true
      end
      if other.from_r == move.from_r then
        same_rank = true
      end
    end
  end

  if not ambiguous then
    return ""
  end

  if same_file and same_rank then
    return square_name(move.from_f, move.from_r)
  end

  if same_file then
    return tostring(move.from_r)
  end

  return string.char(96 + move.from_f)
end

function Game:with_check_suffix(move, text)
  local undo = self:apply_move(move, false)
  local opponent = self.turn
  local in_check = self:is_in_check(opponent)
  local suffix = ""

  if in_check then
    local replies = self:generate_legal_moves(opponent)
    suffix = #replies == 0 and "#" or "+"
  end

  self:unapply(undo)
  return text .. suffix
end

function Game:san_for(move, legal_moves)
  if has_flag(move.flags, "k") then
    return self:with_check_suffix(move, "O-O")
  elseif has_flag(move.flags, "q") then
    return self:with_check_suffix(move, "O-O-O")
  end

  local kind = piece_type(move.piece)
  local capture = self.board[move.to_r][move.to_f] ~= nil
    or has_flag(move.flags, "e")
  local text

  if kind == "P" then
    if capture then
      text = string.char(96 + move.from_f) .. "x" .. move.to
    else
      text = move.to
    end

    if move.promotion then
      text = text .. "=" .. string.upper(move.promotion)
    end
  else
    local disambiguation = self:disambiguation(move, legal_moves, kind)
    text = kind
      .. disambiguation
      .. (capture and "x" or "")
      .. move.to
  end

  return self:with_check_suffix(move, text)
end

function Game:move(input)
  if type(input) ~= "table" or not input.from or not input.to then
    return nil, "move must include from and to"
  end

  local legal_moves = self:generate_legal_moves(self.turn)
  local requested_promotion =
    input.promotion and string.lower(input.promotion) or nil
  local chosen

  for _, move in ipairs(legal_moves) do
    if move.from == input.from and move.to == input.to then
      if move.promotion then
        local wanted = requested_promotion or "q"
        if move.promotion == wanted then
          chosen = move
          break
        end
      else
        chosen = move
        break
      end
    end
  end

  if not chosen then
    return nil, "illegal move"
  end

  local san = self:san_for(chosen, legal_moves)
  chosen.san = san
  self:apply_move(chosen, true, san)
  return chosen
end

function Game:undo()
  local record = table.remove(self.history)
  if not record then
    return nil
  end

  local current_key = self:position_key()
  local count = self.positions[current_key] or 0
  if count <= 1 then
    self.positions[current_key] = nil
  else
    self.positions[current_key] = count - 1
  end

  self:unapply(record.undo)
  return record.move
end

function Game:is_insufficient_material()
  local pieces = {}

  for rank = 1, 8 do
    for file = 1, 8 do
      local piece = self.board[rank][file]
      if piece and piece_type(piece) ~= "K" then
        pieces[#pieces + 1] = {
          type = piece_type(piece),
          color = piece_color(piece),
          file = file,
          rank = rank,
        }
      end
    end
  end

  if #pieces == 0 then
    return true
  end

  if #pieces == 1 then
    return pieces[1].type == "B" or pieces[1].type == "N"
  end

  if
    #pieces == 2
    and pieces[1].type == "B"
    and pieces[2].type == "B"
    and pieces[1].color ~= pieces[2].color
  then
    return ((pieces[1].file + pieces[1].rank) % 2)
      == ((pieces[2].file + pieces[2].rank) % 2)
  end

  return false
end

function Game:status()
  local legal_moves = self:generate_legal_moves(self.turn)
  local in_check = self:is_in_check(self.turn)

  if #legal_moves == 0 then
    if in_check then
      return {
        status = "checkmate",
        winner = opposite(self.turn),
        in_check = true,
        is_game_over = true,
      }
    end

    return {
      status = "stalemate",
      winner = nil,
      in_check = false,
      is_game_over = true,
    }
  end

  if self.halfmove >= 100 then
    return {
      status = "draw",
      winner = nil,
      in_check = in_check,
      is_game_over = true,
      reason = "fifty-move rule",
    }
  end

  if self:is_insufficient_material() then
    return {
      status = "draw",
      winner = nil,
      in_check = in_check,
      is_game_over = true,
      reason = "insufficient material",
    }
  end

  local repetitions = self.positions[self:position_key()] or 0
  if repetitions >= 3 then
    return {
      status = "draw",
      winner = nil,
      in_check = in_check,
      is_game_over = true,
      reason = "threefold repetition",
    }
  end

  if in_check then
    return {
      status = "check",
      winner = nil,
      in_check = true,
      is_game_over = false,
    }
  end

  return {
    status = "active",
    winner = nil,
    in_check = false,
    is_game_over = false,
  }
end

function Game:history_san()
  local result = {}
  for index, record in ipairs(self.history) do
    result[index] = record.move.san
  end
  return result
end

function Game:pgn()
  local parts = {}
  for index, record in ipairs(self.history) do
    local move_number = math.floor((index - 1) / 2) + 1
    if (index - 1) % 2 == 0 then
      parts[#parts + 1] = move_number .. "."
    end
    parts[#parts + 1] = record.move.san
  end

  local body = table.concat(parts, " ")
  if self.initial_fen ~= rules.DEFAULT_FEN then
    return '[SetUp "1"]\n[FEN "' .. self.initial_fen .. '"]\n\n' .. body
  end
  return body
end

function Game:wire_move(move, san)
  return {
    from = move.from,
    to = move.to,
    promotion = move.promotion,
    san = san or move.san,
    uci = move.uci,
    piece = string.lower(move.piece),
    color = move.color,
    captured = move.captured and string.lower(move.captured) or nil,
    flags = move.flags,
  }
end

function Game:wire_status()
  local status = self:status()
  return {
    status = status.status,
    winner = status.winner,
    inCheck = status.in_check,
    isGameOver = status.is_game_over,
    reason = status.reason,
  }
end

-- JSON-friendly state matching the TypeScript ChessState contract.
function Game:get_state()
  local status = self:wire_status()
  local legal_moves = self:generate_legal_moves(self.turn)

  local history = {}
  for index, record in ipairs(self.history) do
    history[index] = self:wire_move(record.move)
  end

  local board = {}
  for _, piece in ipairs(self:pieces()) do
    board[#board + 1] = {
      square = piece.square,
      type = string.lower(piece.type),
      color = piece.color,
    }
  end

  local grouped_moves = {}
  for _, move in ipairs(legal_moves) do
    local san = move.san or self:san_for(move, legal_moves)
    local wire = self:wire_move(move, san)
    local bucket = grouped_moves[wire.from]
    if not bucket then
      bucket = {}
      grouped_moves[wire.from] = bucket
    end
    bucket[#bucket + 1] = wire
  end

  return {
    fen = self:fen(),
    turn = self.turn,
    status = status.status,
    winner = status.winner,
    inCheck = status.inCheck,
    reason = status.reason,
    moveNumber = self.fullmove,
    halfmoveClock = self.halfmove,
    history = history,
    lastMove = history[#history],
    board = board,
    legalMoves = grouped_moves,
  }
end

function Game:export_state()
  return self:get_state()
end

function rules.parse_action(action)
  if type(action) ~= "table" then
    return nil, "action must be a table"
  end

  local action_type = action.type or action.action
  if action_type ~= nil and action_type ~= "move" then
    return nil, "unsupported action: " .. tostring(action_type)
  end

  if type(action.from) ~= "string" or type(action.to) ~= "string" then
    return nil, "move action requires from and to"
  end

  local promotion
  if action.promotion ~= nil then
    promotion = string.lower(action.promotion)
    if
      promotion ~= "q"
      and promotion ~= "r"
      and promotion ~= "b"
      and promotion ~= "n"
    then
      return nil, "invalid promotion piece"
    end
  end

  return {
    from = action.from,
    to = action.to,
    promotion = promotion,
  }
end

function rules.new(fen)
  return new_game(fen)
end

rules.from_fen = rules.new

return rules
