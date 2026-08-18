#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || -z "$1" ]]; then
  printf 'Usage: %s BASE_URL\n' "$0" >&2
  exit 2
fi

base_url=${1%/}
work_dir=$(mktemp -d)
trap 'rm -r -- "$work_dir"' EXIT

fetch() {
  local url=$1
  local headers=$2
  local body=$3
  local status

  status=$(curl --silent --show-error --location \
    --dump-header "$headers" \
    --output "$body" \
    --write-out '%{http_code}' \
    "$url")
  if [[ "$status" != '200' ]]; then
    printf 'verification failed: %s returned HTTP %s\n' "$url" "$status" >&2
    return 1
  fi
}

fetch "$base_url/" "$work_dir/index.headers" "$work_dir/index.html"

entry_path=$(perl -0ne '
  while (/<script\b[^>]*\bsrc\s*=\s*(["'"'"'])(\/assets\/[^"'"'"']+\.js(?:\?[^"'"'"']*)?)\1[^>]*>/ig) {
    print "$2\n";
  }
' "$work_dir/index.html" | awk 'NR == 1 { print; exit }')

if [[ -z "$entry_path" ]]; then
  printf 'verification failed: no /assets/*.js script entry found in %s/\n' "$base_url" >&2
  exit 1
fi

origin=$(printf '%s\n' "$base_url" | perl -ne 'if (m{^(https?://[^/]+)}i) { print $1 }')
if [[ -z "$origin" ]]; then
  printf 'verification failed: BASE_URL must be an absolute HTTP(S) URL\n' >&2
  exit 2
fi

bundle_url="${origin}${entry_path}"
fetch "$bundle_url" "$work_dir/bundle.headers" "$work_dir/bundle.js"

content_type=$(awk '
  {
    line = $0
    if (tolower(line) !~ /^content-type:/) next
    sub(/^[^:]*:[[:space:]]*/, "", line)
    sub(/\r$/, "", line)
    value = tolower(line)
  }
  END { print value }
' "$work_dir/bundle.headers")

case "$content_type" in
  application/javascript*|text/javascript*|application/x-javascript*) ;;
  *)
    printf 'verification failed: %s has non-JavaScript Content-Type %s\n' \
      "$bundle_url" "${content_type:-<missing>}" >&2
    exit 1
    ;;
esac

bundle_size=$(wc -c < "$work_dir/bundle.js" | tr -d '[:space:]')
if (( bundle_size <= 102400 )); then
  printf 'verification failed: %s is %s bytes (must be > 102400)\n' \
    "$bundle_url" "$bundle_size" >&2
  exit 1
fi

printf 'verified frontend bundle: %s (%s, %s bytes)\n' \
  "$bundle_url" "$content_type" "$bundle_size"
