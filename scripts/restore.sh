#!/usr/bin/env bash

set -Eeuo pipefail
umask 077
export LC_ALL=C

die() {
  printf 'kamizo-restore: %s\n' "$*" >&2
  exit 1
}

log_error() {
  printf 'kamizo-restore: ERROR: %s\n' "$*" >&2
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

file_bytes() {
  if stat -c '%s' -- "$1" >/dev/null 2>&1; then
    stat -c '%s' -- "$1"
  else
    stat -f '%z' -- "$1"
  fi
}

sha256_file() {
  local output
  if command -v sha256sum >/dev/null 2>&1; then
    output=$(sha256sum -- "$1")
  elif command -v shasum >/dev/null 2>&1; then
    output=$(shasum -a 256 -- "$1")
  else
    die 'required command not found: sha256sum or shasum'
  fi
  printf '%s\n' "${output%% *}"
}

has_control_chars() {
  [[ "$1" =~ [[:cntrl:]] ]]
}

canonical_path() {
  local path=$1 parent name
  if command -v realpath >/dev/null 2>&1; then
    realpath "$path"
  elif [[ -d "$path" ]]; then
    (CDPATH= cd -- "$path" && pwd -P)
  else
    parent=$(dirname -- "$path")
    name=$(basename -- "$path")
    parent=$(CDPATH= cd -- "$parent" && pwd -P)
    printf '%s/%s\n' "$parent" "$name"
  fi
}

sync_file() {
  if ! sync -f "$1" 2>/dev/null; then
    sync
  fi
}

available_bytes() {
  local path=$1 blocks
  if [[ "$TEST_MODE" == '1' && -n ${KAMIZO_DISK_AVAILABLE_BYTES:-} ]]; then
    printf '%s\n' "$KAMIZO_DISK_AVAILABLE_BYTES"
    return
  fi
  blocks=$(df -Pk "$path" | awk 'NR == 2 { print $4 }')
  [[ "$blocks" =~ ^[0-9]+$ ]] || die "could not determine available disk space: $path"
  printf '%s\n' "$((blocks * 1024))"
}

require_disk() {
  local path=$1 required=$2 available
  available=$(available_bytes "$path")
  (( available >= required )) || die "insufficient restore disk at $path: need $required bytes, have $available"
}

manifest_value() {
  local manifest=$1 key=$2
  sqlite3 :memory: "SELECT json_extract(CAST(readfile('$manifest') AS TEXT), '$.$key');" 2>/dev/null
}

verify_database() {
  local database=$1 integrity fk
  [[ -s "$database" ]] || return 1
  integrity=$(sqlite3 "$database" 'PRAGMA integrity_check;') || return 1
  [[ "$integrity" == 'ok' ]] || return 1
  fk=$(sqlite3 "$database" 'PRAGMA foreign_key_check;') || return 1
  [[ -z "$fk" ]]
}

TEST_MODE=${KAMIZO_TEST_MODE:-0}
MAX_RESTORE_BYTES=2147483648
RESTORE_RESERVE_BYTES=536870912
if [[ "$TEST_MODE" == '1' ]]; then
  MAX_RESTORE_BYTES=${KAMIZO_MAX_RESTORE_BYTES:-$MAX_RESTORE_BYTES}
  RESTORE_RESERVE_BYTES=${KAMIZO_RESTORE_RESERVE_BYTES:-$RESTORE_RESERVE_BYTES}
fi
[[ "$MAX_RESTORE_BYTES" =~ ^[1-9][0-9]*$ ]] || die 'maximum restore size must be a positive integer'
[[ "$RESTORE_RESERVE_BYTES" =~ ^[0-9]+$ ]] || die 'restore reserve must be a nonnegative integer'

for command in sqlite3 mktemp dirname basename cp rm rmdir stat sync df awk chmod mv dd; do
  require_command "$command"
done
[[ "${TMPDIR:-/tmp}" == /* ]] || die 'temporary path must be absolute'
has_control_chars "${TMPDIR:-/tmp}" && die 'temporary path contains control characters'

INPUT_STAGE_DIR=''
STAGED_ARTIFACT=''
STAGED_CHECKSUM=''
STAGED_MANIFEST=''
RESTORED_DB=''
DECOMPRESSED_INPUT=''
INPUT_BASENAME=''
INPUT_FORMAT=''
CANDIDATE_STAGE=''
OLD_TEMP=''
OLD_DB=''
FAILED_DB=''
SOURCE_DB=''
DATA_DIR=''
LOCK_FILE='/run/lock/kamizo-backup.lock'
TEST_LOCK_DIR=''
LOCK_HELD=0
SWAPPED=0
API_STOPPED=0
BACKUP_UNITS_CAPTURED=0
STOPPED_ACTIVE_TIMERS=''
ENABLED_BACKUP_UNITS=''
SYSTEMCTL_COMMAND='systemctl'
RUNUSER_COMMAND='runuser'
CURL_COMMAND='curl'
FLOCK_COMMAND='flock'
TEST_ADAPTER_DIR=''
TEST_CANON_ROOT=''
CANON_BACKUP=''
TEST_SOURCE_DB=''
TEST_DATA_DIR=''
TEST_BACKUP_ROOT=''
TEST_WORKER=''
TEST_LOCK_FILE=''
HEALTH_RETRIES=10
HEALTH_RETRY_DELAY=3

remove_input_stage() {
  local failed=0
  if [[ -n "$INPUT_STAGE_DIR" ]]; then
    for file in "$RESTORED_DB" "$RESTORED_DB-wal" "$RESTORED_DB-shm" "$DECOMPRESSED_INPUT" "$STAGED_ARTIFACT" "$STAGED_CHECKSUM" "$STAGED_MANIFEST"; do
      [[ -n "$file" && -e "$file" ]] || continue
      if ! rm -f -- "$file"; then
        log_error "could not remove staged file: $file"
        failed=1
      fi
    done
    if [[ -d "$INPUT_STAGE_DIR" ]] && ! rmdir -- "$INPUT_STAGE_DIR"; then
      log_error "could not remove staging directory: $INPUT_STAGE_DIR"
      failed=1
    fi
  fi
  return "$failed"
}

restore_backup_units() {
  local failed=0 unit
  [[ "$BACKUP_UNITS_CAPTURED" == '1' ]] || return 0
  for unit in $STOPPED_ACTIVE_TIMERS; do
    if ! "$SYSTEMCTL_COMMAND" start "$unit"; then
      log_error "could not restore previously active unit: $unit"
      failed=1
    fi
  done
  return "$failed"
}

health_check() {
  local attempt=1
  while (( attempt <= HEALTH_RETRIES )); do
    if "$SYSTEMCTL_COMMAND" is-active --quiet kamizo-api.service \
      && "$CURL_COMMAND" --fail --silent --show-error --max-time 5 "$HEALTH_URL" >/dev/null; then
      return 0
    fi
    if (( attempt < HEALTH_RETRIES )) && (( HEALTH_RETRY_DELAY > 0 )); then
      sleep "$HEALTH_RETRY_DELAY"
    fi
    attempt=$((attempt + 1))
  done
  return 1
}

set_database_permissions() {
  local database=$1
  if [[ "$TEST_MODE" != '1' ]]; then
    chown kamizo:kamizo "$database" || return 1
  fi
  chmod 600 "$database"
}

require_under_test_root() {
  local path=$1 label=$2
  case "$path" in
    "$TEST_CANON_ROOT"/*) ;;
    *) die "$label escapes canonical KAMIZO_TEST_ROOT: $path" ;;
  esac
}

configure_test_apply() {
  local backup=$1 command resolved
  local test_root=${KAMIZO_TEST_ROOT:-}
  local adapter=${KAMIZO_TEST_ADAPTER_DIR:-}
  [[ ${KAMIZO_TEST_ALLOW_APPLY:-0} == '1' ]] || die '--apply is disabled in test mode without explicit test harness opt-in'
  [[ "$test_root" == /* && "$test_root" != '/' && -d "$test_root" ]] || die 'KAMIZO_TEST_ROOT must be an existing absolute non-root directory'
  [[ -n ${KAMIZO_SOURCE_DB:-} && -n ${KAMIZO_DATA_DIR:-} && -n ${KAMIZO_BACKUP_ROOT:-} \
    && -n ${KAMIZO_BACKUP_WORKER:-} && -n ${KAMIZO_LOCK_FILE:-} && -n "$adapter" ]] \
    || die 'test apply requires explicit DB/data/backup/worker/lock/adapter paths'
  for path in "$test_root" "$backup" "$KAMIZO_SOURCE_DB" "$KAMIZO_DATA_DIR" "$KAMIZO_BACKUP_ROOT" \
    "$KAMIZO_BACKUP_WORKER" "$KAMIZO_LOCK_FILE" "$adapter" "${TMPDIR:-/tmp}"; do
    has_control_chars "$path" && die 'test apply path contains control characters'
  done
  [[ -f "$KAMIZO_LOCK_FILE" && ! -L "$KAMIZO_LOCK_FILE" ]] || die 'test lock must be a precreated regular non-symlink file'

  TEST_CANON_ROOT=$(canonical_path "$test_root") || die 'could not canonicalize test root'
  CANON_BACKUP=$(canonical_path "$backup") || die 'could not canonicalize test backup'
  TEST_SOURCE_DB=$(canonical_path "$KAMIZO_SOURCE_DB") || die 'could not canonicalize test source DB'
  TEST_DATA_DIR=$(canonical_path "$KAMIZO_DATA_DIR") || die 'could not canonicalize test data directory'
  TEST_BACKUP_ROOT=$(canonical_path "$KAMIZO_BACKUP_ROOT") || die 'could not canonicalize test backup root'
  TEST_WORKER=$(canonical_path "$KAMIZO_BACKUP_WORKER") || die 'could not canonicalize test worker'
  TEST_LOCK_FILE=$(canonical_path "$KAMIZO_LOCK_FILE") || die 'could not canonicalize test lock'
  TEST_ADAPTER_DIR=$(canonical_path "$adapter") || die 'could not canonicalize test adapter directory'
  TMPDIR=$(canonical_path "${TMPDIR:-/tmp}") || die 'could not canonicalize test temporary directory'
  export TMPDIR

  for entry in \
    "$CANON_BACKUP:test backup" "$TEST_SOURCE_DB:test source DB" "$TEST_DATA_DIR:test data directory" \
    "$TEST_BACKUP_ROOT:test backup root" "$TEST_WORKER:test worker" "$TEST_LOCK_FILE:test lock" \
    "$TEST_ADAPTER_DIR:test adapter directory" "$TMPDIR:test temporary directory"; do
    require_under_test_root "${entry%%:*}" "${entry#*:}"
  done
  [[ "$TEST_SOURCE_DB" != '/opt/kamizo/data/kamizo.db' \
    && "$TEST_DATA_DIR" != '/opt/kamizo/data' \
    && "$TEST_BACKUP_ROOT" != '/opt/kamizo/backups/sqlite' \
    && "$TEST_LOCK_FILE" != '/run/lock/kamizo-backup.lock' ]] || die 'test mode can never use production paths'

  for command in systemctl runuser curl flock; do
    [[ -x "$TEST_ADAPTER_DIR/$command" && ! -L "$TEST_ADAPTER_DIR/$command" ]] || die "missing regular test adapter: $command"
    resolved=$(canonical_path "$TEST_ADAPTER_DIR/$command") || die "could not canonicalize test adapter: $command"
    case "$resolved" in
      "$TEST_ADAPTER_DIR"/*) ;;
      *) die "test adapter escapes adapter directory: $resolved" ;;
    esac
  done
  SYSTEMCTL_COMMAND="$TEST_ADAPTER_DIR/systemctl"
  RUNUSER_COMMAND="$TEST_ADAPTER_DIR/runuser"
  CURL_COMMAND="$TEST_ADAPTER_DIR/curl"
  FLOCK_COMMAND="$TEST_ADAPTER_DIR/flock"
  PATH="$TEST_ADAPTER_DIR:$PATH"
  export PATH
}

release_restore_lock() {
  [[ "$LOCK_HELD" == '1' ]] || return 0
  if [[ "$TEST_MODE" == '1' ]]; then
    if ! rmdir -- "$TEST_LOCK_DIR"; then
      log_error 'could not release test restore lock'
      return 1
    fi
  else
    if ! "$FLOCK_COMMAND" -u 9; then
      log_error 'could not unlock production restore lock'
      return 1
    fi
    exec 9>&-
  fi
  LOCK_HELD=0
}

cleanup() {
  local original_status=$?
  trap - EXIT
  set +e
  local cleanup_failed=0 rollback_temp='' rollback_safe=1 rollback_complete=0 lock_released=1

  if [[ "$original_status" != '0' && "$SWAPPED" == '1' ]]; then
    if ! "$SYSTEMCTL_COMMAND" stop kamizo-api.service; then
      log_error 'rollback could not stop kamizo-api'
      cleanup_failed=1
      rollback_safe=0
    else
      API_STOPPED=1
    fi

    if [[ -s "$SOURCE_DB" && -n "$FAILED_DB" ]]; then
      if cp -- "$SOURCE_DB" "$FAILED_DB"; then
        sync_file "$FAILED_DB"
      else
        log_error "could not preserve failed candidate: $FAILED_DB"
        cleanup_failed=1
      fi
    fi

    if [[ "$rollback_safe" == '1' ]]; then
      if ! rm -f -- "$SOURCE_DB-wal" "$SOURCE_DB-shm"; then
        log_error 'could not remove failed-candidate WAL/SHM before rollback'
        cleanup_failed=1
        rollback_safe=0
      fi
    fi

    if [[ "$rollback_safe" != '1' ]]; then
      log_error "rollback replacement skipped because API stop was not confirmed; old database remains at: $OLD_DB"
    else
      rollback_temp=$(mktemp "$DATA_DIR/.kamizo-rollback.XXXXXX")
    fi
    if [[ "$rollback_safe" != '1' ]]; then
      :
    elif [[ -z "$rollback_temp" ]]; then
      log_error 'could not create rollback staging file'
      cleanup_failed=1
    elif ! cp -- "$OLD_DB" "$rollback_temp"; then
      log_error 'could not copy preserved database for rollback'
      cleanup_failed=1
    elif ! set_database_permissions "$rollback_temp"; then
      log_error 'could not set rollback database ownership/mode'
      cleanup_failed=1
    elif ! sync_file "$rollback_temp"; then
      log_error 'could not fsync rollback staging database'
      cleanup_failed=1
    elif ! mv -f -- "$rollback_temp" "$SOURCE_DB"; then
      log_error 'could not atomically restore original database'
      cleanup_failed=1
    else
      rollback_temp=''
      if ! sync_file "$DATA_DIR"; then
        log_error 'could not fsync data directory after rollback rename'
        cleanup_failed=1
      elif ! verify_database "$SOURCE_DB"; then
        log_error 'rolled-back database failed integrity or foreign-key verification'
        cleanup_failed=1
      else
        rollback_complete=1
      fi
    fi

    if [[ "$rollback_complete" != '1' ]]; then
      log_error "rollback is incomplete; kamizo-api remains stopped; old database preserved at: $OLD_DB"
      cleanup_failed=1
    elif ! "$SYSTEMCTL_COMMAND" start kamizo-api.service; then
      log_error 'could not restart kamizo-api after rollback'
      cleanup_failed=1
    else
      API_STOPPED=0
      if ! health_check; then
        log_error 'kamizo-api health did not recover after rollback'
        cleanup_failed=1
      fi
    fi
  elif [[ "$original_status" != '0' && "$API_STOPPED" == '1' ]]; then
    if ! "$SYSTEMCTL_COMMAND" start kamizo-api.service; then
      log_error 'could not restart kamizo-api after pre-swap failure'
      cleanup_failed=1
    else
      API_STOPPED=0
      if ! health_check; then
        log_error 'kamizo-api health did not recover after pre-swap failure'
        cleanup_failed=1
      fi
    fi
  fi

  if ! release_restore_lock; then
    cleanup_failed=1
    lock_released=0
  fi
  if [[ "$lock_released" == '1' ]] && ! restore_backup_units; then
    cleanup_failed=1
  fi

  for file in "$CANDIDATE_STAGE" "$OLD_TEMP" "$rollback_temp"; do
    [[ -n "$file" && -e "$file" ]] || continue
    if ! rm -f -- "$file"; then
      log_error "could not remove apply staging file: $file"
      cleanup_failed=1
    fi
  done
  if ! remove_input_stage; then
    cleanup_failed=1
  fi
  if [[ "$cleanup_failed" == '1' ]]; then
    if [[ "$SWAPPED" == '1' || "$API_STOPPED" == '1' ]]; then
      log_error "CATASTROPHIC ROLLBACK FAILURE; preserved old database remains at: ${OLD_DB:-not-created}"
    else
      log_error 'restore staging cleanup failed'
    fi
    exit 2
  fi
  exit "$original_status"
}
trap cleanup EXIT

bounded_gunzip() {
  local input=$1 output=$2 blocks actual
  blocks=$((MAX_RESTORE_BYTES / 1048576 + 1))
  if ! gzip -dc -- "$input" | dd of="$output" bs=1048576 count="$blocks" 2>/dev/null; then
    die 'bounded gzip extraction failed or exceeded the configured limit'
  fi
  actual=$(file_bytes "$output")
  (( actual <= MAX_RESTORE_BYTES )) || die "extracted data exceeds limit: $actual > $MAX_RESTORE_BYTES"
}

stage_and_verify_input() {
  local backup=$1 allow_legacy=$2 artifact_bytes required expected_hash actual_hash
  local manifest_filename manifest_bytes manifest_hash uncompressed_bytes
  [[ -f "$backup" && -s "$backup" ]] || die "backup is missing or empty: $backup"
  has_control_chars "$backup" && die 'backup path contains control characters'
  INPUT_BASENAME=$(basename -- "$backup")
  [[ "$INPUT_BASENAME" != *"'"* ]] || die 'backup filename contains an unsupported quote'
  case "$INPUT_BASENAME" in
    *.sql.gz)
      INPUT_FORMAT='legacy'
      [[ "$allow_legacy" == '1' ]] || die 'legacy .sql.gz drill requires --allow-legacy-unsigned'
      ;;
    *.db.gz)
      INPUT_FORMAT='db.gz'
      ;;
    *.db)
      INPUT_FORMAT='db'
      ;;
    *)
      die 'unsupported backup format; expected .db, .db.gz, or .sql.gz'
      ;;
  esac

  if [[ "$INPUT_FORMAT" != 'legacy' ]]; then
    [[ -s "$backup.sha256" ]] || die 'new backup is missing required SHA-256 sidecar'
    [[ -s "$backup.json" ]] || die 'new backup is missing required manifest commit marker'
  fi

  artifact_bytes=$(file_bytes "$backup")
  required=$((artifact_bytes + RESTORE_RESERVE_BYTES))
  require_disk "${TMPDIR:-/tmp}" "$required"
  INPUT_STAGE_DIR=$(mktemp -d "${TMPDIR:-/tmp}/kamizo-restore.XXXXXX")
  chmod 700 "$INPUT_STAGE_DIR"
  STAGED_ARTIFACT="$INPUT_STAGE_DIR/$INPUT_BASENAME"
  cp -- "$backup" "$STAGED_ARTIFACT"
  if [[ "$INPUT_FORMAT" != 'legacy' ]]; then
    STAGED_CHECKSUM="$STAGED_ARTIFACT.sha256"
    STAGED_MANIFEST="$STAGED_ARTIFACT.json"
    cp -- "$backup.sha256" "$STAGED_CHECKSUM"
    cp -- "$backup.json" "$STAGED_MANIFEST"
  fi

  if [[ "$TEST_MODE" == '1' && -n ${KAMIZO_TEST_AFTER_STAGE_HOOK:-} ]]; then
    "$KAMIZO_TEST_AFTER_STAGE_HOOK" "$backup"
  fi

  if [[ "$INPUT_FORMAT" != 'legacy' ]]; then
    read -r expected_hash _ <"$STAGED_CHECKSUM" || die 'could not read staged checksum'
    [[ "$expected_hash" =~ ^[0-9a-f]{64}$ ]] || die 'invalid staged SHA-256 sidecar'
    actual_hash=$(sha256_file "$STAGED_ARTIFACT")
    [[ "$actual_hash" == "$expected_hash" ]] || die 'staged backup checksum mismatch'
    [[ "$(sqlite3 :memory: "SELECT json_valid(CAST(readfile('$STAGED_MANIFEST') AS TEXT));" 2>/dev/null)" == '1' ]] || die 'invalid staged manifest JSON'
    manifest_filename=$(manifest_value "$STAGED_MANIFEST" filename) || die 'manifest filename is missing'
    manifest_bytes=$(manifest_value "$STAGED_MANIFEST" bytes) || die 'manifest bytes is missing'
    manifest_hash=$(manifest_value "$STAGED_MANIFEST" sha256) || die 'manifest SHA-256 is missing'
    [[ "$manifest_filename" == "$INPUT_BASENAME" ]] || die 'manifest filename does not match backup'
    [[ "$manifest_bytes" == "$(file_bytes "$STAGED_ARTIFACT")" ]] || die 'manifest byte count does not match backup'
    [[ "$manifest_hash" == "$actual_hash" ]] || die 'manifest SHA-256 does not match backup'
  fi

  if [[ "$INPUT_FORMAT" == 'db' ]]; then
    uncompressed_bytes=$(file_bytes "$STAGED_ARTIFACT")
  else
    require_command gzip
    uncompressed_bytes=$(gzip -l -- "$STAGED_ARTIFACT" | awk 'NR == 2 { print $2 }')
  fi
  [[ "$uncompressed_bytes" =~ ^[0-9]+$ ]] || die 'could not determine uncompressed restore size'
  (( uncompressed_bytes > 0 && uncompressed_bytes <= MAX_RESTORE_BYTES )) || die "uncompressed restore exceeds limit: $uncompressed_bytes > $MAX_RESTORE_BYTES"
  require_disk "$INPUT_STAGE_DIR" "$((uncompressed_bytes + RESTORE_RESERVE_BYTES))"

  RESTORED_DB="$INPUT_STAGE_DIR/restored.db"
  case "$INPUT_FORMAT" in
    db)
      cp -- "$STAGED_ARTIFACT" "$RESTORED_DB"
      ;;
    db.gz)
      bounded_gunzip "$STAGED_ARTIFACT" "$RESTORED_DB"
      ;;
    legacy)
      local effective_euid=$EUID
      if [[ "$TEST_MODE" == '1' && -n ${KAMIZO_TEST_EUID:-} ]]; then
        effective_euid=$KAMIZO_TEST_EUID
      fi
      [[ "$effective_euid" != '0' ]] || die 'legacy unsigned drill must run as a non-root current user'
      DECOMPRESSED_INPUT="$INPUT_STAGE_DIR/legacy.sql"
      bounded_gunzip "$STAGED_ARTIFACT" "$DECOMPRESSED_INPUT"
      sqlite3 -safe -bail "$RESTORED_DB" <"$DECOMPRESSED_INPUT" || die 'safe legacy SQL import failed'
      ;;
  esac
  verify_database "$RESTORED_DB" || die 'restored database failed integrity or foreign-key verification'
}

stop_backup_units() {
  local unit active_timers=''
  STOPPED_ACTIVE_TIMERS=''
  ENABLED_BACKUP_UNITS=''
  BACKUP_UNITS_CAPTURED=1

  # Snapshot all relevant state before the first stop operation.
  for unit in kamizo-backup-hourly.timer kamizo-backup-daily.timer kamizo-backup-hourly.service kamizo-backup-daily.service; do
    if [[ "$unit" == *.timer ]] && "$SYSTEMCTL_COMMAND" is-active --quiet "$unit"; then
        active_timers="$active_timers $unit"
    fi
    if "$SYSTEMCTL_COMMAND" is-enabled --quiet "$unit"; then
      ENABLED_BACKUP_UNITS="$ENABLED_BACKUP_UNITS $unit"
    fi
  done

  for unit in kamizo-backup-hourly.timer kamizo-backup-daily.timer; do
    "$SYSTEMCTL_COMMAND" stop "$unit" || die "could not stop backup timer: $unit"
    if [[ " $active_timers " == *" $unit "* ]]; then
      STOPPED_ACTIVE_TIMERS="$STOPPED_ACTIVE_TIMERS $unit"
    fi
  done

  # Interrupted oneshot services are never restarted; the explicit emergency
  # backup below supersedes any interrupted scheduled run.
  for unit in kamizo-backup-hourly.service kamizo-backup-daily.service; do
    "$SYSTEMCTL_COMMAND" stop "$unit" || die "could not stop backup service: $unit"
  done
}

acquire_restore_lock() {
  if [[ "$TEST_MODE" == '1' ]]; then
    TEST_LOCK_DIR="$LOCK_FILE.testlock"
    mkdir -- "$TEST_LOCK_DIR" 2>/dev/null || die 'backup/restore lock is already held'
    LOCK_HELD=1
  else
    [[ -f "$LOCK_FILE" && ! -L "$LOCK_FILE" ]] || die 'production lock must be a precreated regular non-symlink file'
    local metadata inode_before inode_open
    metadata=$(stat -c '%U:%G %a' -- "$LOCK_FILE") || die 'could not inspect production lock metadata'
    [[ "$metadata" == 'root:kamizo 660' ]] || die "invalid production lock owner/mode: $metadata"
    inode_before=$(stat -c '%d:%i' -- "$LOCK_FILE") || die 'could not inspect production lock inode'
    exec 9>>"$LOCK_FILE"
    inode_open=$(stat -Lc '%d:%i' -- "/proc/$$/fd/9") || die 'could not inspect opened production lock inode'
    [[ "$inode_open" == "$inode_before" ]] || die 'production lock inode changed during open'
    "$FLOCK_COMMAND" -n 9 || die 'backup/restore lock is already held'
    LOCK_HELD=1
  fi
}

run_apply() {
  local backup=$1 effective_euid=$EUID source_bytes candidate_bytes required checkpoint
  local worker='/usr/local/bin/kamizo-sqlite-backup.sh'
  SOURCE_DB='/opt/kamizo/data/kamizo.db'
  DATA_DIR='/opt/kamizo/data'
  local backup_root='/opt/kamizo/backups/sqlite'
  LOCK_FILE='/run/lock/kamizo-backup.lock'
  HEALTH_URL='http://127.0.0.1:3000/api/health'
  local timestamp
  timestamp=$(date -u '+%Y%m%dT%H%M%SZ')

  [[ "$INPUT_FORMAT" != 'legacy' ]] || die 'legacy .sql.gz can never be used with --apply'
  if [[ "$TEST_MODE" == '1' ]]; then
    effective_euid=${KAMIZO_TEST_EUID:-$effective_euid}
  fi
  [[ "$effective_euid" == '0' ]] || die '--apply must run as root'

  if [[ "$TEST_MODE" == '1' ]]; then
    SOURCE_DB=$TEST_SOURCE_DB
    DATA_DIR=$TEST_DATA_DIR
    backup_root=$TEST_BACKUP_ROOT
    LOCK_FILE=$TEST_LOCK_FILE
    worker=$TEST_WORKER
    backup=$CANON_BACKUP
    timestamp=${KAMIZO_APPLY_TIMESTAMP:-$timestamp}
    HEALTH_RETRIES=${KAMIZO_HEALTH_RETRIES:-$HEALTH_RETRIES}
    HEALTH_RETRY_DELAY=${KAMIZO_HEALTH_RETRY_DELAY:-$HEALTH_RETRY_DELAY}
    KAMIZO_SOURCE_DB=$SOURCE_DB
    KAMIZO_DATA_DIR=$DATA_DIR
    KAMIZO_BACKUP_ROOT=$backup_root
    KAMIZO_BACKUP_WORKER=$worker
    KAMIZO_LOCK_FILE=$LOCK_FILE
    export KAMIZO_SOURCE_DB KAMIZO_DATA_DIR KAMIZO_BACKUP_ROOT KAMIZO_BACKUP_WORKER KAMIZO_LOCK_FILE
  else
    for command in systemctl curl runuser flock sleep chown; do
      require_command "$command"
    done
    [[ -f "$LOCK_FILE" && ! -L "$LOCK_FILE" ]] || die 'production lock must be precreated before restore'
  fi

  [[ "$timestamp" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || die 'apply timestamp must match YYYYMMDDTHHMMSSZ'
  [[ "$HEALTH_RETRIES" =~ ^[1-9][0-9]*$ && "$HEALTH_RETRY_DELAY" =~ ^[0-9]+$ ]] || die 'invalid health retry configuration'
  [[ -s "$SOURCE_DB" && -d "$DATA_DIR" ]] || die 'live database or data directory is missing'
  [[ -x "$worker" ]] || die "backup worker is missing or not executable: $worker"
  require_command sleep
  require_command chown

  source_bytes=$(file_bytes "$SOURCE_DB")
  candidate_bytes=$(file_bytes "$RESTORED_DB")
  required=$((source_bytes + candidate_bytes + RESTORE_RESERVE_BYTES))
  require_disk "$DATA_DIR" "$required"
  CANDIDATE_STAGE=$(mktemp "$DATA_DIR/.kamizo-restore-new.XXXXXX")
  cp -- "$RESTORED_DB" "$CANDIDATE_STAGE"
  set_database_permissions "$CANDIDATE_STAGE" || die 'could not set candidate ownership/mode'
  sync_file "$CANDIDATE_STAGE"

  OLD_DB="$DATA_DIR/kamizo.db.pre-restore-$timestamp"
  FAILED_DB="$DATA_DIR/kamizo.db.failed-restore-$timestamp"
  [[ ! -e "$OLD_DB" && ! -e "$FAILED_DB" ]] || die 'restore recovery artifact already exists for this timestamp'

  stop_backup_units
  "$RUNUSER_COMMAND" -u kamizo -- "$worker" hourly || die 'emergency online backup failed before API stop'
  acquire_restore_lock

  "$SYSTEMCTL_COMMAND" stop kamizo-api.service || die 'could not stop kamizo-api'
  API_STOPPED=1
  checkpoint=$(sqlite3 "$SOURCE_DB" 'PRAGMA wal_checkpoint(TRUNCATE);') || die 'live WAL checkpoint failed'
  [[ "$checkpoint" == '0|0|0' ]] || die "live WAL checkpoint was incomplete: $checkpoint"
  verify_database "$SOURCE_DB" || die 'live database failed verification after checkpoint'

  OLD_TEMP=$(mktemp "$DATA_DIR/.kamizo-old.XXXXXX")
  cp -- "$SOURCE_DB" "$OLD_TEMP"
  set_database_permissions "$OLD_TEMP" || die 'could not set preservation copy ownership/mode'
  sync_file "$OLD_TEMP"
  mv -- "$OLD_TEMP" "$OLD_DB"
  OLD_TEMP=''
  sync_file "$DATA_DIR"

  rm -f -- "$SOURCE_DB-wal" "$SOURCE_DB-shm"
  mv -f -- "$CANDIDATE_STAGE" "$SOURCE_DB"
  CANDIDATE_STAGE=''
  SWAPPED=1
  sync_file "$DATA_DIR"
  [[ -s "$SOURCE_DB" ]] || die 'source path disappeared during atomic replacement'

  "$SYSTEMCTL_COMMAND" start kamizo-api.service || die 'could not start kamizo-api after restore'
  API_STOPPED=0
  verify_database "$SOURCE_DB" || die 'restored live database failed verification'
  health_check || die 'restored API failed bounded health checks'
  printf 'Restore applied successfully. Old database preserved at %s\n' "$OLD_DB"
}

case ${1:-} in
  --drill)
    if [[ $# -eq 2 ]]; then
      ALLOW_LEGACY=0
    elif [[ $# -eq 3 && ${3:-} == '--allow-legacy-unsigned' ]]; then
      ALLOW_LEGACY=1
    else
      die 'usage: restore.sh --drill BACKUP [--allow-legacy-unsigned]'
    fi
    stage_and_verify_input "$2" "$ALLOW_LEGACY"
    if [[ "$INPUT_FORMAT" != 'legacy' && "$ALLOW_LEGACY" == '1' ]]; then
      die '--allow-legacy-unsigned is valid only for legacy .sql.gz drills'
    fi
    printf 'Restore drill passed: %s\n' "$2"
    ;;
  --apply)
    [[ $# -eq 4 && ${3:-} == '--confirm' && ${4:-} == 'RESTORE' ]] || die 'usage: restore.sh --apply BACKUP --confirm RESTORE'
    case "$2" in
      *.sql.gz) die 'legacy .sql.gz can never be used with --apply' ;;
    esac
    if [[ "$TEST_MODE" == '1' ]]; then
      configure_test_apply "$2"
      stage_and_verify_input "$CANON_BACKUP" 0
      run_apply "$CANON_BACKUP"
    else
      stage_and_verify_input "$2" 0
      run_apply "$2"
    fi
    ;;
  *)
    die 'usage: restore.sh --drill BACKUP [--allow-legacy-unsigned] | --apply BACKUP --confirm RESTORE'
    ;;
esac
