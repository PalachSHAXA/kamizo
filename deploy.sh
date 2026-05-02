#!/bin/bash

# Kamizo Deployment Script (Cloudflare Workers + D1)
# Layout: frontend in src/frontend, worker in cloudflare/

set -e

echo "🚀 Kamizo Deployment"
echo "===================="

# Sanity: wrangler logged in
if ! (cd cloudflare && npx wrangler whoami &> /dev/null); then
    echo "❌ Wrangler is not authenticated. Run: cd cloudflare && npx wrangler login"
    exit 1
fi

# Step 1: Build frontend
echo ""
echo "📦 Step 1/3: Building frontend..."
cd src/frontend
npm run build
cd ../..
echo "   ✅ Frontend build complete (src/frontend/dist)"

# Step 2: Sync built assets to cloudflare/public
echo ""
echo "📦 Step 2/3: Syncing dist → cloudflare/public..."
rm -rf cloudflare/public
cp -r src/frontend/dist cloudflare/public
echo "   ✅ Assets synced"

# Step 3: Deploy worker
echo ""
echo "📦 Step 3/3: Deploying worker to Cloudflare..."
cd cloudflare
npm run deploy
cd ..

echo ""
echo "✅ Deployment complete — https://kamizo.uz"
echo ""
echo "ℹ️  Migrations are NOT applied automatically."
echo "    Apply manually if needed:"
echo "      cd cloudflare && npx wrangler d1 migrations apply kamizo-db --remote"
