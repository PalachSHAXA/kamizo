#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
verifier="$repo_root/scripts/verify-frontend-bundle.sh"
fixture_root=$(mktemp -d)
server_pid=''

cleanup() {
  if [[ -n "$server_pid" ]]; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
  rm -r -- "$fixture_root"
}
trap cleanup EXIT

mkdir -p "$fixture_root/valid/assets" "$fixture_root/html/assets/index-html.js" "$fixture_root/empty/assets"
printf '<!doctype html><script type="module" crossorigin src="/assets/index-valid.js"></script>\n' > "$fixture_root/valid/index.html"
printf '<!doctype html><script type="module" src="/assets/index-html.js"></script>\n' > "$fixture_root/html/index.html"
printf '<!doctype html><script type="module" src="/assets/index-empty.js"></script>\n' > "$fixture_root/empty/index.html"

# 102,401 bytes: one byte above the verifier's strict 100 KiB floor.
dd if=/dev/zero of="$fixture_root/valid/assets/index-valid.js" bs=102401 count=1 2>/dev/null
printf '<!doctype html><title>fallback</title>\n' > "$fixture_root/html/assets/index-html.js/index.html"
: > "$fixture_root/empty/assets/index-empty.js"

start_server() {
  local root=$1
  port=$(python3 - <<'PY'
import socket
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    print(sock.getsockname()[1])
PY
  )
  python3 -m http.server "$port" --bind 127.0.0.1 --directory "$root" >"$fixture_root/server.log" 2>&1 &
  server_pid=$!
  for _ in {1..50}; do
    if curl --silent --fail "http://127.0.0.1:$port/" >/dev/null; then
      return
    fi
    sleep 0.1
  done
  printf 'fixture server failed to start\n' >&2
  exit 1
}

stop_server() {
  kill "$server_pid" 2>/dev/null || true
  wait "$server_pid" 2>/dev/null || true
  server_pid=''
}

start_server "$fixture_root/valid"
"$verifier" "http://127.0.0.1:$port"
stop_server

start_server "$fixture_root/html"
if "$verifier" "http://127.0.0.1:$port"; then
  printf 'expected HTML bundle response to fail verification\n' >&2
  exit 1
fi
stop_server

start_server "$fixture_root/empty"
if "$verifier" "http://127.0.0.1:$port"; then
  printf 'expected empty bundle response to fail verification\n' >&2
  exit 1
fi
stop_server

printf 'verify-frontend-bundle tests passed\n'
