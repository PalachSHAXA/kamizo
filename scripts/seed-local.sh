#!/bin/bash
# seed-local.sh — Seed local D1 database with demo users
# Usage: ./scripts/seed-local.sh

set -e

WORKER_URL="http://localhost:8787"
CLOUDFLARE_DIR="$(dirname "$0")/../cloudflare"

echo "🌱 Kamizo Local Seed"
echo "===================="

# 1. Check if wrangler dev is already running on :8787
if curl -s --max-time 2 "$WORKER_URL/api/health" > /dev/null 2>&1; then
  echo "✅ wrangler dev already running on $WORKER_URL"
else
  echo "⚠️  wrangler dev not running. Starting in background..."
  cd "$CLOUDFLARE_DIR"
  npx wrangler dev --local --port 8787 &
  WRANGLER_PID=$!
  echo "   PID: $WRANGLER_PID"

  # Wait for it to be ready
  echo -n "   Waiting for server"
  for i in $(seq 1 30); do
    if curl -s --max-time 1 "$WORKER_URL/api/health" > /dev/null 2>&1; then
      echo " ✅"
      break
    fi
    echo -n "."
    sleep 1
  done

  if ! curl -s --max-time 2 "$WORKER_URL/api/health" > /dev/null 2>&1; then
    echo " ❌ Failed to start wrangler dev"
    kill $WRANGLER_PID 2>/dev/null
    exit 1
  fi
fi

# 2. Call seed endpoint (no auth required in dev mode via ENVIRONMENT=development in .dev.vars)
echo ""
echo "📦 Seeding demo users..."
RESPONSE=$(curl -s -X POST "$WORKER_URL/api/seed" \
  -H "Content-Type: application/json" \
  -w "\n%{http_code}")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ Seed successful!"
  echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
else
  echo "❌ Seed failed (HTTP $HTTP_CODE)"
  echo "$BODY"
  exit 1
fi

echo ""
echo "🎉 Done! Demo accounts:"
echo "   admin / palach27 (Администратор)"
echo "   director / kamizo (Директор)"
echo "   manager / kamizo (Управляющий)"
echo "   resident / kamizo (Житель)"
echo "   executor / kamizo (Исполнитель)"
echo "   dispatcher / kamizo (Диспетчер)"
echo "   security / kamizo (Охранник)"
echo "   advertiser / kamizo (Рекламодатель)"
