dotenv_file="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.env"

load_dotenv() {
  [[ -f "$dotenv_file" ]] || return 0
  while IFS= read -r raw || [[ -n "$raw" ]]; do
    raw="${raw%$'\r'}"
    case "$raw" in
      ''|'#'*) continue ;;
    esac
    [[ "$raw" == *=* ]] || continue
    local key="${raw%%=*}" value="${raw#*=}"
    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    if [[ ${#value} -ge 2 ]]; then
      if [[ "${value:0:1}" == '"' && "${value: -1}" == '"' ]] || \
         [[ "${value:0:1}" == "'" && "${value: -1}" == "'" ]]; then
        value="${value:1:${#value}-2}"
      fi
    fi
    [[ -n "$key" ]] || continue
    if [[ -z "${!key+x}" ]]; then
      export "$key=$value"
    fi
  done < "$dotenv_file"
}
