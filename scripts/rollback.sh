#!/bin/bash

# ==================== UK CRM Rollback Script ====================
# Emergency rollback to previous deployment

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${YELLOW}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# Configuration
PRODUCTION_URL="https://uk-crm.shaxzod.workers.dev"

echo ""
log_error "╔════════════════════════════════════════╗"
log_error "║   EMERGENCY ROLLBACK                   ║"
log_error "╚════════════════════════════════════════╝"
echo ""

# Confirm rollback
log_error "⚠️  You are about to rollback the production deployment!"
log_info "This will revert to the previous version."
echo ""
read -p "Are you sure? Type 'ROLLBACK' to confirm: " -r
echo

if [ "$REPLY" != "ROLLBACK" ]; then
  log_info "Rollback cancelled"
  exit 0
fi

# Execute rollback
log_info "Rolling back deployment..."

cd cloudflare

if npx wrangler deployments list | grep -q "deployment"; then
  log_info "Found previous deployments"

  # List recent deployments
  log_info "Recent deployments:"
  npx wrangler deployments list | head -5

  # Rollback using wrangler
  if npx wrangler rollback; then
    log_success "Rollback executed successfully"
  else
    log_error "Rollback command failed"
    log_info "You may need to manually select a version:"
    log_info "npx wrangler deployments list"
    log_info "npx wrangler deployments view <deployment-id>"
    exit 1
  fi
else
  log_error "No previous deployments found"
  exit 1
fi

cd ..

# Verify rollback
log_info "Verifying rollback (waiting 10s for propagation)..."
sleep 10

HEALTH_URL="$PRODUCTION_URL/api/health"
RESPONSE=$(curl -s "$HEALTH_URL" || echo '{"status":"error"}')

if echo "$RESPONSE" | grep -q '"status":"healthy"'; then
  log_success "Health check passed after rollback"
else
  log_error "Health check failed after rollback!"
  echo "$RESPONSE"
  exit 1
fi

echo ""
log_success "╔════════════════════════════════════════╗"
log_success "║   Rollback Successful                  ║"
log_success "╚════════════════════════════════════════╝"
echo ""
log_info "URL: $PRODUCTION_URL"
log_info "Timestamp: $(date)"
echo ""
