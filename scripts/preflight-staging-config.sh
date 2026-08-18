#!/usr/bin/env bash
set -euo pipefail

config=${1:-cloudflare/wrangler.staging.toml}

if [[ ! -f "$config" ]]; then
  printf 'staging config preflight failed: config not found: %s\n' "$config" >&2
  exit 1
fi

failed=0

if grep -Eq '^[[:space:]]*database_id[[:space:]]*=[[:space:]]*"[[:space:]]*"' "$config"; then
  printf 'staging config preflight failed: empty D1 database_id\n' >&2
  failed=1
fi

if awk '
  /^\[\[kv_namespaces\]\]/ { in_kv = 1; next }
  /^\[\[/ { in_kv = 0 }
  in_kv && /^[[:space:]]*id[[:space:]]*=[[:space:]]*"[[:space:]]*"/ { found = 1 }
  END { exit(found ? 0 : 1) }
' "$config"; then
  printf 'staging config preflight failed: empty KV namespace id\n' >&2
  failed=1
fi

if awk '
  {
    line = $0
    sub(/[[:space:]]*#.*/, "", line)
    if (line ~ /class_name[[:space:]]*=[[:space:]]*"ConnectionManager"/ ||
        line ~ /new(_sqlite)?_classes[[:space:]]*=.*"ConnectionManager"/) found = 1
  }
  END { exit(found ? 0 : 1) }
' "$config"; then
  printf 'staging config preflight failed: stale ConnectionManager binding or creation migration\n' >&2
  failed=1
fi

if (( failed != 0 )); then
  exit 1
fi

printf 'staging config preflight passed: binding IDs are non-empty and no stale ConnectionManager class is configured\n'
