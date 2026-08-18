#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
WORKER="$SCRIPT_DIR/../deploy/systemd/kamizo-sqlite-backup.sh"

[[ -x "$WORKER" ]] || {
  printf 'backup worker is missing or not executable: %s\n' "$WORKER" >&2
  exit 1
}

exec "$WORKER" "$@"
