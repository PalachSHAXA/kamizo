$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
$env:CLOUDFLARE_API_TOKEN = "MGiQRntLKr1xSAluOW0H_-QrLFTDSMWhluK9_dvZ"
Set-Location "C:\Users\user\Documents\UK-CRM\cloudflare"

Write-Host "=== Checking status values in users table ===" -ForegroundColor Cyan

Write-Host "`n1. Unique status values:" -ForegroundColor Yellow
npx wrangler d1 execute uk-crm-db --remote --command="SELECT DISTINCT status, COUNT(*) as count FROM users GROUP BY status;"

Write-Host "`n2. Managers and admins:" -ForegroundColor Yellow
npx wrangler d1 execute uk-crm-db --remote --command="SELECT id, name, role, status, is_active FROM users WHERE role IN ('manager', 'admin') LIMIT 5;"

Write-Host "`nDone!" -ForegroundColor Green
