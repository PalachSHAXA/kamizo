#!/usr/bin/env bash
# Deploy Kamizo backend (cloudflare/src/*.ts) to VPS in Tashkent.
# Usage:
#   ./scripts/deploy-vps.sh             # rsync + restart
#   ./scripts/deploy-vps.sh --logs      # tail logs after deploy
#   ./scripts/deploy-vps.sh --migration cloudflare/migrations/048_foo.sql
#                                       # also apply migration before restart
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
KEY="$HOME/.ssh/kamizo_vps"
HOST="kamizo@95.46.96.209"
REMOTE_DIR="/opt/kamizo/app/server-src/"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
say() { printf "${GREEN}[deploy-vps]${NC} %s\n" "$*"; }
warn() { printf "${YELLOW}[deploy-vps]${NC} %s\n" "$*"; }
die() { printf "${RED}[deploy-vps]${NC} %s\n" "$*" >&2; exit 1; }

[ -f "$KEY" ] || die "SSH key not found at $KEY"

# Parse args
TAIL_LOGS=0
MIGRATION_FILE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --logs) TAIL_LOGS=1; shift ;;
    --migration) MIGRATION_FILE="$2"; shift 2 ;;
    *) die "Unknown arg: $1" ;;
  esac
done

# Apply migration first (if provided) — safer than after restart
if [ -n "$MIGRATION_FILE" ]; then
  [ -f "$REPO/$MIGRATION_FILE" ] || die "Migration not found: $REPO/$MIGRATION_FILE"
  base=$(basename "$MIGRATION_FILE")
  say "uploading migration $base"
  scp -q -i "$KEY" "$REPO/$MIGRATION_FILE" "$HOST:/tmp/$base"
  say "applying migration on SQLite (with WAL)"
  ssh -i "$KEY" "$HOST" "sqlite3 /opt/kamizo/data/kamizo.db < /tmp/$base && rm -f /tmp/$base"
fi

say "rsyncing cloudflare/src/ → $HOST:$REMOTE_DIR"
rsync -avz -e "ssh -i $KEY" \
  --exclude=__tests__ --exclude='*.test.ts' \
  "$REPO/cloudflare/src/" "$HOST:$REMOTE_DIR"

# Re-apply the local [node-port] patches that rsync would have overwritten.
# These exist only on the VPS copy, not in git.
say "re-applying VPS-only patches (ConnectionManager export off, api.kamizo.uz origin fallback)"
ssh -i "$KEY" "$HOST" 'python3 -c "
import re
path = \"/opt/kamizo/app/server-src/index.ts\"
src = open(path).read()
# 1. disable Durable Object re-export
src = src.replace(
  \"export { ConnectionManager } from\",
  \"// [node-port] disabled: export { ConnectionManager } from\"
)
# 2. add Origin-based tenant fallback if not already present
if \"[node-port] api.kamizo.uz\" not in src:
  old = \"const tenantSlug = getTenantSlug(url.hostname);\"
  new = \"\"\"let tenantSlug = getTenantSlug(url.hostname);
    if (!tenantSlug && url.hostname === '\''api.kamizo.uz'\'') {
      const originHeader = request.headers.get('\''Origin'\'');
      if (originHeader) {
        try {
          tenantSlug = getTenantSlug(new URL(originHeader).hostname);
        } catch { /* [node-port] api.kamizo.uz */ }
      }
    }\"\"\"
  src = src.replace(old, new, 1)
open(path, \"w\").write(src)
"'

say "restarting kamizo-api"
ssh -i "$KEY" "$HOST" 'sudo systemctl restart kamizo-api && sleep 2 && systemctl is-active kamizo-api'

say "smoke check /health"
HEALTH=$(curl -fsS https://api.kamizo.uz/api/health || echo FAILED)
case "$HEALTH" in
  *healthy*) say "API healthy ✓" ;;
  *) warn "Health response: $HEALTH" ;;
esac

if [ "$TAIL_LOGS" = "1" ]; then
  say "tailing api logs (Ctrl-C to stop)"
  ssh -i "$KEY" "$HOST" 'tail -n 0 -f /opt/kamizo/logs/api.log /opt/kamizo/logs/api.err.log'
fi
