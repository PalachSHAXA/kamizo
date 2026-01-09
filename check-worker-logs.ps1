$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
$env:CLOUDFLARE_API_TOKEN = "MGiQRntLKr1xSAluOW0H_-QrLFTDSMWhluK9_dvZ"
Set-Location "C:\Users\user\Documents\UK-CRM\cloudflare"

Write-Host "=== Checking Cloudflare Worker Logs ===" -ForegroundColor Cyan
Write-Host "This will show recent errors from the Worker" -ForegroundColor Yellow
Write-Host ""

npx wrangler tail --format pretty

Write-Host "`nDone!" -ForegroundColor Green
