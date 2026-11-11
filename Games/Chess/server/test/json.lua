-- Minimal JSON decoder used by the Lua rules tests.
-- Supports the subset needed by Games/Chess/tests/vectors.json.

local json = {}

json.null = setmetatable({}, { __tostring = function() return "null" end })

local function skip_whitespace(text, index)
  while true do
    local character = string.sub(text, index, index)
    if
      character == " "
      or character == "\n"
      or character == "\r"
      or character == "\t"
    then
      index = index + 1
    else
      return index
    end
  end
end

local parse_value

local function parse_string(text, index)
  assert(string.sub(text, index, index) == '"', "expected string")
  index = index + 1
  local output = {}

  while true do
    local character = string.sub(text, index, index)
    if character == "" then
      error("unterminated JSON string")
    elseif character == '"' then
      return table.concat(output), index + 1
    elseif character == "\\" then
      local escaped = string.sub(text, index + 1, index + 1)
      if escaped == '"' or escaped == "\\" or escaped == "/" then
        output[#output + 1] = escaped
        index = index + 2
      elseif escaped == "b" then
        output[#output + 1] = "\b"
        index = index + 2
      elseif escaped == "f" then
        output[#output + 1] = "\f"
        index = index + 2
      elseif escaped == "n" then
        output[#output + 1] = "\n"
        index = index + 2
      elseif escaped == "r" then
        output[#output + 1] = "\r"
        index = index + 2
      elseif escaped == "t" then
        output[#output + 1] = "\t"
        index = index + 2
      elseif escaped == "u" then
        local hex = string.sub(text, index + 2, index + 5)
        local code = tonumber(hex, 16)
        if not code then
          error("invalid JSON unicode escape")
        end

        if code < 0x80 then
          output[#output + 1] = string.char(code)
        elseif code < 0x800 then
          output[#output + 1] = string.char(
            0xC0 + math.floor(code / 0x40),
            0x80 + (code % 0x40)
          )
        else
          output[#output + 1] = string.char(
            0xE0 + math.floor(code / 0x1000),
            0x80 + (math.floor(code / 0x40) % 0x40),
            0x80 + (code % 0x40)
          )
        end

        index = index + 6
      else
        error("invalid JSON escape: \\" .. escaped)
      end
    else
      output[#output + 1] = character
      index = index + 1
    end
  end
end

local function parse_number(text, index)
  local start = index
  while string.sub(text, index, index):match("[%d%.eE%+%-]") do
    index = index + 1
  end

  local value = tonumber(string.sub(text, start, index - 1))
  if not value then
    error("invalid JSON number")
  end
  return value, index
end

local function parse_array(text, index)
  index = skip_whitespace(text, index + 1)
  local result = {}

  if string.sub(text, index, index) == "]" then
    return result, index + 1
  end

  while true do
    local value
    value, index = parse_value(text, index)
    result[#result + 1] = value
    index = skip_whitespace(text, index)

    local character = string.sub(text, index, index)
    if character == "]" then
      return result, index + 1
    elseif character == "," then
      index = skip_whitespace(text, index + 1)
    else
      error("expected ',' or ']' in JSON array")
    end
  end
end

local function parse_object(text, index)
  index = skip_whitespace(text, index + 1)
  local result = {}

  if string.sub(text, index, index) == "}" then
    return result, index + 1
  end

  while true do
    local key
    key, index = parse_string(text, index)
    index = skip_whitespace(text, index)

    if string.sub(text, index, index) ~= ":" then
      error("expected ':' in JSON object")
    end

    local value
    value, index = parse_value(text, skip_whitespace(text, index + 1))
    result[key] = value
    index = skip_whitespace(text, index)

    local character = string.sub(text, index, index)
    if character == "}" then
      return result, index + 1
    elseif character == "," then
      index = skip_whitespace(text, index + 1)
    else
      error("expected ',' or '}' in JSON object")
    end
  end
end

local function parse_literal(text, index, literal, value)
  if string.sub(text, index, index + #literal - 1) ~= literal then
    error("invalid JSON literal")
  end
  return value, index + #literal
end

parse_value = function(text, index)
  index = skip_whitespace(text, index)
  local character = string.sub(text, index, index)

  if character == '"' then
    return parse_string(text, index)
  elseif character == "[" then
    return parse_array(text, index)
  elseif character == "{" then
    return parse_object(text, index)
  elseif character == "t" then
    return parse_literal(text, index, "true", true)
  elseif character == "f" then
    return parse_literal(text, index, "false", false)
  elseif character == "n" then
    return parse_literal(text, index, "null", json.null)
  elseif character == "-" or character:match("%d") then
    return parse_number(text, index)
  end

  error("unexpected JSON character: " .. character)
end

function json.decode(text)
  local value, index = parse_value(text, 1)
  index = skip_whitespace(text, index)
  if index <= #text then
    error("trailing JSON content at byte " .. index)
  end
  return value
end

return json
