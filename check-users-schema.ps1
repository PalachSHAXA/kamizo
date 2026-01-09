$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
$env:CLOUDFLARE_API_TOKEN = "MGiQRntLKr1xSAluOW0H_-QrLFTDSMWhluK9_dvZ"
Set-Location "C:\Users\user\Documents\UK-CRM\cloudflare"

Write-Host "=== Checking users table schema ===" -ForegroundColor Cyan
npx wrangler d1 execute uk-crm-db --remote --command="PRAGMA table_info(users);"

Write-Host "`nDone!" -ForegroundColor Green
