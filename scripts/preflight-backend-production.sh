#!/usr/bin/env bash
set -euo pipefail

key=${HOME}/.ssh/kamizo_vps
host=kamizo@95.46.96.209
snapshot=

while (( $# > 0 )); do
  case "$1" in
    --key) key=${2:?missing value for --key}; shift 2 ;;
    --host) host=${2:?missing value for --host}; shift 2 ;;
    --snapshot) snapshot=${2:?missing value for --snapshot}; shift 2 ;;
    *) printf 'backend production preflight failed: unknown argument: %s\n' "$1" >&2; exit 1 ;;
  esac
done

work_dir=$(mktemp -d)
trap 'rm -r -- "$work_dir"' EXIT

if [[ -z "$snapshot" ]]; then
  [[ -f "$key" ]] || {
    printf 'backend production preflight failed: SSH key not found: %s\n' "$key" >&2
    exit 1
  }
  snapshot="$work_dir/remote.snapshot"
  ssh -i "$key" "$host" '
    set -e
    printf "%s\n" "===NGINX==="
    sudo -n nginx -T 2>&1
    printf "%s\n" "===LISTENERS==="
    ss -ltnH "sport = :3000"
  ' >"$snapshot"
fi

[[ -f "$snapshot" ]] || {
  printf 'backend production preflight failed: snapshot not found: %s\n' "$snapshot" >&2
  exit 1
}

awk '
  /^===NGINX===$/ { section = "nginx"; next }
  /^===LISTENERS===$/ { section = "listeners"; next }
  section == "nginx" { print }
' "$snapshot" >"$work_dir/nginx"

awk '
  {
    line = $0
    clean = line
    sub(/[[:space:]]*#.*/, "", clean)
    if (!capturing && clean ~ /^[[:space:]]*server[[:space:]]*\{/) {
      capturing = 1
      depth = 0
      block = ""
      has_api_name = 0
      has_api_upstream = 0
    }
    if (!capturing) next
    block = block line "\n"
    if (clean ~ /^[[:space:]]*server_name[[:space:]]+[^;]*api\.kamizo\.uz([[:space:];]|$)/) {
      has_api_name = 1
    }
    if (clean ~ /^[[:space:]]*proxy_pass[[:space:]]+http:\/\/127\.0\.0\.1:3000[[:space:]]*;/) {
      has_api_upstream = 1
    }
    open_copy = clean
    close_copy = clean
    depth += gsub(/\{/, "", open_copy) - gsub(/\}/, "", close_copy)
    if (depth == 0) {
      if (has_api_name && has_api_upstream) {
        print "===API_BLOCK==="
        printf "%s", block
      }
      capturing = 0
    }
  }
' "$work_dir/nginx" >"$work_dir/api-block"

api_block_count=$(grep -c '^===API_BLOCK===$' "$work_dir/api-block" || true)
if [[ "$api_block_count" != 1 ]]; then
  printf 'backend production preflight failed: expected one api.kamizo.uz backend proxy block, found %s\n' \
    "$api_block_count" >&2
  exit 1
fi

if ! grep -Eq '^[[:space:]]*proxy_set_header[[:space:]]+X-Real-IP[[:space:]]+\$remote_addr[[:space:]]*;' \
  "$work_dir/api-block"; then
  printf 'backend production preflight failed: api.kamizo.uz must overwrite X-Real-IP with $remote_addr\n' >&2
  exit 1
fi

if ! grep -Eq '^[[:space:]]*proxy_set_header[[:space:]]+X-Forwarded-For[[:space:]]+\$proxy_add_x_forwarded_for[[:space:]]*;' \
  "$work_dir/api-block"; then
  printf 'backend production preflight failed: api.kamizo.uz must append X-Forwarded-For\n' >&2
  exit 1
fi

awk '
  /^===LISTENERS===$/ { section = "listeners"; next }
  section == "listeners" && $1 == "LISTEN" { print $4 }
' "$snapshot" >"$work_dir/listeners"

if [[ ! -s "$work_dir/listeners" ]]; then
  printf 'backend production preflight failed: no TCP listener found on port 3000\n' >&2
  exit 1
fi

while IFS= read -r address; do
  case "$address" in
    127.*:3000|'[::1]':3000|::1:3000) ;;
    *)
      printf 'backend production preflight failed: app listener is not loopback-bound: %s\n' \
        "$address" >&2
      exit 1
      ;;
  esac
done <"$work_dir/listeners"

printf 'backend production preflight passed: nginx owns client IP and port 3000 is loopback-only\n'
