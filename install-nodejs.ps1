# UK CRM - Node.js Installation Script for Windows
# Run this in PowerShell as Administrator

Write-Host "🚀 Installing Node.js for UK CRM..." -ForegroundColor Cyan

# Check if winget is available
if (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-Host "✅ Winget found. Installing Node.js LTS..." -ForegroundColor Green
    winget install OpenJS.NodeJS.LTS --silent
} else {
    Write-Host "⚠️ Winget not found. Please install Node.js manually:" -ForegroundColor Yellow
    Write-Host "   1. Go to: https://nodejs.org/" -ForegroundColor White
    Write-Host "   2. Download LTS version (v20.x or v22.x)" -ForegroundColor White
    Write-Host "   3. Run the installer" -ForegroundColor White
    Write-Host "   4. Restart your terminal" -ForegroundColor White
    Start-Process "https://nodejs.org/"
    exit
}

Write-Host ""
Write-Host "✅ Node.js installation complete!" -ForegroundColor Green
Write-Host "⚠️ Please restart your terminal and run: node --version" -ForegroundColor Yellow
