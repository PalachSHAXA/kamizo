#!/usr/bin/env bash

set -Eeuo pipefail

name=$(basename -- "$0")
state=${KAMIZO_TEST_STATE_DIR:?}
log="$state/commands.log"
lock_marker="${KAMIZO_LOCK_FILE:?}.testlock"
printf '%s %s\n' "$name" "$*" >>"$log"

require_apply_lock() {
  [[ -d "$lock_marker" ]] || {
    printf '%s ran without restore lock\n' "$name" >&2
    exit 91
  }
}

case "$name" in
  systemctl)
    command=${1:-}
    shift || true
    if [[ ${1:-} == '--quiet' ]]; then
      shift
    fi
    unit=${1:-}
    case "$command" in
      is-active)
        [[ -f "$state/active.$unit" ]]
        ;;
      is-enabled)
        [[ -f "$state/enabled.$unit" ]]
        ;;
      stop)
        if [[ ${KAMIZO_TEST_STOP_FAIL_UNIT:-} == "$unit" ]]; then
          exit 108
        fi
        if [[ "$unit" == 'kamizo-api.service' ]]; then
          require_apply_lock
          [[ -e "$KAMIZO_SOURCE_DB" ]] || exit 92
        fi
        rm -f -- "$state/active.$unit"
        ;;
      start)
        if [[ "$unit" == kamizo-backup-*.timer ]]; then
          [[ ! -d "$lock_marker" ]] || exit 109
          printf 'timer-start lock=released %s\n' "$unit" >>"$log"
        fi
        if [[ "$unit" == 'kamizo-api.service' ]]; then
          require_apply_lock
          [[ -e "$KAMIZO_SOURCE_DB" ]] || exit 93
        fi
        : >"$state/active.$unit"
        ;;
      *)
        printf 'unsupported systemctl command: %s\n' "$command" >&2
        exit 94
        ;;
    esac
    ;;
  runuser)
    [[ ${1:-} == '-u' && ${2:-} == 'kamizo' && ${3:-} == '--' ]] || exit 95
    [[ ! -d "$lock_marker" ]] || exit 96
    [[ ! -f "$state/active.kamizo-backup-hourly.timer" ]] || exit 97
    [[ ! -f "$state/active.kamizo-backup-daily.timer" ]] || exit 98
    [[ ! -f "$state/active.kamizo-backup-hourly.service" ]] || exit 104
    [[ ! -f "$state/active.kamizo-backup-daily.service" ]] || exit 105
    shift 3
    "$@"
    result=$?
    : >"$state/emergency-complete"
    exit "$result"
    ;;
  sqlite3)
    if [[ "$*" == *'wal_checkpoint(TRUNCATE)'* ]]; then
      require_apply_lock
      [[ ! -f "$state/active.kamizo-api.service" ]] || exit 99
      [[ -e "$KAMIZO_SOURCE_DB" ]] || exit 100
    fi
    if [[ -f "$state/emergency-complete" && "$*" == *"$KAMIZO_SOURCE_DB"* ]]; then
      require_apply_lock
    fi
    if [[ ${KAMIZO_TEST_ROLLBACK_FAULT:-} == 'verify' && -f "$state/rollback-moved" && "$*" == *"$KAMIZO_SOURCE_DB"* ]]; then
      exit 110
    fi
    exec "${KAMIZO_REAL_SQLITE3:?}" "$@"
    ;;
  curl)
    require_apply_lock
    [[ -f "$state/active.kamizo-api.service" ]] || exit 101
    [[ -e "$KAMIZO_SOURCE_DB" ]] || exit 102
    value=$("${KAMIZO_REAL_SQLITE3:?}" "$KAMIZO_SOURCE_DB" 'SELECT value FROM restore_state;')
    printf 'health-value %s\n' "$value" >>"$log"
    if [[ ${KAMIZO_TEST_HEALTH_MODE:-success} == 'fail-candidate' && "$value" == 'candidate' ]]; then
      exit 22
    fi
    ;;
  mv)
    source_argument=''
    destination=''
    for argument in "$@"; do
      if [[ "$argument" != -* && -z "$source_argument" ]]; then
        source_argument=$argument
      fi
      destination=$argument
    done
    if [[ "$destination" == "$KAMIZO_SOURCE_DB" ]]; then
      require_apply_lock
      [[ -e "$KAMIZO_SOURCE_DB" ]] || exit 106
      if [[ "$source_argument" == *'.kamizo-rollback.'* && ${KAMIZO_TEST_ROLLBACK_FAULT:-} == 'mv' ]]; then
        exit 111
      fi
      "${KAMIZO_REAL_MV:?}" "$@"
      [[ -e "$KAMIZO_SOURCE_DB" ]] || exit 107
      if [[ "$source_argument" == *'.kamizo-rollback.'* ]]; then
        : >"$state/rollback-moved"
      fi
      printf 'source-continuity before=1 after=1\n' >>"$log"
      exit 0
    fi
    exec "${KAMIZO_REAL_MV:?}" "$@"
    ;;
  cp)
    if [[ ${KAMIZO_TEST_ROLLBACK_FAULT:-} == 'copy' && "$*" == *'.kamizo-rollback.'* ]]; then
      exit 112
    fi
    exec "${KAMIZO_REAL_CP:?}" "$@"
    ;;
  *)
    printf 'unsupported apply stub command: %s\n' "$name" >&2
    exit 103
    ;;
esac
