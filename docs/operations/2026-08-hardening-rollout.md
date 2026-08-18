# August 2026 Hardening Rollout

This runbook rolls out the current local security, backup, backend, database,
and frontend hardening to Kamizo production. Run it from the repository root
`/Users/shaxzodisamahamadov/kamizo` unless a command explicitly uses SSH.

This is a staged production procedure, not a script. Execute one stage at a
time, record its output in the change ticket, and stop at every failed gate.
Do not skip ahead. In particular, migration `064` must not run until the
hash-only backend is live and verified.

The repository state observed while this runbook was authored contains
tracked modifications and untracked release artifacts. That is an objective
failed precondition, not evidence that this procedure is currently executable.
Stage 1 must abort until the reviewed release is committed, `RELEASE_SHA`
names that commit, and the checkout is completely clean.

## Safety Rules

- Production VPS: `kamizo@95.46.96.209` using `~/.ssh/kamizo_vps`.
- Live database: `/opt/kamizo/data/kamizo.db`.
- Backend destination: `/opt/kamizo/app/server-src/`.
- Backend service: `kamizo-api.service`, listening on `127.0.0.1:3000`.
- Public API health endpoint: `https://api.kamizo.uz/api/health`.
- Frontend origin: `https://app.kamizo.uz` and tenant subdomains.
- Never add `--delete` to backend `rsync`. Production contains files outside
  the repository.
- Never use Wrangler D1 commands for the VPS SQLite migration.
- Never print passwords, JWTs, or impersonation exchange codes into the
  change ticket. Redact command output before attaching it.
- A command below a line beginning `EXPLICIT CONFIRMATION REQUIRED` changes
  production state or can remove/replace data. A human change owner must type
  the stated confirmation into the ticket before that command is run.
- If a stop gate fails, stop the rollout. Do not compensate by applying later
  stages.
- Staging deployment is manual only. A push to `develop` runs checks and
  isolated E2E but cannot deploy. A staging deployment requires the protected
  GitHub `staging` environment and the manual boolean input
  `staging_config_verified=true`.

## Stage 0: Window And Release Identity

Choose a quiet window. Do not start while a meeting vote, payment import,
bulk request operation, or another deployment is active.

```bash
cd /Users/shaxzodisamahamadov/kamizo
read -r -p 'Last known deployed git SHA: ' BASE_SHA
read -r -p 'Hardening release git SHA: ' RELEASE_SHA
git rev-parse --verify "${BASE_SHA}^{commit}"
git rev-parse --verify "${RELEASE_SHA}^{commit}"
test "$(git rev-parse "${RELEASE_SHA}^{commit}")" = "$RELEASE_SHA"
git log --oneline --decorate "${BASE_SHA}..${RELEASE_SHA}"
```

Record `BASE_SHA`, `RELEASE_SHA`, UTC window start, operator, and change owner.
Keep two terminals: one for rollout and one for health/log observation.

**STOP GATE 0:** The change owner confirms the release range is exactly the
reviewed hardening scope and no conflicting production operation is active.

## Stage 1: Clean Diff And Secret Scan

First inspect the current checkout. The rollout must not be made from the
present working tree if any tracked, staged, or untracked change remains.

Before creating a reviewed release commit, run the selective staging dry-run.
It reads an explicit hardening/demo/admin UX allowlist, never runs `git add` or
`git commit`, and does not print unrelated user paths.

```bash
cd /Users/shaxzodisamahamadov/kamizo
./scripts/release-selective-staging.sh
```

The manifest is `release/selective-staging-manifest.txt`. It must reject
`.superpowers`, XLSX files, HTML reports, `cloudflare/public`, `dist`, test
results, Playwright reports, coverage, and Wrangler-generated artifacts.
Review every listed path against the ticket. Do not broaden the manifest to
make an unrelated dirty file disappear from the count.

**MANDATORY EXTERNAL SECURITY ACTION:** The current remote URL contains an
embedded credential. The dry-run detects this without printing the value. The
credential owner must revoke that PAT in GitHub, then replace the remote with a
credential-free HTTPS or SSH URL using an approved credential manager. This
runbook does not change Git configuration. Do not commit, push, or release
until both actions are independently confirmed in the ticket.

```bash
cd /Users/shaxzodisamahamadov/kamizo
git status --short
git diff --no-ext-diff
git diff --cached --no-ext-diff
git diff --check
if test -n "$(git status --porcelain=v1 --untracked-files=all)"; then
  printf '%s\n' 'ABORT: tracked, staged, or untracked files are present.' >&2
  exit 1
fi
test "$(git rev-parse HEAD^{commit})" = "$RELEASE_SHA"
test "$(git rev-parse "${RELEASE_SHA}^{commit}")" = "$RELEASE_SHA"
```

Run both a filesystem scan and a commit-range scan. Use Gitleaks v8; do not
replace findings with an informal grep.

```bash
command -v gitleaks
command -v jq
gitleaks version
gitleaks dir /Users/shaxzodisamahamadov/kamizo --redact --no-banner
gitleaks git /Users/shaxzodisamahamadov/kamizo --redact --no-banner --log-opts="${BASE_SHA}..${RELEASE_SHA}"
test -z "$(git grep -nE 'ENCRYPTION_KEY|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|password_plain|encryptPassword|decryptPassword' "$RELEASE_SHA" -- \
  'cloudflare/src/**/*.ts' 'cloudflare/wrangler.toml' 'cloudflare/wrangler.staging.toml' \
  'cloudflare/.env.example' 'src/frontend/src/**' 'deploy/**' 'scripts/**' \
  ':!cloudflare/src/**/__tests__/**' ':!cloudflare/src/**/*.test.ts' \
  ':!scripts/tests/**')"

# Explicit historical-only allowlist: inspect every match; none of these paths execute in production.
git grep -nE 'ENCRYPTION_KEY|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|password_plain|encryptPassword|decryptPassword' \
  "$RELEASE_SHA" -- 'cloudflare/migrations/**' 'cloudflare/src/**/__tests__/**' \
  'cloudflare/src/**/*.test.ts' 'scripts/tests/**' 'docs/**' '.superpowers/**' || test $? = 1
```

The runtime/config `git grep` must return no matches. The second grep is not a
pass/fail substitute: record and review every match in the explicit
historical migration/test/documentation allowlist. Gitleaks must exit `0`.

**STOP GATE 1:** Working tree is empty, `HEAD == RELEASE_SHA`, `git diff
--check` passes, and both Gitleaks scans pass. Any unexplained secret finding
blocks rollout and requires secret rotation if the value was ever committed.

## Stage 2: Verify Backup Code Locally

The backup/restore harness uses temporary databases only. It does not touch
production.

```bash
cd /Users/shaxzodisamahamadov/kamizo
bash -n deploy/systemd/kamizo-sqlite-backup.sh scripts/backup.sh scripts/restore.sh scripts/tests/sqlite_backup_restore_test.sh
bash scripts/tests/sqlite_backup_restore_test.sh
```

Expected final line: `All 31 SQLite backup/restore tests passed.` The exact
count may increase in a later reviewed release, but no test may fail or skip.

**STOP GATE 2:** Shell syntax and the complete isolated backup/restore suite
pass from `RELEASE_SHA`.

## Stage 3: Install Backup Units

Copy the reviewed worker, restore tool, services, and timers to `/tmp`.

```bash
cd /Users/shaxzodisamahamadov/kamizo
scp -i ~/.ssh/kamizo_vps \
  deploy/systemd/kamizo-sqlite-backup.sh \
  deploy/systemd/kamizo-backup-hourly.service \
  deploy/systemd/kamizo-backup-hourly.timer \
  deploy/systemd/kamizo-backup-daily.service \
  deploy/systemd/kamizo-backup-daily.timer \
  scripts/restore.sh \
  kamizo@95.46.96.209:/tmp/
```

Confirm required Linux tools and inspect source DB/disk before installation.

```bash
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 '
set -e
for command in sqlite3 flock runuser gzip sha256sum stat sync df awk dd jq; do command -v "$command"; done
test -s /opt/kamizo/data/kamizo.db
stat -c "%F %U:%G %a %s" /opt/kamizo/data/kamizo.db
df -h /opt/kamizo/data /opt/kamizo/backups 2>/dev/null || df -h /opt/kamizo/data
'
```

`kamizo-sqlite-backup.sh` requires free space of at least twice the live DB
size plus 512 MiB.

`EXPLICIT CONFIRMATION REQUIRED: INSTALL_BACKUP_UNITS` because installation
stops existing backup timers and replaces same-named scripts/unit files.

```bash
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 <<'EOF'
set -euo pipefail
for timer in kamizo-backup-hourly.timer kamizo-backup-daily.timer; do
  if systemctl cat "$timer" >/dev/null 2>&1; then
    sudo systemctl disable --now "$timer"
  fi
done
sudo install -d -o root -g root -m 755 /run/lock
lock_path=/run/lock/kamizo-backup.lock
sudo test ! -L "$lock_path"
if sudo test -e "$lock_path"; then
  sudo test -f "$lock_path"
else
  sudo test ! -L "$lock_path"
  lock_tmp=$(sudo mktemp /run/lock/.kamizo-backup.lock.XXXXXX)
  cleanup_lock_tmp() { test -z "${lock_tmp:-}" || sudo rm -f -- "$lock_tmp"; }
  trap cleanup_lock_tmp EXIT
  trap 'exit 1' HUP INT TERM
  sudo install -o root -g kamizo -m 0660 /dev/null "$lock_tmp"
  sudo test ! -e "$lock_path"
  sudo test ! -L "$lock_path"
  sudo ln "$lock_tmp" "$lock_path"
  sudo rm -f -- "$lock_tmp"
  lock_tmp=
  trap - EXIT HUP INT TERM
fi
sudo chown root:kamizo "$lock_path"
sudo chmod 0660 "$lock_path"
printf '%s\n' 'f /run/lock/kamizo-backup.lock 0660 root kamizo -' | \
  sudo tee /etc/tmpfiles.d/kamizo-backup.conf >/dev/null
sudo systemd-tmpfiles --create /etc/tmpfiles.d/kamizo-backup.conf
sudo install -d -o kamizo -g kamizo -m 700 /opt/kamizo/backups/sqlite
sudo install -d -o kamizo -g kamizo -m 700 /opt/kamizo/backups/sqlite/hourly
sudo install -d -o kamizo -g kamizo -m 700 /opt/kamizo/backups/sqlite/daily
sudo install -o root -g root -m 755 /tmp/kamizo-sqlite-backup.sh /usr/local/bin/
sudo install -o root -g root -m 755 /tmp/restore.sh /usr/local/sbin/kamizo-restore
sudo install -o root -g root -m 644 /tmp/kamizo-backup-hourly.service /etc/systemd/system/
sudo install -o root -g root -m 644 /tmp/kamizo-backup-hourly.timer /etc/systemd/system/
sudo install -o root -g root -m 644 /tmp/kamizo-backup-daily.service /etc/systemd/system/
sudo install -o root -g root -m 644 /tmp/kamizo-backup-daily.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl reset-failed kamizo-backup-hourly.service kamizo-backup-daily.service
EOF
```

Validate ownership, unit syntax/security, and that timers remain disabled
until the manual drill passes.

```bash
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 '
set -e
test "$(stat -c "%F %U:%G %a" /run/lock/kamizo-backup.lock)" = "regular empty file root:kamizo 660"
test "$(stat -c "%U:%G %a" /opt/kamizo/backups/sqlite/hourly)" = "kamizo:kamizo 700"
test "$(stat -c "%U:%G %a" /opt/kamizo/backups/sqlite/daily)" = "kamizo:kamizo 700"
sudo systemd-analyze verify /etc/systemd/system/kamizo-backup-hourly.service /etc/systemd/system/kamizo-backup-hourly.timer /etc/systemd/system/kamizo-backup-daily.service /etc/systemd/system/kamizo-backup-daily.timer
test "$(systemctl is-enabled kamizo-backup-hourly.timer || true)" = disabled
test "$(systemctl is-enabled kamizo-backup-daily.timer || true)" = disabled
'
```

**STOP GATE 3:** Lock and backup directories have the exact owner/mode,
`systemd-analyze verify` has no error, and neither timer has been enabled.

## Stage 4: Manual Backup And Restore Drill

The worker may remove invalid exact managed generations and enforce retention
(168 hourly, 35 daily). Review available disk and existing generations first.

```bash
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 '
set -e
du -sh /opt/kamizo/backups/sqlite/hourly /opt/kamizo/backups/sqlite/daily
sudo -u kamizo flock -n /run/lock/kamizo-backup.lock true
'
```

`EXPLICIT CONFIRMATION REQUIRED: RUN_VERIFIED_BACKUPS` because the workers
apply managed-generation cleanup and retention.

```bash
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 <<'EOF'
set -e
sudo -u kamizo /usr/local/bin/kamizo-sqlite-backup.sh hourly
sudo -u kamizo /usr/local/bin/kamizo-sqlite-backup.sh daily
latest_hourly=$(find /opt/kamizo/backups/sqlite/hourly -maxdepth 1 -name 'kamizo-hourly-*.db' -print | sort | tail -n 1)
latest_daily=$(find /opt/kamizo/backups/sqlite/daily -maxdepth 1 -name 'kamizo-daily-*.db.gz' -print | sort | tail -n 1)
for artifact in "$latest_hourly" "$latest_daily"; do
  test -n "$artifact"
  test -s "$artifact"
  test -s "$artifact.sha256"
  test -s "$artifact.json"
  sudo /usr/local/sbin/kamizo-restore --drill "$artifact"
done
printf 'DRILLED_HOURLY_BACKUP=%s\nDRILLED_DAILY_BACKUP=%s\n' "$latest_hourly" "$latest_daily"
EOF
```

Record both drilled paths. The drills are read-only with respect to the live
DB. Inspect journals for invalid-generation warnings or retries.

```bash
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 '
sudo journalctl -u kamizo-backup-hourly.service -u kamizo-backup-daily.service -n 100 --no-pager
'
```

`EXPLICIT CONFIRMATION REQUIRED: ENABLE_BACKUP_TIMERS` only after both manual
backups and the drill pass.

```bash
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 '
set -e
PRE_TIMER_LATEST=$(find /opt/kamizo/backups/sqlite/hourly -maxdepth 1 -name "kamizo-hourly-*.db" -print | sort | tail -n 1)
TIMER_ENABLED_EPOCH=$(date -u +%s)
TIMER_ENABLED_UTC=$(date -u "+%Y-%m-%d %H:%M:%S UTC")
sudo systemctl enable --now kamizo-backup-hourly.timer kamizo-backup-daily.timer
systemctl list-timers "kamizo-backup-*" --all --no-pager
systemctl show kamizo-backup-daily.timer -p NextElapseUSecRealtime
printf "PRE_TIMER_LATEST=%s\nTIMER_ENABLED_EPOCH=%s\nTIMER_ENABLED_UTC=%s\n" \
  "$PRE_TIMER_LATEST" "$TIMER_ENABLED_EPOCH" "$TIMER_ENABLED_UTC"
'
```

Expected: hourly has a next run, daily is scheduled for 03:30
`Asia/Tashkent`, and both timers are active. After the first timer-triggered
run, drill its resulting generation too. Record `PRE_TIMER_LATEST`,
`TIMER_ENABLED_EPOCH`, and `TIMER_ENABLED_UTC`; Stage 14 uses all three to
prove that it selected a new timer-era artifact rather than the manual one.

**STOP GATE 4:** Manual hourly and daily artifacts each have committed
artifact/checksum/manifest triples and pass `--drill`, no repeated
invalid-generation warning appears, and both timers have a next run.

## Stage 5: Backend Compilation And Tests

Run the full backend gate from the clean release checkout.

```bash
cd /Users/shaxzodisamahamadov/kamizo/cloudflare
npm ci
npx tsc --noEmit
npm test
npx vitest run src/routes/users/__tests__/password-security.test.ts
cd /Users/shaxzodisamahamadov/kamizo
git diff --check
test -z "$(git status --porcelain)"
```

Expected baseline for this release: backend TypeScript exits `0`; full suite
has at least 10 passing files and 382 passing tests; password security has at
least 45 passing tests. A higher reviewed count is acceptable; any failure is
not.

Verify forbidden runtime/config symbols remain absent. Matches inside the
password regression test and migration comments are expected and excluded.

```bash
cd /Users/shaxzodisamahamadov/kamizo
test -z "$(git grep -nE 'password_plain|ENCRYPTION_KEY|encryptPassword|decryptPassword' "$RELEASE_SHA" -- \
  'cloudflare/src/**/*.ts' 'cloudflare/wrangler.toml' 'cloudflare/wrangler.staging.toml' \
  'cloudflare/.env.example' ':!cloudflare/src/**/__tests__/**' \
  ':!cloudflare/src/**/*.test.ts')"
```

**STOP GATE 5:** TypeScript, all backend tests, focused password tests,
forbidden-symbol check, clean tree, and whitespace check all pass.

## Stage 6: Deploy Hash-Only Backend

Record the deployment timestamp before syncing.

```bash
DEPLOY_STARTED_UTC=$(date -u '+%Y-%m-%d %H:%M:%S UTC')
printf 'DEPLOY_STARTED_UTC=%s\n' "$DEPLOY_STARTED_UTC"
BACKEND_INTRODUCED_MANIFEST="/tmp/kamizo-backend-${RELEASE_SHA}.introduced"
git diff --name-only --diff-filter=ACR "$BASE_SHA" "$RELEASE_SHA" -- cloudflare/src/ |
  sed 's#^cloudflare/src/##' >"$BACKEND_INTRODUCED_MANIFEST"
if grep -nEv '^([A-Za-z0-9._-]+/)*[A-Za-z0-9._-]+$' "$BACKEND_INTRODUCED_MANIFEST"; then
  printf '%s\n' 'ABORT: unsafe path in introduced-file manifest.' >&2
  exit 1
fi
printf 'BACKEND_INTRODUCED_MANIFEST=%s\n' "$BACKEND_INTRODUCED_MANIFEST"
cat "$BACKEND_INTRODUCED_MANIFEST"
```

The service currently executes the fixed `/opt/kamizo/app/server-src` tree;
confirm that fact with `systemctl cat kamizo-api.service` before continuing.
Therefore this rollout cannot safely switch to immutable release directories.
The target design for a later service-unit change is
`/opt/kamizo/app/releases/<SHA>/server-src` plus an atomically replaced
`/opt/kamizo/app/current` symlink. Until the unit's `ExecStart` uses that
symlink, this rollout records and validates a precise introduced-file manifest
for rollback instead.

`EXPLICIT CONFIRMATION REQUIRED: DEPLOY_HASH_ONLY_BACKEND` because this syncs
server code and restarts the live API.

```bash
cd /Users/shaxzodisamahamadov/kamizo
scp -i ~/.ssh/kamizo_vps "$BACKEND_INTRODUCED_MANIFEST" \
  kamizo@95.46.96.209:/tmp/
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 "
set -e
systemctl cat kamizo-api.service | grep -F '/opt/kamizo/app/server-src'
while IFS= read -r relative_path; do
  test -n \"\$relative_path\" || continue
  case \"\$relative_path\" in (*..*|/*) exit 1;; esac
  test ! -e \"/opt/kamizo/app/server-src/\$relative_path\"
  test ! -L \"/opt/kamizo/app/server-src/\$relative_path\"
done </tmp/$(basename "$BACKEND_INTRODUCED_MANIFEST")
sudo install -d -o root -g root -m 755 /opt/kamizo/app/release-manifests
test ! -e /opt/kamizo/app/release-manifests/${RELEASE_SHA}.introduced
sudo install -o root -g root -m 644 \
  /tmp/$(basename "$BACKEND_INTRODUCED_MANIFEST") \
  /opt/kamizo/app/release-manifests/${RELEASE_SHA}.introduced
"
rsync -avz -e "ssh -i ~/.ssh/kamizo_vps" \
  cloudflare/src/ \
  kamizo@95.46.96.209:/opt/kamizo/app/server-src/
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 \
  'sudo systemctl restart kamizo-api.service'
```

The `rsync` command intentionally has no `--delete`. Record the manifest path
and contents in the ticket; rollback depends on that immutable copy.

Unauthenticated rate-limit identity depends on the production nginx boundary:
nginx must overwrite `X-Real-IP` with `$remote_addr` and append, rather than
replace or trust, `X-Forwarded-For`. The VPS application does not trust
`CF-Connecting-IP`; that fallback is enabled only when Cloudflare Worker
request metadata is present. Do not expose port `3000` directly or change
these proxy-header directives without a security review.

**STOP GATE 6:** `rsync` and restart both exit `0`. Proceed immediately to
Stage 7; do not perform any migration or frontend action before its checks.

## Stage 7: Backend Health, Logs, And Hash-Only Proof

Check the service locally on the VPS and externally through nginx.

```bash
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 '
set -e
systemctl is-active kamizo-api.service
systemctl show kamizo-api.service -p ActiveState -p SubState -p NRestarts -p ExecMainStatus
INTERNAL_HEALTH=$(curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3000/api/health)
printf "%s\n" "$INTERNAL_HEALTH" | jq -e '.status == "healthy" and .checks.database == true'
'
PUBLIC_HEALTH=$(curl --fail --silent --show-error --max-time 10 https://api.kamizo.uz/api/health)
printf '%s\n' "$PUBLIC_HEALTH" | jq -e '.status == "healthy" and .checks.database == true'
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 \
  "sudo journalctl -u kamizo-api.service --since '$DEPLOY_STARTED_UTC' --no-pager"
```

Prove that the deployed backend, not merely the local checkout, is hash-only.

```bash
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 '
set -e
if grep -RInE "password_plain|ENCRYPTION_KEY|encryptPassword|decryptPassword" /opt/kamizo/app/server-src --include="*.ts" --exclude="*.test.ts"; then
  echo "forbidden reversible-password runtime symbol found" >&2
  exit 1
fi
'
```

Perform one real login without exposing credentials in argv or output.

```bash
cleanup_auth_material() {
  unset TENANT_PASSWORD TENANT_TOKEN MANAGEMENT_PASSWORD MANAGEMENT_TOKEN
  unset RESIDENT_PASSWORD RESIDENT_LOGIN_JSON RESIDENT_TOKEN
  unset SUPER_ADMIN_PASSWORD SUPER_ADMIN_TOKEN IMPERSONATION_CREATE
  unset EXCHANGE_CODE EXCHANGE_BODY EXCHANGE_RESPONSE
}
trap cleanup_auth_material EXIT
trap 'cleanup_auth_material; exit 1' HUP INT TERM
cleanup_auth_material
read -r -p 'Known tenant slug: ' TENANT_SLUG
read -r -p 'Known tenant login: ' TENANT_LOGIN
read -r -s -p 'Known tenant password: ' TENANT_PASSWORD; printf '\n'
TENANT_TOKEN=$(
  jq -nc --arg login "$TENANT_LOGIN" --arg password "$TENANT_PASSWORD" --arg tenantSlug "$TENANT_SLUG" \
    '{login:$login,password:$password,tenantSlug:$tenantSlug}' |
  curl --fail --silent --show-error --max-time 10 \
    -H 'Content-Type: application/json' --data-binary @- \
    https://api.kamizo.uz/api/auth/login |
  jq -er '.token'
)
test -n "$TENANT_TOKEN"
unset TENANT_PASSWORD TENANT_TOKEN
```

**STOP GATE 7:** Service is active without restart loop, internal and external
health return HTTP 200 with `status=healthy` and `checks.database=true`,
post-restart journal has no new uncaught/SQLite errors, deployed runtime grep
is empty, and a known existing user logs in successfully. Do not apply
migration `064` otherwise.

## Stage 8: Migration 064 Preflight And Pre-Backup

The live database is the only schema source of truth. Inspect it directly.

```bash
MIGRATION_PREFLIGHT=$(
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 <<'EOF'
set -e
sqlite_version=$(sqlite3 /opt/kamizo/data/kamizo.db 'SELECT sqlite_version();')
test "$(printf '%s\n' 3.35.0 "$sqlite_version" | sort -V | head -n 1)" = 3.35.0
sqlite3 -header -column /opt/kamizo/data/kamizo.db 'PRAGMA table_info(users);'
sqlite3 -header -column /opt/kamizo/data/kamizo.db 'PRAGMA index_list(users);'
users_before=$(sqlite3 /opt/kamizo/data/kamizo.db 'SELECT COUNT(*) FROM users;')
missing_hashes=$(sqlite3 /opt/kamizo/data/kamizo.db "SELECT COUNT(*) FROM users WHERE password_hash IS NULL OR trim(password_hash) = '';" )
legacy_columns=$(sqlite3 /opt/kamizo/data/kamizo.db "SELECT COUNT(*) FROM pragma_table_info('users') WHERE name = 'password_plain';")
test "$missing_hashes" = 0
case "$legacy_columns" in
  0) migration_state=already_applied; legacy_values=not_applicable ;;
  1) migration_state=ready; legacy_values=$(sqlite3 /opt/kamizo/data/kamizo.db "SELECT COUNT(*) FROM users WHERE password_plain IS NOT NULL AND trim(password_plain) != '';") ;;
  *) echo "unexpected password_plain column count: $legacy_columns" >&2; exit 1 ;;
esac
printf 'sqlite_version=%s\nusers_before=%s\nmissing_hashes=%s\nlegacy_columns=%s\nlegacy_values=%s\nmigration_state=%s\n' \
  "$sqlite_version" "$users_before" "$missing_hashes" "$legacy_columns" "$legacy_values" "$migration_state"
sqlite3 /opt/kamizo/data/kamizo.db 'PRAGMA integrity_check;'
test -z "$(sqlite3 /opt/kamizo/data/kamizo.db 'PRAGMA foreign_key_check;')"
EOF
)
printf '%s\n' "$MIGRATION_PREFLIGHT"
MIGRATION_STATE=$(printf '%s\n' "$MIGRATION_PREFLIGHT" | awk -F= '$1 == "migration_state" { print $2 }')
case "$MIGRATION_STATE" in
  ready) printf '%s\n' 'BRANCH: ready; create the pre-migration backup, then Stage 9 may execute migration 064.' ;;
  already_applied) printf '%s\n' 'BRANCH: already_applied; skip backup-for-change and migration execution, then run Stage 9 verification only.' ;;
  *) printf 'ABORT: invalid migration state: %s\n' "$MIGRATION_STATE" >&2; exit 1 ;;
esac
```

SQLite must be at least 3.35 for `DROP COLUMN`. `missing_hashes` must be `0`.
If `password_plain` is already absent, do not rerun migration `064`; record it
as already applied and continue with the post-migration verification. If it
exists, it must appear exactly once in `PRAGMA table_info(users)`.

Only the `ready` branch creates and drills a dedicated immediate
pre-migration backup. The `already_applied` branch performs no migration and
must not pretend a new pre-migration recovery point was created.

`EXPLICIT CONFIRMATION REQUIRED: CREATE_PRE_MIGRATION_BACKUP` because the
worker enforces managed-generation cleanup and retention.

```bash
test "$MIGRATION_STATE" = ready
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 <<'EOF'
set -e
sudo -u kamizo /usr/local/bin/kamizo-sqlite-backup.sh hourly
PRE_MIGRATION_BACKUP=$(find /opt/kamizo/backups/sqlite/hourly -maxdepth 1 -name 'kamizo-hourly-*.db' -print | sort | tail -n 1)
test -n "$PRE_MIGRATION_BACKUP"
sudo /usr/local/sbin/kamizo-restore --drill "$PRE_MIGRATION_BACKUP"
printf 'PRE_MIGRATION_BACKUP=%s\n' "$PRE_MIGRATION_BACKUP"
EOF
```

Record the exact `PRE_MIGRATION_BACKUP` path and `users_before` count.

**STOP GATE 8:** Hash-only backend gate passed, SQLite version supports drop,
all users have a non-empty hash, and live DB integrity/FK checks pass. For
`ready`, the immediate committed backup must also pass a restore drill. For
`already_applied`, record that branch and proceed only to Stage 9 verification.

## Stage 9: Apply Migration 064

Re-read the live state immediately before any copy or execution. This is the
authoritative branch guard even if the Stage 8 shell or ticket value is stale.

```bash
MIGRATION_STATE=$(
  ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 \
    'case "$(sqlite3 /opt/kamizo/data/kamizo.db "SELECT COUNT(*) FROM pragma_table_info('"'"'users'"'"') WHERE name = '"'"'password_plain'"'"';")" in 0) echo already_applied;; 1) echo ready;; *) exit 1;; esac'
)
case "$MIGRATION_STATE" in
  ready) printf '%s\n' 'BRANCH: ready; migration execution is permitted after confirmation.' ;;
  already_applied) printf '%s\n' 'BRANCH: already_applied; do not copy or execute migration 064.' ;;
  *) printf 'ABORT: invalid migration state: %s\n' "$MIGRATION_STATE" >&2; exit 1 ;;
esac
```

In the `ready` branch only, copy the reviewed migration and compare its
checksum on both hosts.

```bash
cd /Users/shaxzodisamahamadov/kamizo
test "$MIGRATION_STATE" = ready
shasum -a 256 cloudflare/migrations/064_drop_password_plain.sql
scp -i ~/.ssh/kamizo_vps cloudflare/migrations/064_drop_password_plain.sql \
  kamizo@95.46.96.209:/tmp/
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 \
  'sha256sum /tmp/064_drop_password_plain.sql'
```

The two SHA-256 values must match.

`EXPLICIT CONFIRMATION REQUIRED: DROP_USERS_PASSWORD_PLAIN` because migration
`064` drops an index and column. Confirm the recorded pre-migration backup
path in the ticket immediately before execution.

```bash
test "$MIGRATION_STATE" = ready
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 \
  'test "$(sqlite3 /opt/kamizo/data/kamizo.db "SELECT COUNT(*) FROM pragma_table_info('"'"'users'"'"') WHERE name = '"'"'password_plain'"'"';")" = 1 && sqlite3 -bail /opt/kamizo/data/kamizo.db < /tmp/064_drop_password_plain.sql'
```

Migration 064 also sets `.bail on`, waits up to 30 seconds for the write lock,
and wraps the index/column changes in `BEGIN IMMEDIATE`/`COMMIT`. On the first
error sqlite3 exits before `COMMIT`; connection close rolls back the open
transaction, including the index drop. Treat any non-zero exit as not applied
and rerun the complete preflight before deciding what to do next.

For `already_applied`, skip every copy/checksum/confirmation/execution command
above and start here. Both branches run the same verification.

Verify schema, row preservation, hashes, indexes, integrity, and service.

```bash
read -r -p 'Expected users_before count: ' USERS_BEFORE
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 "
set -e
test \"\$(sqlite3 /opt/kamizo/data/kamizo.db \"SELECT COUNT(*) FROM pragma_table_info('users') WHERE name = 'password_plain';\")\" = 0
test \"\$(sqlite3 /opt/kamizo/data/kamizo.db \"SELECT COUNT(*) FROM pragma_index_list('users') WHERE name = 'idx_users_password_plain';\")\" = 0
test \"\$(sqlite3 /opt/kamizo/data/kamizo.db 'SELECT COUNT(*) FROM users;')\" = '$USERS_BEFORE'
test \"\$(sqlite3 /opt/kamizo/data/kamizo.db \"SELECT COUNT(*) FROM users WHERE password_hash IS NULL OR trim(password_hash) = '';\")\" = 0
test \"\$(sqlite3 /opt/kamizo/data/kamizo.db 'PRAGMA integrity_check;')\" = ok
test -z \"\$(sqlite3 /opt/kamizo/data/kamizo.db 'PRAGMA foreign_key_check;')\"
systemctl is-active kamizo-api.service
HEALTH=\$(curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3000/api/health)
printf '%s\n' "\$HEALTH" | jq -e '.status == "healthy" and .checks.database == true'
"
PUBLIC_HEALTH=$(curl --fail --silent --show-error --max-time 10 https://api.kamizo.uz/api/health)
printf '%s\n' "$PUBLIC_HEALTH" | jq -e '.status == "healthy" and .checks.database == true'
```

Repeat the known-user login from Stage 7 and confirm it succeeds.

**STOP GATE 9:** Legacy column/index are absent, user count is unchanged,
every user retains a hash, integrity/FK checks pass, API remains healthy, and
an existing user can log in. For the `ready` branch, keep the pre-migration
backup and its recorded path. For `already_applied`, record that no migration
or new pre-migration backup ran during this rollout.

## Stage 10: Frontend Tests And Build

Build only after backend and migration are stable.

```bash
cd /Users/shaxzodisamahamadov/kamizo/src/frontend
npm ci
npm run typecheck
npm run test:unit
npm run test:e2e:harness
npm run test:e2e:isolated
npm run build
npm run verify:bundle-budget
npm run test:e2e:smoke
```

The isolated E2E harness uses local Wrangler/D1/KV state and blocks production
origin access. All commands must exit `0`.

**STOP GATE 10:** Frontend types, unit tests, isolated E2E, build, bundle
budget, and read-only app-shell smoke pass.

### Optional manual staging gate

Staging resource IDs are intentionally not invented. Until valid D1 and KV IDs
are entered in `cloudflare/wrangler.staging.toml`, this command must fail:

```bash
cd /Users/shaxzodisamahamadov/kamizo
./scripts/preflight-staging-config.sh cloudflare/wrangler.staging.toml
```

The preflight also rejects a live `ConnectionManager` binding or creation
migration because that class was removed. After an authorized operator enters
real staging IDs and verifies the Cloudflare-side class migration state, run
the preflight again and record its output. Never copy production binding IDs
into staging.

The repository `staging` GitHub environment must have required reviewers
configured before dispatch. Then staging may be requested only from `develop`:

```bash
gh workflow run deploy.yml --ref develop -f staging_config_verified=true
gh run watch --exit-status
```

Approve the protected `staging` environment only after comparing the reviewed
config to the recorded Cloudflare staging resources. The workflow reruns the
develop checks and isolated E2E, executes the preflight before Wrangler, and
verifies the staging bundle afterward. `scripts/deploy-staging.sh` and direct
local Wrangler commands are not approved release paths.

**STAGING STOP GATE:** A normal `develop` push performed checks only; the
manual input is true; the protected environment approval is recorded; the
preflight passes with non-empty staging IDs and no stale class; and no local
deploy command was used.

## Stage 11: Copy And Deploy Frontend

### OTP legal rollout stop gate

`require_otp=1` is not currently enforced by meeting voting. The route ignores
client OTP claims and honestly records `verification_method=login` with
`otp_verified=0`. This is an explicit external rollout blocker, not an OTP fix.

**STOP GATE 11A:** Do not classify, market, approve, or deploy meeting-voting
changes as legally OTP-compliant until the OTP provider and per-tenant rollout
decision are documented, and delivery, schema-aligned verification, attempt
limits, frontend UX, and server enforcement have passed their own rollout.
Unrelated releases may continue only with this limitation recorded in the
change ticket.

### Manual backend-first dispatch

Production deployment is not triggered by a `main` push. The GitHub workflow
builds and copies assets itself, so do not run Wrangler locally for this stage.
Complete the backend deploy, migration checks, Stage 7 login smoke, Stage 9 API
health checks, and Stage 10 local isolated E2E first.

From a shell with GitHub CLI access:

```bash
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 \
  'curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3000/api/health'
curl --fail --silent --show-error --max-time 10 https://api.kamizo.uz/api/health
gh workflow run deploy.yml --ref main -f backend_release_verified=true
gh run watch --exit-status
```

Equivalent GitHub UI sequence:

1. Open Actions -> `Deploy to Cloudflare` -> `Run workflow`.
2. Select branch `main`.
3. Confirm the backend release and both health smokes are complete.
4. Check `Backend deployed and smoke-tested on VPS`.
5. Run the workflow and approve the protected `production` environment.

The production job fails or skips unless the event is `workflow_dispatch`, the
ref is exactly `refs/heads/main`, and the boolean input is true. It runs unit,
type, build, backend, and full local-only isolated E2E gates before Wrangler.
Wrangler success alone is not a pass.

## Stage 12: Production Bundle Verification

Use the repository verifier, which fetches the current index, follows its
actual `/assets/*.js` entry, and requires HTTP 200, JavaScript content type,
and a body larger than 100 KiB.

```bash
cd /Users/shaxzodisamahamadov/kamizo
./scripts/verify-frontend-bundle.sh https://app.kamizo.uz
PUBLIC_HEALTH=$(curl --fail --silent --show-error --max-time 10 https://api.kamizo.uz/api/health)
printf '%s\n' "$PUBLIC_HEALTH" | jq -e '.status == "healthy" and .checks.database == true'
```

Also bypass edge cache when identifying the deployed bundle.

```bash
MAIN=$(curl --fail --silent --show-error "https://app.kamizo.uz/?t=$(date +%s)" | perl -0ne 'print "$1\n" if /src="(\/assets\/index-[^"]+\.js)"/')
test -n "$MAIN"
curl --fail --silent --show-error -D /tmp/kamizo-bundle.headers -o /tmp/kamizo-bundle.js "https://app.kamizo.uz${MAIN}"
grep -iE '^content-type: (text|application)/(x-)?javascript' /tmp/kamizo-bundle.headers
test "$(wc -c < /tmp/kamizo-bundle.js | tr -d '[:space:]')" -gt 102400
```

If verification fails once, inspect headers and Cloudflare output. A second
deploy is allowed only through a new verified manual workflow dispatch. Do not
bypass the backend-first gate with a local Wrangler command.

`EXPLICIT CONFIRMATION REQUIRED: RETRY_FRONTEND_DEPLOY_AFTER_MANIFEST_FAILURE`

```bash
gh workflow run deploy.yml --ref main -f backend_release_verified=true
gh run watch --exit-status
./scripts/verify-frontend-bundle.sh https://app.kamizo.uz
PUBLIC_HEALTH=$(curl --fail --silent --show-error --max-time 10 https://api.kamizo.uz/api/health)
printf '%s\n' "$PUBLIC_HEALTH" | jq -e '.status == "healthy" and .checks.database == true'
```

If the second verification fails, stop and run the frontend rollback in the
rollback section.

**STOP GATE 12:** The cache-busted index names a real bundle, bundle is HTTP
200 JavaScript and greater than 100 KiB, and public API health is healthy.

## Stage 13: Read-Only Functional Smoke

Use dedicated smoke accounts. The commands below do not mutate meetings,
payments, or requests. Read passwords silently and pipe request bodies so
passwords do not appear in process arguments. The Stage 7 `TENANT_TOKEN` was
intentionally unset; if this stage later needs it, regenerate it inside this
trap-protected block rather than carrying it forward.

```bash
cleanup_auth_material() {
  unset TENANT_PASSWORD TENANT_TOKEN MANAGEMENT_PASSWORD MANAGEMENT_TOKEN
  unset RESIDENT_PASSWORD RESIDENT_LOGIN_JSON RESIDENT_TOKEN
  unset SUPER_ADMIN_PASSWORD SUPER_ADMIN_TOKEN IMPERSONATION_CREATE
  unset EXCHANGE_CODE EXCHANGE_BODY EXCHANGE_RESPONSE
}
trap cleanup_auth_material EXIT
trap 'cleanup_auth_material; exit 1' HUP INT TERM
cleanup_auth_material
read -r -p 'Tenant origin, e.g. https://slug.kamizo.uz: ' TENANT_ORIGIN
read -r -p 'Tenant slug: ' TENANT_SLUG
read -r -p 'Management login: ' MANAGEMENT_LOGIN
read -r -s -p 'Management password: ' MANAGEMENT_PASSWORD; printf '\n'
MANAGEMENT_TOKEN=$(
  jq -nc --arg login "$MANAGEMENT_LOGIN" --arg password "$MANAGEMENT_PASSWORD" --arg tenantSlug "$TENANT_SLUG" \
    '{login:$login,password:$password,tenantSlug:$tenantSlug}' |
  curl --fail --silent --show-error -H "Origin: $TENANT_ORIGIN" -H 'Content-Type: application/json' \
    --data-binary @- https://api.kamizo.uz/api/auth/login | jq -er '.token'
)
unset MANAGEMENT_PASSWORD

read -r -p 'Resident login: ' RESIDENT_LOGIN
read -r -s -p 'Resident password: ' RESIDENT_PASSWORD; printf '\n'
RESIDENT_LOGIN_JSON=$(
  jq -nc --arg login "$RESIDENT_LOGIN" --arg password "$RESIDENT_PASSWORD" --arg tenantSlug "$TENANT_SLUG" \
    '{login:$login,password:$password,tenantSlug:$tenantSlug}' |
  curl --fail --silent --show-error -H "Origin: $TENANT_ORIGIN" -H 'Content-Type: application/json' \
    --data-binary @- https://api.kamizo.uz/api/auth/login
)
RESIDENT_TOKEN=$(jq -er '.token' <<<"$RESIDENT_LOGIN_JSON")
RESIDENT_APARTMENT_ID=$(jq -er '.user.apartment_id' <<<"$RESIDENT_LOGIN_JSON")
unset RESIDENT_PASSWORD RESIDENT_LOGIN_JSON
```

Meeting smoke:

```bash
curl --fail --silent --show-error -H "Authorization: Bearer $MANAGEMENT_TOKEN" \
  https://api.kamizo.uz/api/meetings | jq -e '.meetings | type == "array"'
curl --fail --silent --show-error -H "Authorization: Bearer $RESIDENT_TOKEN" \
  https://api.kamizo.uz/api/meetings | jq -e '.meetings | type == "array"'
```

Request smoke:

```bash
curl --fail --silent --show-error -H "Authorization: Bearer $MANAGEMENT_TOKEN" \
  'https://api.kamizo.uz/api/requests?page=1&limit=1' | jq -e '.requests | type == "array"'
curl --fail --silent --show-error -H "Authorization: Bearer $RESIDENT_TOKEN" \
  'https://api.kamizo.uz/api/requests?page=1&limit=1' | jq -e '.requests | type == "array"'
```

Payment smoke:

```bash
curl --fail --silent --show-error -H "Authorization: Bearer $MANAGEMENT_TOKEN" \
  'https://api.kamizo.uz/api/finance/payments?page=1&limit=1' | jq -e '.data | type == "array"'
curl --fail --silent --show-error -H "Authorization: Bearer $RESIDENT_TOKEN" \
  "https://api.kamizo.uz/api/apartments/${RESIDENT_APARTMENT_ID}/balance" |
  jq -e 'has("apartment_id") and has("balance")'
```

Impersonation smoke uses a dedicated super-admin account and a known tenant
ID. It verifies the one-time exchange and replay rejection without printing
the exchanged JWT or code.

```bash
read -r -p 'Super-admin login: ' SUPER_ADMIN_LOGIN
read -r -s -p 'Super-admin password: ' SUPER_ADMIN_PASSWORD; printf '\n'
SUPER_ADMIN_TOKEN=$(
  jq -nc --arg login "$SUPER_ADMIN_LOGIN" --arg password "$SUPER_ADMIN_PASSWORD" \
    '{login:$login,password:$password}' |
  curl --fail --silent --show-error -H 'Content-Type: application/json' --data-binary @- \
    https://api.kamizo.uz/api/auth/login | jq -er '.token'
)
unset SUPER_ADMIN_PASSWORD
read -r -p 'Tenant ID to impersonate: ' IMPERSONATE_TENANT_ID
IMPERSONATION_CREATE=$(
  jq -nc --arg originUrl "$TENANT_ORIGIN" '{originUrl:$originUrl}' |
  curl --fail --silent --show-error -H "Authorization: Bearer $SUPER_ADMIN_TOKEN" \
    -H 'Content-Type: application/json' --data-binary @- \
    "https://api.kamizo.uz/api/super-admin/impersonate/${IMPERSONATE_TENANT_ID}"
)
EXCHANGE_CODE=$(jq -er '.exchangeCode' <<<"$IMPERSONATION_CREATE")
test "$(jq -er '.ttlSec' <<<"$IMPERSONATION_CREATE")" = 60
EXCHANGE_BODY=$(jq -nc --arg code "$EXCHANGE_CODE" '{code:$code}')
EXCHANGE_RESPONSE=$(
  printf '%s' "$EXCHANGE_BODY" |
  curl --fail --silent --show-error -H "Origin: $TENANT_ORIGIN" \
    -H 'Content-Type: application/json' --data-binary @- \
    https://api.kamizo.uz/api/auth/impersonation-exchange
)
jq -e '.token and .user and .tenantName' <<<"$EXCHANGE_RESPONSE" >/dev/null
REPLAY_STATUS=$(
  printf '%s' "$EXCHANGE_BODY" |
  curl --silent --show-error -o /dev/null -w '%{http_code}' \
    -H "Origin: $TENANT_ORIGIN" -H 'Content-Type: application/json' \
    --data-binary @- https://api.kamizo.uz/api/auth/impersonation-exchange
)
test "$REPLAY_STATUS" = 400
cleanup_auth_material
```

Finally open `TENANT_ORIGIN` in a private desktop browser and a mobile-sized
viewport. Confirm login, dashboard navigation, meeting list, request list,
payment list/balance, and super-admin "enter company" return no blank screen,
horizontal overflow, stale previous-user data, or console error. Do not create
a payment, cast a meeting vote, or transition a request during this smoke.

**STOP GATE 13:** Both management and resident reads pass for meetings,
requests, and payments; impersonation succeeds once and replay returns 400;
desktop/mobile browser smoke is clean; API journal has no corresponding 5xx.

## Stage 14: Final Observation

Observe at least one normal traffic interval and one hourly backup trigger.

```bash
PUBLIC_HEALTH=$(curl --fail --silent --show-error --max-time 10 https://api.kamizo.uz/api/health)
printf '%s\n' "$PUBLIC_HEALTH" | jq -e '.status == "healthy" and .checks.database == true'
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 '
set -e
systemctl is-active kamizo-api.service kamizo-backup-hourly.timer kamizo-backup-daily.timer
systemctl show kamizo-api.service -p NRestarts -p ExecMainStatus
systemctl list-timers "kamizo-backup-*" --all --no-pager
sudo journalctl -u kamizo-api.service -u kamizo-backup-hourly.service -u kamizo-backup-daily.service -n 200 --no-pager
'
```

Drill the first timer-created hourly generation, not merely the earlier manual
one.

```bash
read -r -p 'Recorded PRE_TIMER_LATEST (empty is allowed): ' PRE_TIMER_LATEST
read -r -p 'Recorded TIMER_ENABLED_EPOCH: ' TIMER_ENABLED_EPOCH
case "$PRE_TIMER_LATEST" in
  ''|/opt/kamizo/backups/sqlite/hourly/kamizo-hourly-*.db) ;;
  *) printf '%s\n' 'ABORT: invalid PRE_TIMER_LATEST path.' >&2; exit 1 ;;
esac
case "$TIMER_ENABLED_EPOCH" in (*[!0-9]*|'') exit 1;; esac
test "$TIMER_ENABLED_EPOCH" -gt 0
PRE_TIMER_LATEST_ARG=${PRE_TIMER_LATEST:-__none__}
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 \
  bash -s -- "$PRE_TIMER_LATEST_ARG" "$TIMER_ENABLED_EPOCH" <<'EOF'
set -euo pipefail
pre_trigger_latest=$1
timer_enabled_epoch=$2
test "$pre_trigger_latest" != __none__ || pre_trigger_latest=
latest=$(find /opt/kamizo/backups/sqlite/hourly -maxdepth 1 -name 'kamizo-hourly-*.db' -print | sort | tail -n 1)
test -n "$latest"
test "$latest" != "$pre_trigger_latest"
latest_epoch=$(stat -c %Y "$latest")
test "$latest_epoch" -ge "$timer_enabled_epoch"
last_trigger=$(systemctl show kamizo-backup-hourly.timer -p LastTriggerUSec --value)
test -n "$last_trigger"
test "$last_trigger" != n/a
last_trigger_epoch=$(date -u -d "$last_trigger" +%s)
test "$last_trigger_epoch" -ge "$timer_enabled_epoch"
test "$latest_epoch" -ge "$last_trigger_epoch"
test -s "$latest"
test -s "$latest.sha256"
test -s "$latest.json"
sudo /usr/local/sbin/kamizo-restore --drill "$latest"
printf 'TIMER_LAST_TRIGGER=%s\nTIMER_ARTIFACT=%s\nTIMER_ARTIFACT_EPOCH=%s\nTIMER_ARTIFACT_UTC=%s\n' \
  "$last_trigger" "$latest" "$latest_epoch" "$(date -u -d "@$latest_epoch" '+%Y-%m-%d %H:%M:%S UTC')"
EOF
```

**STOP GATE 14:** No restart loop/new 5xx, health remains healthy, both timers
remain active, and an artifact different from `PRE_TIMER_LATEST`, timestamped
no earlier than both `TIMER_ENABLED_EPOCH` and the timer's recorded last
trigger, passes a restore drill. Record its path and timestamps. The rollout
is complete only after this gate.

## Rollback: Backend Before Migration 064

Use this only if Stages 6-7 fail and migration `064` has not run. Prepare the
previous backend from the recorded `BASE_SHA` without altering the main
checkout.

This fixed-path rollback is not exact if it only rsyncs the old tree: rsync
without `--delete` leaves files introduced by the failed release. Immutable
release directories plus a `current` symlink are the preferred future design,
but are not compatible until `kamizo-api.service` is changed as described in
Stage 6. For the current unit, remove only paths from the validated
release-specific introduced-file manifest; never run a broad delete.

```bash
ROLLBACK_DIR=$(mktemp -d)
git -C /Users/shaxzodisamahamadov/kamizo archive "$BASE_SHA" cloudflare/src | tar -x -C "$ROLLBACK_DIR"
test -d "$ROLLBACK_DIR/cloudflare/src"
```

`EXPLICIT CONFIRMATION REQUIRED: ROLLBACK_BACKEND_TO_BASE_SHA` because this
changes live code and restarts the API.

```bash
rsync -avz -e "ssh -i ~/.ssh/kamizo_vps" \
  "$ROLLBACK_DIR/cloudflare/src/" \
  kamizo@95.46.96.209:/opt/kamizo/app/server-src/
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 "
set -e
manifest=/opt/kamizo/app/release-manifests/${RELEASE_SHA}.introduced
test -f \"\$manifest\"
while IFS= read -r relative_path; do
  test -n \"\$relative_path\" || continue
  case \"\$relative_path\" in (*..*|/*) exit 1;; esac
  target=/opt/kamizo/app/server-src/\$relative_path
  if test -e \"\$target\" || test -L \"\$target\"; then
    rm -f -- \"\$target\"
  fi
done <\"\$manifest\"
sudo systemctl restart kamizo-api.service
systemctl is-active kamizo-api.service
"
PUBLIC_HEALTH=$(curl --fail --silent --show-error --max-time 10 https://api.kamizo.uz/api/health)
printf '%s\n' "$PUBLIC_HEALTH" | jq -e '.status == "healthy" and .checks.database == true'
```

Never add `--delete`. Confirm the restored release with its focused smoke.

## Rollback: After Migration 064

Do not deploy a backend that reads or writes `password_plain` after migration
`064`. The preferred application rollback is another known-good hash-only
backend release, using the backend rollback procedure above with that SHA.

If the migration itself caused a database incident, restore the recorded
`PRE_MIGRATION_BACKUP`. This replaces the entire live database and loses all
writes made after that backup. First stop the change, communicate the data-loss
window, and obtain incident-owner approval. The restore tool performs its own
emergency backup, service/timer serialization, integrity checks, health check,
and automatic rollback attempt.

`EXPLICIT CONFIRMATION REQUIRED: RESTORE_PRE_MIGRATION_DATABASE_WITH_KNOWN_DATA_LOSS`

```bash
read -r -p 'Exact drilled PRE_MIGRATION_BACKUP path: ' PRE_MIGRATION_BACKUP
ssh -t -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 \
  "sudo /usr/local/sbin/kamizo-restore --apply '$PRE_MIGRATION_BACKUP' --confirm RESTORE"
POST_RESTORE_HEALTH=$(curl --fail --silent --show-error --max-time 10 \
  https://api.kamizo.uz/api/health)
printf '%s\n' "$POST_RESTORE_HEALTH" |
  jq -e '.status == "healthy" and .checks.database == true'
```

**ROLLBACK STOP GATE:** The restore command must exit `0`, and the parsed
public health response must return `status=healthy` and
`checks.database=true`. Stop rollback verification and escalate if either
check fails; do not declare the database restored.

After restore, verify `password_plain` exists again, row count matches the
recorded pre-migration count, integrity/FK checks pass, API is healthy, and a
known user can log in. Keep the restored hash-only backend live. Never treat
`ALTER TABLE ... ADD COLUMN password_plain` as data rollback: it cannot
recover removed legacy values.

## Rollback: Frontend

Use the version ID recorded before Stage 11.

```bash
cd /Users/shaxzodisamahamadov/kamizo/cloudflare
npx wrangler versions view "$CF_PREVIOUS_VERSION"
```

`EXPLICIT CONFIRMATION REQUIRED: ROLLBACK_FRONTEND_VERSION` because this
changes the live Worker/static asset deployment.

```bash
cd /Users/shaxzodisamahamadov/kamizo/cloudflare
npx wrangler rollback "$CF_PREVIOUS_VERSION"
cd /Users/shaxzodisamahamadov/kamizo
./scripts/verify-frontend-bundle.sh https://app.kamizo.uz
PUBLIC_HEALTH=$(curl --fail --silent --show-error --max-time 10 https://api.kamizo.uz/api/health)
printf '%s\n' "$PUBLIC_HEALTH" | jq -e '.status == "healthy" and .checks.database == true'
```

Rollback is not complete until the restored version's bundle passes the same
HTTP/content-type/size verification and login shell loads.

## Rollback: Backup Timers

If a timer repeatedly fails, stop scheduling new jobs but preserve every
artifact and journal for diagnosis. Do not delete the lock or backup
directories.

`EXPLICIT CONFIRMATION REQUIRED: DISABLE_FAILING_BACKUP_TIMERS`

```bash
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 '
set -e
for timer in kamizo-backup-hourly.timer kamizo-backup-daily.timer; do
  if systemctl cat "$timer" >/dev/null 2>&1; then
    sudo systemctl disable --now "$timer"
  fi
done
sudo journalctl -u kamizo-backup-hourly.service -u kamizo-backup-daily.service -n 200 --no-pager
'
```

This is degradation, not resolution. Restore scheduling only after a manual
backup and drill pass again.

## Off-Site Backup Gap

The hourly and daily generations are on the same VPS as the live database.
They protect against application/schema mistakes but not VPS loss,
filesystem loss, account compromise, or provider failure. This rollout must
record that residual risk; it must not claim disaster-recovery completion.

Follow-up requirements:

- Replicate only committed artifact/checksum/manifest triples.
- Encrypt before transfer and keep encryption keys separate from the VPS.
- Keep both backup data and keys physically in Uzbekistan unless a separate
  legal decision explicitly permits another location.
- Use a second Uzbekistan host/provider or approved in-country object store;
  do not default to foreign S3/R2 regions.
- Monitor replication freshness and alert on missed hourly/daily copies.
- Perform and record a regular restore drill from the off-site copy, not from
  the VPS-local source.
- Define RPO, RTO, retention, key rotation, and incident access ownership
  before treating the off-site control as operational.

Until that follow-up passes an independent restore drill, the accepted risk
owner and review date must remain open in the operations register.
