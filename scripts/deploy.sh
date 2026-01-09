#!/bin/bash

# ==================== UK CRM Deployment Script ====================
# Production-grade deployment с pre-checks и rollback capability

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT="${1:-production}"  # Default to production
PRODUCTION_URL="https://uk-crm.shaxzod.workers.dev"
STAGING_URL="https://uk-crm-staging.shaxzod.workers.dev"

# ==================== FUNCTIONS ====================

log_info() {
  echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
  echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
  echo -e "${RED}❌ $1${NC}"
}

# ==================== PRE-DEPLOYMENT CHECKS ====================

pre_deployment_checks() {
  log_info "Running pre-deployment checks..."

  # Check if git working directory is clean
  if [ -n "$(git status --porcelain)" ]; then
    log_warning "Git working directory is not clean"
    git status --short
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      log_error "Deployment cancelled"
      exit 1
    fi
  else
    log_success "Git working directory is clean"
  fi

  # Check current branch
  CURRENT_BRANCH=$(git branch --show-current)
  if [ "$ENVIRONMENT" = "production" ] && [ "$CURRENT_BRANCH" != "main" ]; then
    log_error "Production deployments must be from 'main' branch"
    log_info "Current branch: $CURRENT_BRANCH"
    exit 1
  fi
  log_success "Branch check passed (current: $CURRENT_BRANCH)"

  # Check Node.js version
  NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$NODE_VERSION" -lt 18 ]; then
    log_error "Node.js >= 18 required (current: $(node --version))"
    exit 1
  fi
  log_success "Node.js version check passed"

  # Check npm dependencies
  if [ ! -d "src/frontend/node_modules" ]; then
    log_warning "Frontend dependencies not installed"
    log_info "Installing dependencies..."
    cd src/frontend && npm ci && cd ../..
  fi
  log_success "Dependencies check passed"
}

# ==================== BUILD ====================

build_frontend() {
  log_info "Building frontend..."

  cd src/frontend

  # Type check
  log_info "Running TypeScript type check..."
  if ! npx tsc --noEmit; then
    log_error "TypeScript type check failed"
    exit 1
  fi
  log_success "Type check passed"

  # Build
  log_info "Building production bundle..."
  if ! npm run build; then
    log_error "Frontend build failed"
    exit 1
  fi

  # Check bundle size
  MAIN_SIZE=$(du -k dist/assets/index-*.js | cut -f1 | head -1)
  TOTAL_SIZE=$(du -sk dist/assets | cut -f1)

  log_info "Main bundle: ${MAIN_SIZE}KB"
  log_info "Total assets: ${TOTAL_SIZE}KB"

  if [ "$MAIN_SIZE" -gt 1024 ]; then
    log_warning "Main bundle exceeds 1MB (${MAIN_SIZE}KB)"
  fi

  if [ "$TOTAL_SIZE" -gt 3072 ]; then
    log_error "Total bundle exceeds 3MB (${TOTAL_SIZE}KB)"
    exit 1
  fi

  cd ../..
  log_success "Frontend build completed"
}

# ==================== COPY ASSETS ====================

copy_assets() {
  log_info "Copying assets to cloudflare/public..."

  rm -rf cloudflare/public/assets
  cp -r src/frontend/dist/assets cloudflare/public/
  cp src/frontend/dist/index.html cloudflare/public/

  log_success "Assets copied"
}

# ==================== DEPLOY ====================

deploy_to_cloudflare() {
  log_info "Deploying to Cloudflare Workers ($ENVIRONMENT)..."

  cd cloudflare

  # Deploy
  if [ "$ENVIRONMENT" = "staging" ]; then
    npx wrangler deploy --env staging || npx wrangler deploy
    DEPLOY_URL="$STAGING_URL"
  else
    npx wrangler deploy
    DEPLOY_URL="$PRODUCTION_URL"
  fi

  cd ..

  log_success "Deployment completed"
  log_info "URL: $DEPLOY_URL"
}

# ==================== POST-DEPLOYMENT CHECKS ====================

post_deployment_checks() {
  log_info "Running post-deployment health checks..."

  HEALTH_URL="$DEPLOY_URL/api/health"

  # Wait for deployment to propagate
  log_info "Waiting for deployment to propagate (10s)..."
  sleep 10

  # Health check
  log_info "Testing $HEALTH_URL..."
  RESPONSE=$(curl -s "$HEALTH_URL" || echo '{"status":"error"}')

  if echo "$RESPONSE" | grep -q '"status":"healthy"'; then
    log_success "Health check passed"
  else
    log_error "Health check failed"
    echo "$RESPONSE"
    exit 1
  fi

  # Test frontend
  log_info "Testing frontend..."
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$DEPLOY_URL/")

  if [ "$HTTP_CODE" = "200" ]; then
    log_success "Frontend loads successfully"
  else
    log_error "Frontend failed to load (HTTP $HTTP_CODE)"
    exit 1
  fi

  # Response time check
  TIME=$(curl -s -o /dev/null -w "%{time_total}" "$HEALTH_URL")
  TIME_MS=$(echo "$TIME * 1000" | bc)

  log_info "Response time: ${TIME_MS}ms"

  if (( $(echo "$TIME > 2.0" | bc -l) )); then
    log_warning "Slow response detected: ${TIME_MS}ms"
  else
    log_success "Response time acceptable"
  fi
}

# ==================== CREATE DEPLOYMENT TAG ====================

create_deployment_tag() {
  if [ "$ENVIRONMENT" = "production" ]; then
    VERSION=$(date +%Y%m%d-%H%M%S)
    TAG="deploy-$VERSION"

    log_info "Creating deployment tag: $TAG"
    git tag "$TAG"

    log_info "Push tag to remote? (y/N)"
    read -p "> " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      git push origin "$TAG"
      log_success "Tag pushed to remote"
    fi
  fi
}

# ==================== MAIN ====================

main() {
  echo ""
  log_info "╔════════════════════════════════════════╗"
  log_info "║   UK CRM Deployment Script            ║"
  log_info "║   Environment: $ENVIRONMENT                 ║"
  log_info "╚════════════════════════════════════════╝"
  echo ""

  # Run deployment pipeline
  pre_deployment_checks
  build_frontend
  copy_assets
  deploy_to_cloudflare
  post_deployment_checks
  create_deployment_tag

  echo ""
  log_success "╔════════════════════════════════════════╗"
  log_success "║   Deployment Successful! 🎉            ║"
  log_success "╚════════════════════════════════════════╝"
  echo ""
  log_info "URL: $DEPLOY_URL"
  log_info "Timestamp: $(date)"
  echo ""
}

# Run main function
main
