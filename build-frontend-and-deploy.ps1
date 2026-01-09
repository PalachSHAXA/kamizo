$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
$env:CLOUDFLARE_API_TOKEN = "MGiQRntLKr1xSAluOW0H_-QrLFTDSMWhluK9_dvZ"

Write-Host "=== Building Frontend ===" -ForegroundColor Cyan
Set-Location "C:\Users\user\Documents\UK-CRM\src\frontend"
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Frontend build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== Deploying to Cloudflare ===" -ForegroundColor Cyan
Set-Location "C:\Users\user\Documents\UK-CRM\cloudflare"
npx wrangler deploy

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n=== SUCCESS ===" -ForegroundColor Green
    Write-Host "All fixes deployed!" -ForegroundColor Green
    Write-Host "`nFixed:" -ForegroundColor Cyan
    Write-Host "  1. Added try-catch around INSERT in chat messages" -ForegroundColor White
    Write-Host "  2. Replaced status = 'active' with is_active = 1 (8 locations)" -ForegroundColor White
    Write-Host "`nChat should now work!" -ForegroundColor Green
} else {
    Write-Host "`n=== DEPLOY FAILED ===" -ForegroundColor Red
}

Write-Host "`nDone!" -ForegroundColor Cyan
