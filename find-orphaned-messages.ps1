$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
$env:CLOUDFLARE_API_TOKEN = "MGiQRntLKr1xSAluOW0H_-QrLFTDSMWhluK9_dvZ"
Set-Location "C:\Users\user\Documents\UK-CRM\cloudflare"

Write-Host "=== Finding orphaned chat messages ===" -ForegroundColor Cyan

$sql = "SELECT DISTINCT cm.sender_id FROM chat_messages cm WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = cm.sender_id);"

npx wrangler d1 execute uk-crm-db --remote --command=$sql

Write-Host "`nDone!" -ForegroundColor Green
