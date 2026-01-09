$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
$env:CLOUDFLARE_API_TOKEN = "MGiQRntLKr1xSAluOW0H_-QrLFTDSMWhluK9_dvZ"
Set-Location "C:\Users\user\Documents\UK-CRM\cloudflare"

Write-Host "=== Checking all tables ===" -ForegroundColor Cyan
npx wrangler d1 execute uk-crm-db --remote --command="SELECT name, type FROM sqlite_master WHERE type='table' ORDER BY name;"

Write-Host "`nDone!" -ForegroundColor Green
