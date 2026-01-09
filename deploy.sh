#!/bin/bash

# UK CRM Deployment Script for Cloudflare

set -e

echo "🚀 UK CRM Deployment"
echo "===================="

# Check if wrangler is logged in
if ! npx wrangler whoami &> /dev/null; then
    echo "❌ Please login to Cloudflare first:"
    echo "   npx wrangler login"
    exit 1
fi

# Step 1: Create D1 Database (if not exists)
echo ""
echo "📦 Step 1: Setting up D1 Database..."
DB_INFO=$(npx wrangler d1 list 2>/dev/null | grep "uk-crm-db" || true)

if [ -z "$DB_INFO" ]; then
    echo "Creating new D1 database..."
    npx wrangler d1 create uk-crm-db
    echo "⚠️  Please update wrangler.toml with the database_id from above"
    echo "   Then run this script again"
    exit 0
else
    echo "✅ Database exists"
fi

# Step 2: Run migrations
echo ""
echo "📦 Step 2: Running database migrations..."
cd src/backend
npm run db:migrate:prod
cd ../..

# Step 3: Build frontend
echo ""
echo "📦 Step 3: Building frontend..."
cd src/frontend
npm run build
cd ../..

# Step 4: Deploy to Cloudflare Workers
echo ""
echo "📦 Step 4: Deploying to Cloudflare Workers..."
cd src/backend
npm run deploy
cd ../..

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Your UK CRM is now live!"
