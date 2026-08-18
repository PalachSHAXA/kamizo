#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
preflight="$repo_root/scripts/preflight-staging-config.sh"
selective="$repo_root/scripts/release-selective-staging.sh"
fixture_root=$(mktemp -d)
trap 'rm -r -- "$fixture_root"' EXIT

cat >"$fixture_root/empty.toml" <<'EOF'
[[d1_databases]]
binding = "DB"
database_id = ""
[[kv_namespaces]]
binding = "RATE_LIMITER"
id = ""
EOF

if "$preflight" "$fixture_root/empty.toml" >"$fixture_root/out" 2>"$fixture_root/err"; then
  printf 'expected empty binding IDs to fail staging preflight\n' >&2
  exit 1
fi
grep -q 'empty D1 database_id' "$fixture_root/err"
grep -q 'empty KV namespace id' "$fixture_root/err"

cat >"$fixture_root/stale.toml" <<'EOF'
[[d1_databases]]
binding = "DB"
database_id = "d1-valid"
[[kv_namespaces]]
binding = "RATE_LIMITER"
id = "kv-valid"
[[durable_objects.bindings]]
name = "CONNECTION_MANAGER"
class_name = "ConnectionManager"
EOF

if "$preflight" "$fixture_root/stale.toml" >"$fixture_root/out" 2>"$fixture_root/err"; then
  printf 'expected stale ConnectionManager to fail staging preflight\n' >&2
  exit 1
fi
grep -q 'stale ConnectionManager' "$fixture_root/err"

cat >"$fixture_root/valid.toml" <<'EOF'
[[d1_databases]]
binding = "DB"
database_id = "d1-valid"
[[kv_namespaces]]
binding = "RATE_LIMITER"
id = "kv-valid"
EOF
"$preflight" "$fixture_root/valid.toml" >"$fixture_root/out"
grep -q 'staging config preflight passed' "$fixture_root/out"

mkdir -p "$fixture_root/local-deploy/scripts" "$fixture_root/local-deploy/src/frontend/dist" \
  "$fixture_root/local-deploy/cloudflare/public" "$fixture_root/local-deploy/bin"
cp "$repo_root/scripts/deploy-staging.sh" "$fixture_root/local-deploy/scripts/deploy-staging.sh"
cat >"$fixture_root/local-deploy/bin/npm" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat >"$fixture_root/local-deploy/bin/wrangler" <<'EOF'
#!/usr/bin/env bash
printf 'wrangler invoked\n' >"${WRANGLER_MARKER:?}"
exit 0
EOF
chmod +x "$fixture_root/local-deploy/bin/npm" "$fixture_root/local-deploy/bin/wrangler"
if (
  cd "$fixture_root/local-deploy"
  WRANGLER_MARKER="$fixture_root/wrangler-invoked" \
    PATH="$fixture_root/local-deploy/bin:$PATH" bash scripts/deploy-staging.sh
) >"$fixture_root/out" 2>"$fixture_root/err"; then
  printf 'expected local staging deploy script to refuse deployment\n' >&2
  exit 1
fi
test ! -e "$fixture_root/wrangler-invoked"
grep -q 'GitHub Actions manual dispatch' "$fixture_root/err"

git -C "$fixture_root" init -q
git -C "$fixture_root" remote add origin 'https://example-token@example.invalid/org/repo.git'
mkdir -p "$fixture_root/scripts" "$fixture_root/release" "$fixture_root/src"
cp "$selective" "$fixture_root/scripts/release-selective-staging.sh"
cat >"$fixture_root/release/selective-staging-manifest.txt" <<'EOF'
src/intended.ts
EOF
printf 'intended\n' >"$fixture_root/src/intended.ts"
printf 'unrelated\n' >"$fixture_root/unrelated.txt"

output=$(git -C "$fixture_root" -c user.name=test -c user.email=test@example.invalid \
  add src/intended.ts release/selective-staging-manifest.txt scripts/release-selective-staging.sh >/dev/null && \
  git -C "$fixture_root" -c user.name=test -c user.email=test@example.invalid commit -qm fixture && \
  "$fixture_root/scripts/release-selective-staging.sh")
grep -q 'DRY RUN ONLY' <<<"$output"
grep -q 'src/intended.ts' <<<"$output"
grep -q 'credential-bearing remote URL detected' <<<"$output"
if grep -q 'example-token' <<<"$output"; then
  printf 'selective staging script printed a remote credential\n' >&2
  exit 1
fi
if grep -q 'unrelated.txt' <<<"$output"; then
  printf 'selective staging script listed an unrelated user file\n' >&2
  exit 1
fi
test -z "$(git -C "$fixture_root" diff --cached --name-only)"

for forbidden in '.superpowers/state.json' 'report.xlsx' 'HOTFIX_REPORT.html' \
  'cloudflare/public/index.html' 'src/frontend/dist/index.html' \
  'src/frontend/test-results/result.json'; do
  printf '%s\n' "$forbidden" >"$fixture_root/release/selective-staging-manifest.txt"
  if "$fixture_root/scripts/release-selective-staging.sh" >"$fixture_root/out" 2>"$fixture_root/err"; then
    printf 'expected forbidden manifest path to fail: %s\n' "$forbidden" >&2
    exit 1
  fi
done

printf 'release safety tests passed\n'
