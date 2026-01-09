#!/bin/bash

# UK CRM - Quick Deploy Script for Git Bash
# Automatically builds and deploys to Cloudflare

set -e

echo "🚀 UK CRM - Quick Deploy to Cloudflare"
echo "======================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found!"
    echo "   Please install Node.js from: https://nodejs.org/"
    echo "   Or run in PowerShell: .\install-nodejs.ps1"
    exit 1
fi

NODE_VERSION=$(node --version)
echo "✅ Node.js found: $NODE_VERSION"

# Step 1: Install frontend dependencies if needed
echo ""
echo "📦 Step 1: Checking frontend dependencies..."
cd src/frontend
if [ ! -d "node_modules" ]; then
    echo "   Installing dependencies..."
    npm install
else
    echo "   ✅ Dependencies already installed"
fi

# Step 2: Build frontend
echo ""
echo "📦 Step 2: Building frontend..."
npm run build
echo "   ✅ Frontend build complete"

# Step 3: Copy built files to cloudflare/public
echo ""
echo "📦 Step 3: Copying files to cloudflare/public..."
cd ../..
rm -rf cloudflare/public
cp -r src/frontend/dist cloudflare/public
echo "   ✅ Files copied"

# Step 4: Install cloudflare dependencies
echo ""
echo "📦 Step 4: Checking Cloudflare dependencies..."
cd cloudflare
if [ ! -d "node_modules" ]; then
    echo "   Installing Wrangler..."
    npm install
else
    echo "   ✅ Wrangler already installed"
fi

# Step 5: Deploy to Cloudflare
echo ""
echo "📦 Step 5: Deploying to Cloudflare Workers..."
echo "   Domain: app.myhelper.uz"
npm run deploy

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🌐 Your UK CRM is now live at: https://app.myhelper.uz"
echo ""
