# UK CRM - Quick Deploy Script
# Automatically builds and deploys to Cloudflare

$ErrorActionPreference = "Stop"

Write-Host "🚀 UK CRM - Quick Deploy to Cloudflare" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Check if Node.js is installed
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js not found!" -ForegroundColor Red
    Write-Host "   Please run: .\install-nodejs.ps1" -ForegroundColor Yellow
    exit 1
}

# Step 1: Install frontend dependencies if needed
Write-Host ""
Write-Host "📦 Step 1: Checking frontend dependencies..." -ForegroundColor Yellow
Set-Location "src\frontend"
if (-not (Test-Path "node_modules")) {
    Write-Host "   Installing dependencies..." -ForegroundColor White
    npm install
} else {
    Write-Host "   ✅ Dependencies already installed" -ForegroundColor Green
}

# Step 2: Build frontend
Write-Host ""
Write-Host "📦 Step 2: Building frontend..." -ForegroundColor Yellow
npm run build
Write-Host "   ✅ Frontend build complete" -ForegroundColor Green

# Step 3: Copy built files to cloudflare/public
Write-Host ""
Write-Host "📦 Step 3: Copying files to cloudflare/public..." -ForegroundColor Yellow
Set-Location "..\..\"
if (Test-Path "cloudflare\public") {
    Remove-Item -Recurse -Force "cloudflare\public"
}
Copy-Item -Recurse "src\frontend\dist" "cloudflare\public"
Write-Host "   ✅ Files copied" -ForegroundColor Green

# Step 4: Install cloudflare dependencies
Write-Host ""
Write-Host "📦 Step 4: Checking Cloudflare dependencies..." -ForegroundColor Yellow
Set-Location "cloudflare"
if (-not (Test-Path "node_modules")) {
    Write-Host "   Installing Wrangler..." -ForegroundColor White
    npm install
} else {
    Write-Host "   ✅ Wrangler already installed" -ForegroundColor Green
}

# Step 5: Deploy to Cloudflare
Write-Host ""
Write-Host "📦 Step 5: Deploying to Cloudflare Workers..." -ForegroundColor Yellow
Write-Host "   Domain: kamizo.uz" -ForegroundColor Cyan
npm run deploy

Write-Host ""
Write-Host "✅ Deployment complete!" -ForegroundColor Green
Write-Host ""
Write-Host "🌐 Your UK CRM is now live at: https://kamizo.uz" -ForegroundColor Cyan
Write-Host ""
