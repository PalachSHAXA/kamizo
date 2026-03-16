#!/bin/bash
# Deploy Kamizo to Staging environment
# Usage: bash scripts/deploy-staging.sh

set -e

echo "🚀 Deploying to STAGING..."

# Build frontend
echo "📦 Building frontend..."
cd src/frontend
npm run build
cd ../..

# Copy to cloudflare public
rm -rf cloudflare/public
cp -r src/frontend/dist cloudflare/public

# Deploy with staging config
echo "☁️  Deploying to Cloudflare Workers (staging)..."
cd cloudflare
wrangler deploy --config wrangler.staging.toml

echo ""
echo "✅ Staging deployment complete!"
echo "🌐 https://kamizo-staging.workers.dev"
