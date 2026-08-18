#!/usr/bin/env bash

set -Eeuo pipefail
umask 077
export LC_ALL=C

die() {
  printf 'kamizo-sqlite-backup: %s\n' "$*" >&2
  exit 1
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
  if [[ "$SHA_COMMAND" == 'sha256sum' ]]; then
    output=$(sha256sum -- "$1")
  else
    output=$(shasum -a 256 -- "$1")
  fi
  printf '%s\n' "${output%% *}"
}

json_escape() {
  local value=$1
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  printf '%s' "$value"
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

manifest_value() {
  local manifest=$1 key=$2
  sqlite3 :memory: "SELECT json_extract(CAST(readfile('$manifest') AS TEXT), '$.$key');" 2>/dev/null
}

is_committed_generation() {
  local manifest=$1 artifact sidecar filename bytes manifest_hash sidecar_hash
  artifact=${manifest%.json}
  sidecar="$artifact.sha256"
  [[ -s "$artifact" && -s "$sidecar" && -s "$manifest" ]] || return 1
  [[ "$(sqlite3 :memory: "SELECT json_valid(CAST(readfile('$manifest') AS TEXT));" 2>/dev/null)" == '1' ]] || return 1
  filename=$(manifest_value "$manifest" filename) || return 1
  bytes=$(manifest_value "$manifest" bytes) || return 1
  manifest_hash=$(manifest_value "$manifest" sha256) || return 1
  read -r sidecar_hash _ <"$sidecar" || return 1
  [[ "$filename" == "$(basename -- "$artifact")" ]] || return 1
  [[ "$bytes" == "$(file_bytes "$artifact")" ]] || return 1
  [[ "$manifest_hash" =~ ^[0-9a-f]{64}$ && "$sidecar_hash" == "$manifest_hash" ]] || return 1
}

MODE=${1:-}
[[ "$MODE" == 'hourly' || "$MODE" == 'daily' ]] || die 'usage: kamizo-sqlite-backup.sh hourly|daily'
[[ $# -eq 1 ]] || die 'usage: kamizo-sqlite-backup.sh hourly|daily'

SOURCE_DB='/opt/kamizo/data/kamizo.db'
BACKUP_ROOT='/opt/kamizo/backups/sqlite'
LOCK_FILE='/run/lock/kamizo-backup.lock'
TIMESTAMP=$(date -u '+%Y%m%dT%H%M%SZ')
HOURLY_KEEP=168
DAILY_KEEP=35
BACKUP_RESERVE_BYTES=536870912
TEST_MODE=${KAMIZO_TEST_MODE:-0}

if [[ "$TEST_MODE" == '1' ]]; then
  SOURCE_DB=${KAMIZO_SOURCE_DB:-$SOURCE_DB}
  BACKUP_ROOT=${KAMIZO_BACKUP_ROOT:-$BACKUP_ROOT}
  LOCK_FILE=${KAMIZO_LOCK_FILE:-}
  TIMESTAMP=${KAMIZO_TIMESTAMP:-$TIMESTAMP}
  HOURLY_KEEP=${KAMIZO_HOURLY_KEEP:-$HOURLY_KEEP}
  DAILY_KEEP=${KAMIZO_DAILY_KEEP:-$DAILY_KEEP}
  BACKUP_RESERVE_BYTES=${KAMIZO_BACKUP_RESERVE_BYTES:-$BACKUP_RESERVE_BYTES}
fi

[[ "$SOURCE_DB" == /* && "$BACKUP_ROOT" == /* ]] || die 'source and backup paths must be absolute'
has_control_chars "$SOURCE_DB" && die 'source path contains control characters'
has_control_chars "$BACKUP_ROOT" && die 'backup path contains control characters'
has_control_chars "$LOCK_FILE" && die 'lock path contains control characters'
[[ "$TIMESTAMP" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || die 'timestamp must match YYYYMMDDTHHMMSSZ'
[[ "$HOURLY_KEEP" =~ ^[1-9][0-9]*$ ]] || die 'hourly retention must be a positive integer'
[[ "$DAILY_KEEP" =~ ^[1-9][0-9]*$ ]] || die 'daily retention must be a positive integer'
[[ "$BACKUP_RESERVE_BYTES" =~ ^[0-9]+$ ]] || die 'backup reserve must be a nonnegative integer'
[[ -s "$SOURCE_DB" ]] || die "source database is missing or empty: $SOURCE_DB"

for command in sqlite3 mkdir rmdir dirname basename mv rm find sort stat sync date df awk; do
  require_command "$command"
done
if command -v sha256sum >/dev/null 2>&1; then
  SHA_COMMAND='sha256sum'
elif command -v shasum >/dev/null 2>&1; then
  SHA_COMMAND='shasum'
else
  die 'required command not found: sha256sum or shasum'
fi
[[ "$MODE" == 'hourly' ]] || require_command gzip

mkdir -p -- "$BACKUP_ROOT"
if [[ "$TEST_MODE" == '1' ]]; then
  TEST_ROOT=${KAMIZO_TEST_ROOT:-}
  [[ "$TEST_ROOT" == /* && "$TEST_ROOT" != '/' ]] || die 'KAMIZO_TEST_ROOT must be an absolute non-root path'
  [[ -n "$LOCK_FILE" && -e "$LOCK_FILE" && ! -L "$LOCK_FILE" && -f "$LOCK_FILE" ]] || die 'test lock must be a precreated regular non-symlink file'
  TEST_ROOT=$(canonical_path "$TEST_ROOT") || die 'could not canonicalize test root'
  SOURCE_DB=$(canonical_path "$SOURCE_DB") || die 'could not canonicalize test source'
  BACKUP_ROOT=$(canonical_path "$BACKUP_ROOT") || die 'could not canonicalize test backup root'
  LOCK_FILE=$(canonical_path "$LOCK_FILE") || die 'could not canonicalize test lock'
  for path in "$SOURCE_DB" "$BACKUP_ROOT" "$LOCK_FILE"; do
    case "$path" in
      "$TEST_ROOT"/*) ;;
      *) die "test path escapes KAMIZO_TEST_ROOT: $path" ;;
    esac
  done
  [[ "$SOURCE_DB" != '/opt/kamizo/data/kamizo.db' \
    && "$BACKUP_ROOT" != '/opt/kamizo/backups/sqlite' \
    && "$LOCK_FILE" != '/run/lock/kamizo-backup.lock' ]] || die 'test mode can never use production paths'
else
  [[ "$LOCK_FILE" == '/run/lock/kamizo-backup.lock' ]] || die 'production lock path is fixed'
  [[ -f "$LOCK_FILE" && ! -L "$LOCK_FILE" ]] || die 'production lock must be a precreated regular non-symlink file'
  LOCK_METADATA=$(stat -c '%U:%G %a' -- "$LOCK_FILE") || die 'could not inspect production lock metadata'
  [[ "$LOCK_METADATA" == 'root:kamizo 660' ]] || die "invalid production lock owner/mode: $LOCK_METADATA"
fi
SOURCE_BYTES=$(file_bytes "$SOURCE_DB")
AVAILABLE_BYTES=$(available_bytes "$BACKUP_ROOT")
REQUIRED_BYTES=$((SOURCE_BYTES * 2 + BACKUP_RESERVE_BYTES))
(( AVAILABLE_BYTES >= REQUIRED_BYTES )) || die "insufficient backup disk: need $REQUIRED_BYTES bytes, have $AVAILABLE_BYTES"

TEST_LOCK_DIR="$LOCK_FILE.testlock"
LOCK_HELD=0
if [[ "$TEST_MODE" == '1' ]]; then
  mkdir -- "$TEST_LOCK_DIR" 2>/dev/null || die 'another backup is already running'
  LOCK_HELD=1
else
  require_command flock
  LOCK_INODE_BEFORE=$(stat -c '%d:%i' -- "$LOCK_FILE") || die 'could not inspect lock inode'
  exec 9>>"$LOCK_FILE"
  LOCK_INODE_OPEN=$(stat -Lc '%d:%i' -- "/proc/$$/fd/9") || die 'could not inspect opened lock inode'
  [[ "$LOCK_INODE_OPEN" == "$LOCK_INODE_BEFORE" ]] || die 'lock inode changed during open'
  flock -n 9 || die 'another backup is already running'
fi

DESTINATION_DIR="$BACKUP_ROOT/$MODE"
mkdir -p -- "$DESTINATION_DIR"
if [[ "$MODE" == 'hourly' ]]; then
  BASENAME="kamizo-hourly-$TIMESTAMP.db"
  KEEP=$HOURLY_KEEP
  ARTIFACT_PATTERN='kamizo-hourly-*.db'
  MANIFEST_PATTERN='kamizo-hourly-*.db.json'
  MANAGED_MANIFEST_REGEX='^kamizo-hourly-[0-9]{8}T[0-9]{6}Z\.db\.json$'
else
  BASENAME="kamizo-daily-$TIMESTAMP.db.gz"
  KEEP=$DAILY_KEEP
  ARTIFACT_PATTERN='kamizo-daily-*.db.gz'
  MANIFEST_PATTERN='kamizo-daily-*.db.gz.json'
  MANAGED_MANIFEST_REGEX='^kamizo-daily-[0-9]{8}T[0-9]{6}Z\.db\.gz\.json$'
fi

FINAL_BACKUP="$DESTINATION_DIR/$BASENAME"
FINAL_CHECKSUM="$FINAL_BACKUP.sha256"
FINAL_MANIFEST="$FINAL_BACKUP.json"
TEMP_DB="$DESTINATION_DIR/.${BASENAME}.sqlite.tmp.$$"
TEMP_ARTIFACT="$DESTINATION_DIR/.${BASENAME}.artifact.tmp.$$"
TEMP_CHECKSUM="$DESTINATION_DIR/.${BASENAME}.sha256.tmp.$$"
TEMP_MANIFEST="$DESTINATION_DIR/.${BASENAME}.json.tmp.$$"
PUBLISHING=0
COMMITTED=0

cleanup() {
  local status=$?
  rm -f -- "$TEMP_DB" "$TEMP_ARTIFACT" "$TEMP_CHECKSUM" "$TEMP_MANIFEST"
  if [[ "$PUBLISHING" == '1' && "$COMMITTED" != '1' ]]; then
    rm -f -- "$FINAL_BACKUP" "$FINAL_CHECKSUM" "$FINAL_MANIFEST"
  fi
  if [[ "$LOCK_HELD" == '1' && "$TEST_MODE" == '1' ]]; then
    if ! rmdir -- "$TEST_LOCK_DIR" 2>/dev/null; then
      printf 'kamizo-sqlite-backup: could not release test lock: %s\n' "$TEST_LOCK_DIR" >&2
      status=1
    fi
  fi
  return "$status"
}
trap cleanup EXIT

# A manifest is the commit marker. Clean only exact managed artifacts left by
# an interrupted manifest-last publication.
while IFS= read -r orphan; do
  [[ -n "$orphan" ]] || continue
  [[ -e "$orphan.json" ]] || rm -f -- "$orphan" "$orphan.sha256"
done < <(find "$DESTINATION_DIR" -maxdepth 1 -type f -name "$ARTIFACT_PATTERN" -print)
while IFS= read -r orphan_sidecar; do
  [[ -n "$orphan_sidecar" ]] || continue
  orphan_artifact=${orphan_sidecar%.sha256}
  [[ -e "$orphan_artifact.json" ]] || rm -f -- "$orphan_sidecar" "$orphan_artifact"
done < <(find "$DESTINATION_DIR" -maxdepth 1 -type f -name "$ARTIFACT_PATTERN.sha256" -print)
while IFS= read -r candidate_manifest; do
  [[ -n "$candidate_manifest" ]] || continue
  [[ "$(basename -- "$candidate_manifest")" =~ $MANAGED_MANIFEST_REGEX ]] || continue
  if ! is_committed_generation "$candidate_manifest"; then
    candidate_artifact=${candidate_manifest%.json}
    printf 'kamizo-sqlite-backup: warning: removing invalid managed generation: %s\n' "$candidate_artifact" >&2
    rm -f -- "$candidate_artifact" "$candidate_artifact.sha256" "$candidate_manifest"
  fi
done < <(find "$DESTINATION_DIR" -maxdepth 1 -type f -name "$MANIFEST_PATTERN" -print)

[[ ! -e "$FINAL_BACKUP" && ! -e "$FINAL_CHECKSUM" && ! -e "$FINAL_MANIFEST" ]] || die "backup timestamp already exists: $TIMESTAMP"

sqlite3 -readonly "$SOURCE_DB" '.timeout 30000' ".backup '$TEMP_DB'" || die 'SQLite online backup failed'
[[ -s "$TEMP_DB" ]] || die 'SQLite online backup is empty'
INTEGRITY=$(sqlite3 "$TEMP_DB" 'PRAGMA integrity_check;') || die 'integrity_check could not run'
[[ "$INTEGRITY" == 'ok' ]] || die "integrity_check failed: $INTEGRITY"
FK_OUTPUT=$(sqlite3 "$TEMP_DB" 'PRAGMA foreign_key_check;') || die 'foreign_key_check could not run'
[[ -z "$FK_OUTPUT" ]] || die 'foreign_key_check found violations'

if [[ "$MODE" == 'daily' ]]; then
  gzip -c -- "$TEMP_DB" >"$TEMP_ARTIFACT" || die 'gzip compression failed'
  rm -f -- "$TEMP_DB"
else
  mv -- "$TEMP_DB" "$TEMP_ARTIFACT"
fi
[[ -s "$TEMP_ARTIFACT" ]] || die 'final backup artifact is empty'

SHA256=$(sha256_file "$TEMP_ARTIFACT")
[[ "$SHA256" =~ ^[0-9a-f]{64}$ ]] || die 'could not calculate SHA-256'
BYTES=$(file_bytes "$TEMP_ARTIFACT")
[[ "$BYTES" =~ ^[1-9][0-9]*$ ]] || die 'backup size is invalid'
SQLITE_VERSION_OUTPUT=$(sqlite3 --version)
SQLITE_VERSION=${SQLITE_VERSION_OUTPUT%% *}
printf '%s  %s\n' "$SHA256" "$BASENAME" >"$TEMP_CHECKSUM"
printf '{"mode":"%s","timestamp":"%s","source":"%s","filename":"%s","bytes":%s,"sha256":"%s","sqlite_version":"%s","integrity":"ok","fk":"ok"}\n' \
  "$MODE" "$TIMESTAMP" "$(json_escape "$SOURCE_DB")" "$BASENAME" "$BYTES" "$SHA256" "$SQLITE_VERSION" >"$TEMP_MANIFEST"

sync_file "$TEMP_ARTIFACT"
sync_file "$TEMP_CHECKSUM"
sync_file "$TEMP_MANIFEST"
PUBLISHING=1
mv -- "$TEMP_ARTIFACT" "$FINAL_BACKUP"
mv -- "$TEMP_CHECKSUM" "$FINAL_CHECKSUM"
mv -- "$TEMP_MANIFEST" "$FINAL_MANIFEST"
sync_file "$DESTINATION_DIR"
COMMITTED=1

retained=0
while IFS= read -r manifest; do
  [[ -n "$manifest" ]] || continue
  if is_committed_generation "$manifest"; then
    retained=$((retained + 1))
    if (( retained > KEEP )); then
      artifact=${manifest%.json}
      rm -f -- "$artifact" "$artifact.sha256" "$manifest"
    fi
  fi
done < <(find "$DESTINATION_DIR" -maxdepth 1 -type f -name "$MANIFEST_PATTERN" -print | sort -r)
sync_file "$DESTINATION_DIR"

printf 'Published committed verified %s backup: %s\n' "$MODE" "$FINAL_BACKUP"
