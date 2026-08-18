#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
WORKER="$ROOT_DIR/deploy/systemd/kamizo-sqlite-backup.sh"
BACKUP_WRAPPER="$ROOT_DIR/scripts/backup.sh"
RESTORE="$ROOT_DIR/scripts/restore.sh"
TEST_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/kamizo-sqlite-backup-test.XXXXXX")
WAL_PID=''
TEST_COUNT=0

cleanup() {
  if [[ -n "$WAL_PID" ]]; then
    exec 8>&-
    wait "$WAL_PID" 2>/dev/null || true
  fi
  rm -rf "$TEST_ROOT"
}
trap cleanup EXIT

fail() {
  printf 'not ok - %s\n' "$*" >&2
  exit 1
}

pass() {
  TEST_COUNT=$((TEST_COUNT + 1))
  printf 'ok - %s\n' "$*"
}

assert_file() {
  [[ -f "$1" ]] || fail "expected file: $1"
}

assert_no_files() {
  local directory=$1 pattern=$2
  compgen -G "$directory/$pattern" >/dev/null && fail "unexpected $pattern in $directory"
  return 0
}

assert_eq() {
  [[ "$1" == "$2" ]] || fail "expected '$2', got '$1'${3:+ ($3)}"
}

assert_contains() {
  local file=$1 expected=$2 content
  content=$(<"$file")
  [[ "$content" == *"$expected"* ]] || fail "expected '$expected' in $file"
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d ' ' -f 1
  else
    shasum -a 256 "$1" | cut -d ' ' -f 1
  fi
}

file_bytes() {
  if stat -c '%s' "$1" >/dev/null 2>&1; then
    stat -c '%s' "$1"
  else
    stat -f '%z' "$1"
  fi
}

verify_database() {
  local database=$1
  assert_eq "$(sqlite3 "$database" 'PRAGMA integrity_check;')" 'ok' "integrity_check"
  assert_eq "$(sqlite3 "$database" 'PRAGMA foreign_key_check;')" '' "foreign_key_check"
  assert_eq "$(sqlite3 "$database" 'SELECT count(*) FROM backup_test_items;')" '2' "row count"
}

expect_failure() {
  local description=$1
  shift
  if "$@" >"$TEST_ROOT/expected-failure.out" 2>&1; then
    fail "$description"
  fi
}

expect_exit() {
  local expected=$1 description=$2
  shift 2
  set +e
  "$@" >"$TEST_ROOT/expected-failure.out" 2>&1
  local actual=$?
  set -e
  [[ "$actual" == "$expected" ]] || fail "$description (expected exit $expected, got $actual)"
}

copy_generation() {
  local source=$1 destination=$2
  cp -- "$source" "$destination"
  cp -- "$source.sha256" "$destination.sha256"
  cp -- "$source.json" "$destination.json"
}

write_generation_metadata() {
  local artifact=$1 hash bytes filename
  hash=$(sha256_file "$artifact")
  bytes=$(file_bytes "$artifact")
  filename=$(basename -- "$artifact")
  printf '%s  %s\n' "$hash" "$filename" >"$artifact.sha256"
  printf '{"mode":"hourly","timestamp":"20260814T000000Z","source":"test","filename":"%s","bytes":%s,"sha256":"%s","sqlite_version":"3","integrity":"ok","fk":"ok"}\n' \
    "$filename" "$bytes" "$hash" >"$artifact.json"
}

initialize_apply_state() {
  local state=$1
  mkdir -p "$state"
  : >"$state/active.kamizo-api.service"
  : >"$state/enabled.kamizo-api.service"
  for unit in kamizo-backup-hourly.timer kamizo-backup-daily.timer kamizo-backup-hourly.service kamizo-backup-daily.service; do
    : >"$state/active.$unit"
    : >"$state/enabled.$unit"
  done
}

setup_apply_root() {
  local root=$1 fixture="$ROOT_DIR/scripts/tests/fixtures/apply-command-stub.sh"
  mkdir -p "$root/adapters" "$root/tmp" "$root/data" "$root/input/hourly" "$root/emergency" "$root/lock"
  for command in systemctl runuser sqlite3 curl flock mv cp; do
    cp -- "$fixture" "$root/adapters/$command"
    chmod 700 "$root/adapters/$command"
  done
  cp -- "$WORKER" "$root/worker.sh"
  chmod 700 "$root/worker.sh"
  : >"$root/lock/kamizo-backup.lock"
}

run_apply_test() {
  local root=$1 source=$2 backup=$3 state=$4 health_mode=$5 apply_stamp=$6 emergency_stamp=$7
  shift 7
  env \
    PATH="$root/adapters:$PATH" \
    TMPDIR="$root/tmp" \
    KAMIZO_TEST_MODE=1 \
    KAMIZO_TEST_ALLOW_APPLY=1 \
    KAMIZO_TEST_EUID=0 \
    KAMIZO_TEST_ROOT="$root" \
    KAMIZO_SOURCE_DB="$source" \
    KAMIZO_DATA_DIR="$root/data" \
    KAMIZO_BACKUP_ROOT="$root/emergency" \
    KAMIZO_BACKUP_WORKER="$root/worker.sh" \
    KAMIZO_LOCK_FILE="$root/lock/kamizo-backup.lock" \
    KAMIZO_TEST_ADAPTER_DIR="$root/adapters" \
    KAMIZO_TIMESTAMP="$emergency_stamp" \
    KAMIZO_APPLY_TIMESTAMP="$apply_stamp" \
    KAMIZO_TEST_STATE_DIR="$state" \
    KAMIZO_TEST_HEALTH_MODE="$health_mode" \
    KAMIZO_REAL_SQLITE3="$(command -v sqlite3)" \
    KAMIZO_REAL_MV="$(command -v mv)" \
    KAMIZO_REAL_CP="$(command -v cp)" \
    KAMIZO_HEALTH_RETRIES=2 \
    KAMIZO_HEALTH_RETRY_DELAY=0 \
    KAMIZO_BACKUP_RESERVE_BYTES=0 \
    KAMIZO_RESTORE_RESERVE_BYTES=0 \
    KAMIZO_DISK_AVAILABLE_BYTES=9999999999 \
    "$@" \
    "$RESTORE" --apply "$backup" --confirm RESTORE
}

run_worker() {
  local mode=$1 source=$2 destination=$3 timestamp=$4
  shift 4
  mkdir -p "$destination"
  if [[ ! -e "$destination/kamizo-backup.lock" && ! -L "$destination/kamizo-backup.lock" ]]; then
    : >"$destination/kamizo-backup.lock"
  fi
  env \
    KAMIZO_TEST_MODE=1 \
    KAMIZO_TEST_ROOT="$TEST_ROOT" \
    KAMIZO_SOURCE_DB="$source" \
    KAMIZO_BACKUP_ROOT="$destination" \
    KAMIZO_LOCK_FILE="$destination/kamizo-backup.lock" \
    KAMIZO_TIMESTAMP="$timestamp" \
    "$@" \
    "$WORKER" "$mode"
}

start_wal_source() {
  local database=$1 fifo="$TEST_ROOT/sqlite-input.fifo"
  mkfifo "$fifo"
  sqlite3 "$database" <"$fifo" >"$TEST_ROOT/sqlite-wal.log" 2>&1 &
  WAL_PID=$!
  exec 8>"$fifo"
  printf '%s\n' \
    'PRAGMA journal_mode=WAL;' \
    'PRAGMA wal_autocheckpoint=0;' \
    'PRAGMA foreign_keys=ON;' \
    'CREATE TABLE backup_test_parents (id INTEGER PRIMARY KEY);' \
    'CREATE TABLE backup_test_items (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES backup_test_parents(id), value TEXT NOT NULL);' \
    'INSERT INTO backup_test_parents VALUES (1);' \
    "INSERT INTO backup_test_items VALUES (1, 1, 'first'), (2, 1, 'second');" >&8

  local attempt
  for attempt in {1..50}; do
    if [[ -f "$database-wal" ]] && [[ "$(sqlite3 "$database" 'SELECT count(*) FROM backup_test_items;' 2>/dev/null || true)" == '2' ]]; then
      return
    fi
    sleep 0.1
  done
  fail 'failed to create live WAL source database'
}

create_crashed_wal_database() {
  local database=$1 value=$2 pid attempt
  local fifo="$database.fifo"
  mkfifo "$fifo"
  sqlite3 "$database" <"$fifo" >"$database.writer.log" 2>&1 &
  pid=$!
  exec 7>"$fifo"
  printf '%s\n' \
    'PRAGMA journal_mode=WAL;' \
    'PRAGMA wal_autocheckpoint=0;' \
    'CREATE TABLE restore_state(value TEXT NOT NULL);' \
    "INSERT INTO restore_state VALUES('$value');" >&7
  for attempt in {1..50}; do
    if [[ -s "$database-wal" ]] && [[ "$(sqlite3 "$database" 'SELECT value FROM restore_state;' 2>/dev/null || true)" == "$value" ]]; then
      break
    fi
    sleep 0.1
  done
  [[ -s "$database-wal" ]] || fail "failed to create WAL fixture: $database"
  kill -9 "$pid"
  exec 7>&-
  wait "$pid" 2>/dev/null || true
  rm -f -- "$fifo"
}

for command in bash sqlite3 gzip gunzip mktemp; do
  command -v "$command" >/dev/null 2>&1 || fail "test dependency missing: $command"
done
command -v sha256sum >/dev/null 2>&1 || command -v shasum >/dev/null 2>&1 || fail 'test dependency missing: sha256sum or shasum'

SOURCE_DB="$TEST_ROOT/source.db"
BACKUP_ROOT="$TEST_ROOT/backups"
start_wal_source "$SOURCE_DB"
assert_eq "$(sqlite3 "$SOURCE_DB" 'PRAGMA journal_mode;')" 'wal' 'source journal mode'
assert_file "$SOURCE_DB-wal"
pass 'source database contains committed data in WAL mode'

run_worker hourly "$SOURCE_DB" "$BACKUP_ROOT" '20260814T010101Z'
HOURLY="$BACKUP_ROOT/hourly/kamizo-hourly-20260814T010101Z.db"
assert_file "$HOURLY"
assert_file "$HOURLY.sha256"
assert_file "$HOURLY.json"
verify_database "$HOURLY"
assert_eq "$(cut -d ' ' -f 1 "$HOURLY.sha256")" "$(sha256_file "$HOURLY")" 'hourly checksum'
assert_eq "$(sqlite3 :memory: "SELECT json_valid(CAST(readfile('$HOURLY.json') AS TEXT));")" '1' 'manifest JSON'
assert_eq "$(sqlite3 :memory: "SELECT json_extract(CAST(readfile('$HOURLY.json') AS TEXT), '$.mode');")" 'hourly' 'manifest mode'
assert_eq "$(sqlite3 :memory: "SELECT json_extract(CAST(readfile('$HOURLY.json') AS TEXT), '$.bytes');")" "$(file_bytes "$HOURLY")" 'manifest bytes'
assert_eq "$(sqlite3 :memory: "SELECT json_extract(CAST(readfile('$HOURLY.json') AS TEXT), '$.sha256');")" "$(sha256_file "$HOURLY")" 'manifest hash'
pass 'hourly backup is verified and publishes checksum plus valid manifest'

run_worker daily "$SOURCE_DB" "$BACKUP_ROOT" '20260814T033000Z'
DAILY="$BACKUP_ROOT/daily/kamizo-daily-20260814T033000Z.db.gz"
assert_file "$DAILY"
assert_file "$DAILY.sha256"
assert_file "$DAILY.json"
gunzip -c "$DAILY" >"$TEST_ROOT/daily-restored.db"
verify_database "$TEST_ROOT/daily-restored.db"
assert_eq "$(cut -d ' ' -f 1 "$DAILY.sha256")" "$(sha256_file "$DAILY")" 'daily checksum'
assert_eq "$(sqlite3 :memory: "SELECT json_valid(CAST(readfile('$DAILY.json') AS TEXT));")" '1' 'daily manifest JSON'
pass 'daily backup restores correct rows and publishes valid metadata'

BSD_STAT_BIN="$TEST_ROOT/bsd-stat-bin"
mkdir -p "$BSD_STAT_BIN" "$TEST_ROOT/bsd-worker" "$TEST_ROOT/bsd-restore"
printf '%s\n' \
  '#!/usr/bin/env bash' \
  'set -Eeuo pipefail' \
  'if [[ ${1:-} == "-c" ]]; then exit 1; fi' \
  '[[ ${1:-} == "-f" && ${3:-} == "--" && $# -eq 4 ]] || exit 64' \
  'exec "$KAMIZO_REAL_STAT" -f "$2" -- "$4"' >"$BSD_STAT_BIN/stat"
chmod 700 "$BSD_STAT_BIN/stat"
BSD_WORKER_SOURCE="$TEST_ROOT/bsd-worker/-source.db"
sqlite3 "$BSD_WORKER_SOURCE" 'CREATE TABLE bsd_stat_test(id INTEGER PRIMARY KEY); INSERT INTO bsd_stat_test VALUES(1);'
run_worker hourly "$BSD_WORKER_SOURCE" "$TEST_ROOT/bsd-worker-backups" '20260814T033001Z' \
  PATH="$BSD_STAT_BIN:$PATH" KAMIZO_REAL_STAT="$(command -v stat)"
assert_file "$TEST_ROOT/bsd-worker-backups/hourly/kamizo-hourly-20260814T033001Z.db.json"
BSD_RESTORE_ARTIFACT="$TEST_ROOT/bsd-restore/-restore.db"
cp -- "$HOURLY" "$BSD_RESTORE_ARTIFACT"
write_generation_metadata "$BSD_RESTORE_ARTIFACT"
(
  CDPATH= cd -- "$TEST_ROOT/bsd-restore"
  env PATH="$BSD_STAT_BIN:$PATH" KAMIZO_REAL_STAT="$(command -v stat)" \
    KAMIZO_TEST_MODE=1 KAMIZO_RESTORE_RESERVE_BYTES=0 KAMIZO_DISK_AVAILABLE_BYTES=9999999999 \
    "$RESTORE" --drill '-restore.db'
)
pass 'BSD stat fallback treats dash-prefixed worker and restore paths as operands'

MISSING_METADATA="$TEST_ROOT/missing-metadata.db"
cp -- "$HOURLY" "$MISSING_METADATA"
expect_failure 'drill accepted a new backup without required metadata' \
  env KAMIZO_TEST_MODE=1 KAMIZO_RESTORE_RESERVE_BYTES=0 KAMIZO_DISK_AVAILABLE_BYTES=9999999999 "$RESTORE" --drill "$MISSING_METADATA"

TAMPERED_MANIFEST="$TEST_ROOT/tampered-manifest.db"
copy_generation "$HOURLY" "$TAMPERED_MANIFEST"
printf '{"mode":"hourly","timestamp":"20260814T010101Z","source":"test","filename":"wrong.db","bytes":%s,"sha256":"%s","sqlite_version":"3","integrity":"ok","fk":"ok"}\n' \
  "$(file_bytes "$TAMPERED_MANIFEST")" "$(sha256_file "$TAMPERED_MANIFEST")" >"$TAMPERED_MANIFEST.json"
expect_failure 'drill accepted tampered manifest metadata' \
  env KAMIZO_TEST_MODE=1 KAMIZO_RESTORE_RESERVE_BYTES=0 KAMIZO_DISK_AVAILABLE_BYTES=9999999999 "$RESTORE" --drill "$TAMPERED_MANIFEST"

mkdir -p "$TEST_ROOT/tampered-bytes" "$TEST_ROOT/tampered-hash"
TAMPERED_BYTES="$TEST_ROOT/tampered-bytes/$(basename -- "$HOURLY")"
copy_generation "$HOURLY" "$TAMPERED_BYTES"
printf '{"filename":"%s","bytes":1,"sha256":"%s"}\n' "$(basename -- "$TAMPERED_BYTES")" "$(sha256_file "$TAMPERED_BYTES")" >"$TAMPERED_BYTES.json"
expect_failure 'drill accepted tampered manifest byte count' \
  env KAMIZO_TEST_MODE=1 KAMIZO_RESTORE_RESERVE_BYTES=0 KAMIZO_DISK_AVAILABLE_BYTES=9999999999 "$RESTORE" --drill "$TAMPERED_BYTES"
TAMPERED_HASH="$TEST_ROOT/tampered-hash/$(basename -- "$HOURLY")"
copy_generation "$HOURLY" "$TAMPERED_HASH"
printf '{"filename":"%s","bytes":%s,"sha256":"%064d"}\n' "$(basename -- "$TAMPERED_HASH")" "$(file_bytes "$TAMPERED_HASH")" 0 >"$TAMPERED_HASH.json"
expect_failure 'drill accepted tampered manifest hash' \
  env KAMIZO_TEST_MODE=1 KAMIZO_RESTORE_RESERVE_BYTES=0 KAMIZO_DISK_AVAILABLE_BYTES=9999999999 "$RESTORE" --drill "$TAMPERED_HASH"
pass 'new restore formats require matching checksum and manifest metadata'

mkdir -p "$TEST_ROOT/toctou"
TOCTOU_BACKUP="$TEST_ROOT/toctou/$(basename -- "$HOURLY")"
copy_generation "$HOURLY" "$TOCTOU_BACKUP"
TOCTOU_HOOK="$TEST_ROOT/mutate-original.sh"
printf '%s\n' \
  '#!/usr/bin/env bash' \
  "printf 'mutated after staging\\n' >\"\$1\"" \
  ': >"$KAMIZO_TEST_HOOK_MARKER"' >"$TOCTOU_HOOK"
chmod 700 "$TOCTOU_HOOK"
KAMIZO_TEST_MODE=1 \
  KAMIZO_TEST_AFTER_STAGE_HOOK="$TOCTOU_HOOK" \
  KAMIZO_TEST_HOOK_MARKER="$TEST_ROOT/toctou-hook-ran" \
  KAMIZO_RESTORE_RESERVE_BYTES=0 \
  KAMIZO_DISK_AVAILABLE_BYTES=9999999999 \
  "$RESTORE" --drill "$TOCTOU_BACKUP"
assert_file "$TEST_ROOT/toctou-hook-ran"
pass 'restore verifies private staged bytes rather than the caller pathname'

expect_failure 'restore accepted gzip exceeding the uncompressed limit' \
  env KAMIZO_TEST_MODE=1 KAMIZO_MAX_RESTORE_BYTES=1 KAMIZO_RESTORE_RESERVE_BYTES=0 KAMIZO_DISK_AVAILABLE_BYTES=9999999999 "$RESTORE" --drill "$DAILY"
expect_failure 'restore ignored available-disk preflight' \
  env KAMIZO_TEST_MODE=1 KAMIZO_RESTORE_RESERVE_BYTES=1 KAMIZO_DISK_AVAILABLE_BYTES=0 "$RESTORE" --drill "$HOURLY"
pass 'restore rejects gzip oversize and insufficient staging disk'

DISK_ROOT="$TEST_ROOT/backup-disk-rejection"
expect_failure 'backup ignored available-disk preflight' \
  run_worker hourly "$SOURCE_DB" "$DISK_ROOT" '20260814T035959Z' KAMIZO_BACKUP_RESERVE_BYTES=1 KAMIZO_DISK_AVAILABLE_BYTES=0
mkdir -p "$DISK_ROOT/hourly"
assert_no_files "$DISK_ROOT/hourly" 'kamizo-hourly-*'
pass 'backup rejects insufficient destination disk before publication'

CONCURRENT_ROOT="$TEST_ROOT/concurrent-backups"
run_worker hourly "$SOURCE_DB" "$CONCURRENT_ROOT" '20260814T035958Z' >"$TEST_ROOT/concurrent-worker.log" 2>&1 &
CONCURRENT_PID=$!
printf '%s\n' "INSERT INTO backup_test_items VALUES (3, 1, 'concurrent');" >&8
wait "$CONCURRENT_PID"
CONCURRENT_BACKUP="$CONCURRENT_ROOT/hourly/kamizo-hourly-20260814T035958Z.db"
assert_eq "$(sqlite3 "$CONCURRENT_BACKUP" 'PRAGMA integrity_check;')" 'ok' 'concurrent integrity'
assert_eq "$(sqlite3 "$CONCURRENT_BACKUP" 'PRAGMA foreign_key_check;')" '' 'concurrent foreign keys'
CONCURRENT_ROWS=$(sqlite3 "$CONCURRENT_BACKUP" 'SELECT count(*) FROM backup_test_items;')
[[ "$CONCURRENT_ROWS" == '2' || "$CONCURRENT_ROWS" == '3' ]] || fail "inconsistent concurrent backup row count: $CONCURRENT_ROWS"
printf '%s\n' 'DELETE FROM backup_test_items WHERE id=3;' >&8
pass 'online backup remains consistent during a concurrent WAL commit'

WRAPPER_ROOT="$TEST_ROOT/wrapper-backups"
mkdir -p "$WRAPPER_ROOT"
: >"$WRAPPER_ROOT/kamizo-backup.lock"
env \
  KAMIZO_TEST_MODE=1 \
  KAMIZO_TEST_ROOT="$TEST_ROOT" \
  KAMIZO_SOURCE_DB="$SOURCE_DB" \
  KAMIZO_BACKUP_ROOT="$WRAPPER_ROOT" \
  KAMIZO_LOCK_FILE="$WRAPPER_ROOT/kamizo-backup.lock" \
  KAMIZO_TIMESTAMP='20260814T020202Z' \
  "$BACKUP_WRAPPER" hourly
assert_file "$WRAPPER_ROOT/hourly/kamizo-hourly-20260814T020202Z.db"
pass 'repository backup wrapper delegates to SQLite worker'

RETENTION_ROOT="$TEST_ROOT/retention-backups"
for stamp in 20260814T040001Z 20260814T040002Z 20260814T040003Z 20260814T040004Z 20260814T040005Z; do
  run_worker hourly "$SOURCE_DB" "$RETENTION_ROOT" "$stamp" KAMIZO_HOURLY_KEEP=3
done
assert_eq "$(find "$RETENTION_ROOT/hourly" -type f -name 'kamizo-hourly-*.db' | wc -l | tr -d ' ')" '3' 'retention count'
assert_no_files "$RETENTION_ROOT/hourly" 'kamizo-hourly-20260814T040001Z.db*'
assert_file "$RETENTION_ROOT/hourly/kamizo-hourly-20260814T040005Z.db"
assert_file "$RETENTION_ROOT/hourly/kamizo-hourly-20260814T040005Z.db.sha256"
assert_file "$RETENTION_ROOT/hourly/kamizo-hourly-20260814T040005Z.db.json"
pass 'retention keeps the latest configured count and matching metadata'

DAILY_RETENTION_ROOT="$TEST_ROOT/daily-retention-backups"
for stamp in 20260814T050001Z 20260814T050002Z 20260814T050003Z; do
  run_worker daily "$SOURCE_DB" "$DAILY_RETENTION_ROOT" "$stamp" KAMIZO_DAILY_KEEP=2
done
assert_eq "$(find "$DAILY_RETENTION_ROOT/daily" -type f -name 'kamizo-daily-*.db.gz' | wc -l | tr -d ' ')" '2' 'daily retention count'
assert_no_files "$DAILY_RETENTION_ROOT/daily" 'kamizo-daily-20260814T050001Z.db.gz*'
assert_file "$DAILY_RETENTION_ROOT/daily/kamizo-daily-20260814T050003Z.db.gz.sha256"
assert_file "$DAILY_RETENTION_ROOT/daily/kamizo-daily-20260814T050003Z.db.gz.json"
pass 'daily retention keeps compressed backups and metadata by count'

ORPHAN_ROOT="$TEST_ROOT/orphan-backups"
mkdir -p "$ORPHAN_ROOT/hourly"
printf 'interrupted artifact\n' >"$ORPHAN_ROOT/hourly/kamizo-hourly-20260814T000001Z.db"
printf 'deadbeef  kamizo-hourly-20260814T000001Z.db\n' >"$ORPHAN_ROOT/hourly/kamizo-hourly-20260814T000001Z.db.sha256"
run_worker hourly "$SOURCE_DB" "$ORPHAN_ROOT" '20260814T000002Z'
assert_no_files "$ORPHAN_ROOT/hourly" 'kamizo-hourly-20260814T000001Z.db*'
assert_file "$ORPHAN_ROOT/hourly/kamizo-hourly-20260814T000002Z.db.json"
pass 'next backup removes interrupted generations without a manifest commit marker'

INVALID_GENERATION_ROOT="$TEST_ROOT/invalid-generation-backups"
mkdir -p "$INVALID_GENERATION_ROOT/hourly"
INVALID_JSON="$INVALID_GENERATION_ROOT/hourly/kamizo-hourly-20260814T000010Z.db"
INVALID_HASH="$INVALID_GENERATION_ROOT/hourly/kamizo-hourly-20260814T000011Z.db"
INVALID_SIZE="$INVALID_GENERATION_ROOT/hourly/kamizo-hourly-20260814T000012Z.db"
VALID_GENERATION="$INVALID_GENERATION_ROOT/hourly/kamizo-hourly-20260814T000013Z.db"
LEGACY_GENERATION="$INVALID_GENERATION_ROOT/hourly/kamizo-hourly-legacy.db"
for generation in "$INVALID_JSON" "$INVALID_HASH" "$INVALID_SIZE" "$VALID_GENERATION" "$LEGACY_GENERATION"; do
  cp -- "$HOURLY" "$generation"
  write_generation_metadata "$generation"
done
printf '{malformed json\n' >"$INVALID_JSON.json"
printf '{"filename":"%s","bytes":%s,"sha256":"%064d"}\n' \
  "$(basename -- "$INVALID_HASH")" "$(file_bytes "$INVALID_HASH")" 0 >"$INVALID_HASH.json"
printf '{"filename":"%s","bytes":1,"sha256":"%s"}\n' \
  "$(basename -- "$INVALID_SIZE")" "$(sha256_file "$INVALID_SIZE")" >"$INVALID_SIZE.json"
VALID_ARTIFACT_HASH=$(sha256_file "$VALID_GENERATION")
VALID_SIDECAR_HASH=$(sha256_file "$VALID_GENERATION.sha256")
VALID_MANIFEST_HASH=$(sha256_file "$VALID_GENERATION.json")
LEGACY_ARTIFACT_HASH=$(sha256_file "$LEGACY_GENERATION")
LEGACY_SIDECAR_HASH=$(sha256_file "$LEGACY_GENERATION.sha256")
LEGACY_MANIFEST_HASH=$(sha256_file "$LEGACY_GENERATION.json")
run_worker hourly "$SOURCE_DB" "$INVALID_GENERATION_ROOT" '20260814T000014Z' >"$TEST_ROOT/invalid-generation-worker.log" 2>&1
assert_no_files "$INVALID_GENERATION_ROOT/hourly" 'kamizo-hourly-20260814T000010Z.db*'
assert_contains "$TEST_ROOT/invalid-generation-worker.log" 'removing invalid managed generation'
pass 'startup warns and removes an exact managed generation with malformed JSON'
assert_no_files "$INVALID_GENERATION_ROOT/hourly" 'kamizo-hourly-20260814T000011Z.db*'
pass 'startup removes an exact managed generation with a mismatched hash'
assert_no_files "$INVALID_GENERATION_ROOT/hourly" 'kamizo-hourly-20260814T000012Z.db*'
pass 'startup removes an exact managed generation with a mismatched size'
assert_eq "$(sha256_file "$VALID_GENERATION")" "$VALID_ARTIFACT_HASH" 'valid artifact unchanged'
assert_eq "$(sha256_file "$VALID_GENERATION.sha256")" "$VALID_SIDECAR_HASH" 'valid sidecar unchanged'
assert_eq "$(sha256_file "$VALID_GENERATION.json")" "$VALID_MANIFEST_HASH" 'valid manifest unchanged'
assert_eq "$(sha256_file "$LEGACY_GENERATION")" "$LEGACY_ARTIFACT_HASH" 'legacy artifact unchanged'
assert_eq "$(sha256_file "$LEGACY_GENERATION.sha256")" "$LEGACY_SIDECAR_HASH" 'legacy sidecar unchanged'
assert_eq "$(sha256_file "$LEGACY_GENERATION.json")" "$LEGACY_MANIFEST_HASH" 'legacy manifest unchanged'
pass 'startup leaves valid managed generations and legacy patterns untouched'

CORRUPT_ROOT="$TEST_ROOT/corrupt-backups"
printf 'not a sqlite database\n' >"$TEST_ROOT/corrupt-source.db"
if run_worker hourly "$TEST_ROOT/corrupt-source.db" "$CORRUPT_ROOT" '20260814T050000Z' >/dev/null 2>&1; then
  fail 'corrupt source unexpectedly produced a backup'
fi
mkdir -p "$CORRUPT_ROOT/hourly"
assert_no_files "$CORRUPT_ROOT/hourly" 'kamizo-hourly-*'
pass 'failed source verification publishes nothing'

FK_ROOT="$TEST_ROOT/fk-invalid-backups"
sqlite3 "$TEST_ROOT/fk-invalid.db" <<'SQL'
PRAGMA foreign_keys=OFF;
CREATE TABLE backup_test_parents (id INTEGER PRIMARY KEY);
CREATE TABLE backup_test_items (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES backup_test_parents(id), value TEXT NOT NULL);
INSERT INTO backup_test_items VALUES (1, 999, 'orphan');
SQL
if run_worker hourly "$TEST_ROOT/fk-invalid.db" "$FK_ROOT" '20260814T051000Z' >/dev/null 2>&1; then
  fail 'foreign-key-invalid source unexpectedly produced a backup'
fi
mkdir -p "$FK_ROOT/hourly"
assert_no_files "$FK_ROOT/hourly" 'kamizo-hourly-*'
write_generation_metadata "$TEST_ROOT/fk-invalid.db"
pass 'foreign key violations publish nothing'

LOCK_ROOT="$TEST_ROOT/lock-backups"
mkdir -p "$LOCK_ROOT/kamizo-backup.lock.testlock"
if run_worker hourly "$SOURCE_DB" "$LOCK_ROOT" '20260814T060000Z' >/dev/null 2>&1; then
  fail 'lock contention unexpectedly succeeded'
fi
assert_no_files "$LOCK_ROOT/hourly" 'kamizo-hourly-*'
pass 'nonblocking lock contention fails without publication'

SYMLINK_LOCK_ROOT="$TEST_ROOT/symlink-lock-backups"
mkdir -p "$SYMLINK_LOCK_ROOT" "$TEST_ROOT/outside-lock"
: >"$TEST_ROOT/outside-lock/target.lock"
ln -s "$TEST_ROOT/outside-lock/target.lock" "$SYMLINK_LOCK_ROOT/kamizo-backup.lock"
expect_failure 'backup accepted a symlink lock file' \
  run_worker hourly "$SOURCE_DB" "$SYMLINK_LOCK_ROOT" '20260814T060001Z'
pass 'test backup rejects symlink lock files'

QUOTE_SOURCE_DIR="$TEST_ROOT/source-\"quoted"
QUOTE_BACKUP_ROOT="$TEST_ROOT/backup-\"quoted"
mkdir -p "$QUOTE_SOURCE_DIR"
QUOTE_SOURCE="$QUOTE_SOURCE_DIR/source.db"
sqlite3 "$QUOTE_SOURCE" 'CREATE TABLE quoted_path_test(id INTEGER PRIMARY KEY); INSERT INTO quoted_path_test VALUES(1);'
run_worker hourly "$QUOTE_SOURCE" "$QUOTE_BACKUP_ROOT" '20260814T060002Z'
QUOTE_MANIFEST="$QUOTE_BACKUP_ROOT/hourly/kamizo-hourly-20260814T060002Z.db.json"
assert_eq "$(sqlite3 :memory: "SELECT json_valid(CAST(readfile('$QUOTE_MANIFEST') AS TEXT));")" '1' 'quoted path manifest JSON'
assert_eq "$(sqlite3 :memory: "SELECT json_extract(CAST(readfile('$QUOTE_MANIFEST') AS TEXT), '$.source');")" "$(realpath "$QUOTE_SOURCE")" 'quoted source manifest value'
CONTROL_SOURCE="$TEST_ROOT/control"$'\t'"source.db"
cp -- "$QUOTE_SOURCE" "$CONTROL_SOURCE"
expect_failure 'backup accepted an ASCII control character in a path' \
  run_worker hourly "$CONTROL_SOURCE" "$TEST_ROOT/control-backups" '20260814T060003Z'
pass 'quoted paths generate valid JSON and control-character paths are rejected'

KAMIZO_TEST_MODE=1 KAMIZO_RESTORE_RESERVE_BYTES=0 KAMIZO_DISK_AVAILABLE_BYTES=9999999999 "$RESTORE" --drill "$HOURLY"
KAMIZO_TEST_MODE=1 KAMIZO_RESTORE_RESERVE_BYTES=0 KAMIZO_DISK_AVAILABLE_BYTES=9999999999 "$RESTORE" --drill "$DAILY"
sqlite3 "$SOURCE_DB" .dump | gzip -c >"$TEST_ROOT/legacy.sql.gz"
expect_failure 'legacy drill succeeded without explicit unsigned opt-in' \
  env KAMIZO_TEST_MODE=1 KAMIZO_RESTORE_RESERVE_BYTES=0 KAMIZO_DISK_AVAILABLE_BYTES=9999999999 "$RESTORE" --drill "$TEST_ROOT/legacy.sql.gz"
KAMIZO_TEST_MODE=1 KAMIZO_RESTORE_RESERVE_BYTES=0 KAMIZO_DISK_AVAILABLE_BYTES=9999999999 \
  "$RESTORE" --drill "$TEST_ROOT/legacy.sql.gz" --allow-legacy-unsigned
pass 'restore drill accepts new formats and explicitly opted-in legacy SQL'

MALICIOUS_TARGET="$TEST_ROOT/legacy-shell-executed"
MALICIOUS_SQL="$TEST_ROOT/malicious.sql.gz"
printf '.shell touch %s\nCREATE TABLE should_not_run(id INTEGER);\n' "$MALICIOUS_TARGET" | gzip -c >"$MALICIOUS_SQL"
expect_failure 'safe legacy drill accepted a malicious dot-shell command' \
  env KAMIZO_TEST_MODE=1 KAMIZO_RESTORE_RESERVE_BYTES=0 KAMIZO_DISK_AVAILABLE_BYTES=9999999999 "$RESTORE" --drill "$MALICIOUS_SQL" --allow-legacy-unsigned
[[ ! -e "$MALICIOUS_TARGET" ]] || fail 'legacy .shell command executed'
pass 'sqlite safe mode blocks malicious legacy dot commands'

cp "$HOURLY" "$TEST_ROOT/bad-checksum.db"
write_generation_metadata "$TEST_ROOT/bad-checksum.db"
printf '%064d  bad-checksum.db\n' 0 >"$TEST_ROOT/bad-checksum.db.sha256"
if KAMIZO_TEST_MODE=1 "$RESTORE" --drill "$TEST_ROOT/bad-checksum.db" >/dev/null 2>&1; then
  fail 'drill accepted an invalid checksum'
fi
printf 'broken sqlite backup\n' >"$TEST_ROOT/broken.db"
write_generation_metadata "$TEST_ROOT/broken.db"
mkdir -p "$TEST_ROOT/restore-tmp"
if TMPDIR="$TEST_ROOT/restore-tmp" KAMIZO_TEST_MODE=1 "$RESTORE" --drill "$TEST_ROOT/broken.db" >/dev/null 2>&1; then
  fail 'drill accepted a corrupt database'
fi
assert_no_files "$TEST_ROOT/restore-tmp" 'kamizo-restore.*'
if KAMIZO_TEST_MODE=1 "$RESTORE" --drill "$TEST_ROOT/fk-invalid.db" >/dev/null 2>&1; then
  fail 'drill accepted foreign key violations'
fi
pass 'restore drill rejects checksum mismatch and corrupt input'

expect_failure 'apply accepted an inexact confirmation token' \
  env KAMIZO_TEST_MODE=1 KAMIZO_TEST_ALLOW_APPLY=1 KAMIZO_TEST_EUID=0 "$RESTORE" --apply "$HOURLY" --confirm WRONG
expect_failure 'apply accepted a non-root caller' \
  env KAMIZO_TEST_MODE=1 KAMIZO_TEST_ALLOW_APPLY=1 KAMIZO_TEST_EUID=1000 "$RESTORE" --apply "$HOURLY" --confirm RESTORE
mkdir -p "$TEST_ROOT/production-path-guard"
expect_failure 'test apply accepted fixed production paths' \
  env KAMIZO_TEST_MODE=1 KAMIZO_TEST_ALLOW_APPLY=1 KAMIZO_TEST_EUID=0 KAMIZO_TEST_ROOT="$TEST_ROOT/production-path-guard" "$RESTORE" --apply "$HOURLY" --confirm RESTORE
assert_contains "$TEST_ROOT/expected-failure.out" 'explicit DB/data/backup/worker/lock/adapter paths'
expect_failure 'apply accepted legacy SQL input' \
  env KAMIZO_TEST_MODE=1 KAMIZO_TEST_ALLOW_APPLY=1 KAMIZO_TEST_EUID=0 KAMIZO_TEST_ROOT="$TEST_ROOT" "$RESTORE" --apply "$TEST_ROOT/legacy.sql.gz" --confirm RESTORE
assert_contains "$TEST_ROOT/expected-failure.out" 'legacy'
pass 'apply requires exact confirmation and root, rejects production test paths and legacy SQL'

TRAVERSAL_ROOT="$TEST_ROOT/apply-traversal"
setup_apply_root "$TRAVERSAL_ROOT"
mkdir -p "$TEST_ROOT/traversal-outside"
TRAVERSAL_SOURCE="$TEST_ROOT/traversal-outside/kamizo.db"
create_crashed_wal_database "$TRAVERSAL_SOURCE" original
TRAVERSAL_CANDIDATE="$TRAVERSAL_ROOT/candidate.db"
sqlite3 "$TRAVERSAL_CANDIDATE" "CREATE TABLE restore_state(value TEXT NOT NULL); INSERT INTO restore_state VALUES('candidate');"
run_worker hourly "$TRAVERSAL_CANDIDATE" "$TRAVERSAL_ROOT/input" '20260814T070000Z'
TRAVERSAL_BACKUP="$TRAVERSAL_ROOT/input/hourly/kamizo-hourly-20260814T070000Z.db"
initialize_apply_state "$TRAVERSAL_ROOT/state"
expect_failure 'test apply accepted a canonical traversal outside test root' \
  run_apply_test "$TRAVERSAL_ROOT" "$TRAVERSAL_ROOT/data/../../traversal-outside/kamizo.db" "$TRAVERSAL_BACKUP" "$TRAVERSAL_ROOT/state" success '20260814T070100Z' '20260814T070059Z'

ADAPTER_ESCAPE_ROOT="$TEST_ROOT/apply-adapter-escape"
setup_apply_root "$ADAPTER_ESCAPE_ROOT"
mkdir -p "$TEST_ROOT/outside-adapters"
for command in systemctl runuser sqlite3 curl flock mv cp; do
  cp -- "$ROOT_DIR/scripts/tests/fixtures/apply-command-stub.sh" "$TEST_ROOT/outside-adapters/$command"
  chmod 700 "$TEST_ROOT/outside-adapters/$command"
  rm -f -- "$ADAPTER_ESCAPE_ROOT/adapters/$command"
done
rmdir "$ADAPTER_ESCAPE_ROOT/adapters"
ln -s "$TEST_ROOT/outside-adapters" "$ADAPTER_ESCAPE_ROOT/adapters"
ADAPTER_ESCAPE_SOURCE="$ADAPTER_ESCAPE_ROOT/data/kamizo.db"
create_crashed_wal_database "$ADAPTER_ESCAPE_SOURCE" original
ADAPTER_ESCAPE_CANDIDATE="$ADAPTER_ESCAPE_ROOT/candidate.db"
sqlite3 "$ADAPTER_ESCAPE_CANDIDATE" "CREATE TABLE restore_state(value TEXT NOT NULL); INSERT INTO restore_state VALUES('candidate');"
run_worker hourly "$ADAPTER_ESCAPE_CANDIDATE" "$ADAPTER_ESCAPE_ROOT/input" '20260814T071000Z'
ADAPTER_ESCAPE_BACKUP="$ADAPTER_ESCAPE_ROOT/input/hourly/kamizo-hourly-20260814T071000Z.db"
initialize_apply_state "$ADAPTER_ESCAPE_ROOT/state"
expect_failure 'test apply accepted an adapter-directory symlink escape' \
  run_apply_test "$ADAPTER_ESCAPE_ROOT" "$ADAPTER_ESCAPE_SOURCE" "$ADAPTER_ESCAPE_BACKUP" "$ADAPTER_ESCAPE_ROOT/state" success '20260814T071100Z' '20260814T071059Z'
pass 'canonical test isolation rejects traversal and adapter symlink escapes'

PARTIAL_STOP_ROOT="$TEST_ROOT/apply-partial-stop"
setup_apply_root "$PARTIAL_STOP_ROOT"
PARTIAL_STOP_SOURCE="$PARTIAL_STOP_ROOT/data/kamizo.db"
create_crashed_wal_database "$PARTIAL_STOP_SOURCE" original
PARTIAL_STOP_CANDIDATE="$PARTIAL_STOP_ROOT/candidate.db"
sqlite3 "$PARTIAL_STOP_CANDIDATE" "CREATE TABLE restore_state(value TEXT NOT NULL); INSERT INTO restore_state VALUES('candidate');"
run_worker hourly "$PARTIAL_STOP_CANDIDATE" "$PARTIAL_STOP_ROOT/input" '20260814T080000Z'
PARTIAL_STOP_BACKUP="$PARTIAL_STOP_ROOT/input/hourly/kamizo-hourly-20260814T080000Z.db"
initialize_apply_state "$PARTIAL_STOP_ROOT/state"
expect_failure 'apply unexpectedly survived a backup-unit stop failure' \
  run_apply_test "$PARTIAL_STOP_ROOT" "$PARTIAL_STOP_SOURCE" "$PARTIAL_STOP_BACKUP" "$PARTIAL_STOP_ROOT/state" success '20260814T080100Z' '20260814T080059Z' KAMIZO_TEST_STOP_FAIL_UNIT=kamizo-backup-daily.service
assert_file "$PARTIAL_STOP_ROOT/state/active.kamizo-backup-hourly.timer"
assert_file "$PARTIAL_STOP_ROOT/state/active.kamizo-backup-daily.timer"
[[ ! -e "$PARTIAL_STOP_ROOT/state/active.kamizo-backup-hourly.service" ]] || fail 'interrupted oneshot hourly service was restarted'
assert_file "$PARTIAL_STOP_ROOT/state/active.kamizo-backup-daily.service"
pass 'partial backup-unit stop restores active timers but not interrupted oneshot services'

APPLY_SUCCESS="$TEST_ROOT/apply-success"
setup_apply_root "$APPLY_SUCCESS"
LIVE_SUCCESS="$APPLY_SUCCESS/data/kamizo.db"
CANDIDATE_SUCCESS="$APPLY_SUCCESS/candidate.db"
create_crashed_wal_database "$LIVE_SUCCESS" original
sqlite3 "$CANDIDATE_SUCCESS" "CREATE TABLE restore_state(value TEXT NOT NULL); INSERT INTO restore_state VALUES('candidate');"
run_worker hourly "$CANDIDATE_SUCCESS" "$APPLY_SUCCESS/input" '20260814T100000Z' KAMIZO_BACKUP_RESERVE_BYTES=0 KAMIZO_DISK_AVAILABLE_BYTES=9999999999
APPLY_SUCCESS_BACKUP="$APPLY_SUCCESS/input/hourly/kamizo-hourly-20260814T100000Z.db"
initialize_apply_state "$APPLY_SUCCESS/state"
run_apply_test "$APPLY_SUCCESS" "$LIVE_SUCCESS" "$APPLY_SUCCESS_BACKUP" "$APPLY_SUCCESS/state" success '20260814T110000Z' '20260814T105959Z'
assert_eq "$(sqlite3 "$LIVE_SUCCESS" 'SELECT value FROM restore_state;')" 'candidate' 'applied database'
APPLY_SUCCESS_OLD="$APPLY_SUCCESS/data/kamizo.db.pre-restore-20260814T110000Z"
assert_file "$APPLY_SUCCESS_OLD"
assert_eq "$(sqlite3 "$APPLY_SUCCESS_OLD" 'SELECT value FROM restore_state;')" 'original' 'preserved old database'
assert_file "$APPLY_SUCCESS/emergency/hourly/kamizo-hourly-20260814T105959Z.db.json"
for unit in kamizo-backup-hourly.timer kamizo-backup-daily.timer; do
  assert_file "$APPLY_SUCCESS/state/active.$unit"
done
[[ ! -e "$APPLY_SUCCESS/state/active.kamizo-backup-hourly.service" ]] || fail 'hourly oneshot service restarted after successful apply'
[[ ! -e "$APPLY_SUCCESS/state/active.kamizo-backup-daily.service" ]] || fail 'daily oneshot service restarted after successful apply'
assert_contains "$APPLY_SUCCESS/state/commands.log" 'runuser -u kamizo --'
assert_contains "$APPLY_SUCCESS/state/commands.log" 'wal_checkpoint(TRUNCATE)'
assert_contains "$APPLY_SUCCESS/state/commands.log" 'health-value candidate'
assert_contains "$APPLY_SUCCESS/state/commands.log" 'source-continuity before=1 after=1'
assert_contains "$APPLY_SUCCESS/state/commands.log" 'timer-start lock=released'
pass 'apply serializes backups, checkpoints WAL, preserves old DB, swaps atomically, and restores units'

APPLY_ROLLBACK="$TEST_ROOT/apply-rollback"
setup_apply_root "$APPLY_ROLLBACK"
LIVE_ROLLBACK="$APPLY_ROLLBACK/data/kamizo.db"
CANDIDATE_ROLLBACK="$APPLY_ROLLBACK/candidate.db"
create_crashed_wal_database "$LIVE_ROLLBACK" original
sqlite3 "$CANDIDATE_ROLLBACK" "CREATE TABLE restore_state(value TEXT NOT NULL); INSERT INTO restore_state VALUES('candidate');"
run_worker hourly "$CANDIDATE_ROLLBACK" "$APPLY_ROLLBACK/input" '20260814T120000Z' KAMIZO_BACKUP_RESERVE_BYTES=0 KAMIZO_DISK_AVAILABLE_BYTES=9999999999
APPLY_ROLLBACK_BACKUP="$APPLY_ROLLBACK/input/hourly/kamizo-hourly-20260814T120000Z.db"
initialize_apply_state "$APPLY_ROLLBACK/state"
expect_failure 'apply did not fail when candidate health remained bad' \
  run_apply_test "$APPLY_ROLLBACK" "$LIVE_ROLLBACK" "$APPLY_ROLLBACK_BACKUP" "$APPLY_ROLLBACK/state" fail-candidate '20260814T130000Z' '20260814T125959Z'
assert_file "$LIVE_ROLLBACK"
assert_eq "$(sqlite3 "$LIVE_ROLLBACK" 'SELECT value FROM restore_state;')" 'original' 'rolled-back database'
APPLY_ROLLBACK_OLD="$APPLY_ROLLBACK/data/kamizo.db.pre-restore-20260814T130000Z"
assert_file "$APPLY_ROLLBACK_OLD"
assert_eq "$(sqlite3 "$APPLY_ROLLBACK_OLD" 'SELECT value FROM restore_state;')" 'original' 'rollback preservation copy'
assert_contains "$APPLY_ROLLBACK/state/commands.log" 'health-value candidate'
assert_contains "$APPLY_ROLLBACK/state/commands.log" 'health-value original'
assert_file "$APPLY_ROLLBACK/state/active.kamizo-api.service"
for unit in kamizo-backup-hourly.timer kamizo-backup-daily.timer; do
  assert_file "$APPLY_ROLLBACK/state/active.$unit"
done
[[ ! -e "$APPLY_ROLLBACK/state/active.kamizo-backup-hourly.service" ]] || fail 'hourly oneshot service restarted after rollback'
[[ ! -e "$APPLY_ROLLBACK/state/active.kamizo-backup-daily.service" ]] || fail 'daily oneshot service restarted after rollback'
pass 'failed health rolls back atomically, verifies old DB, retries health, and restores units'

for rollback_fault in copy mv verify; do
  FAULT_ROOT="$TEST_ROOT/apply-rollback-$rollback_fault"
  setup_apply_root "$FAULT_ROOT"
  FAULT_SOURCE="$FAULT_ROOT/data/kamizo.db"
  create_crashed_wal_database "$FAULT_SOURCE" original
  FAULT_CANDIDATE="$FAULT_ROOT/candidate.db"
  sqlite3 "$FAULT_CANDIDATE" "CREATE TABLE restore_state(value TEXT NOT NULL); INSERT INTO restore_state VALUES('candidate');"
  run_worker hourly "$FAULT_CANDIDATE" "$FAULT_ROOT/input" '20260814T140000Z'
  FAULT_BACKUP="$FAULT_ROOT/input/hourly/kamizo-hourly-20260814T140000Z.db"
  initialize_apply_state "$FAULT_ROOT/state"
  expect_exit 2 "rollback $rollback_fault fault did not report catastrophe" \
    run_apply_test "$FAULT_ROOT" "$FAULT_SOURCE" "$FAULT_BACKUP" "$FAULT_ROOT/state" fail-candidate '20260814T140100Z' '20260814T140059Z' KAMIZO_TEST_ROLLBACK_FAULT="$rollback_fault"
  [[ ! -e "$FAULT_ROOT/state/active.kamizo-api.service" ]] || fail "API restarted after incomplete rollback: $rollback_fault"
  assert_file "$FAULT_ROOT/data/kamizo.db.pre-restore-20260814T140100Z"
  assert_contains "$TEST_ROOT/expected-failure.out" 'CATASTROPHIC ROLLBACK FAILURE'
done
pass 'rollback copy, rename, and verification faults leave API stopped and old DB preserved'

printf 'All %s SQLite backup/restore tests passed.\n' "$TEST_COUNT"
