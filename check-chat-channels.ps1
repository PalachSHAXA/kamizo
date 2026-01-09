$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
$env:CLOUDFLARE_API_TOKEN = "MGiQRntLKr1xSAluOW0H_-QrLFTDSMWhluK9_dvZ"
Set-Location "C:\Users\user\Documents\UK-CRM\cloudflare"

Write-Host "=== Checking all chat channels in production ===" -ForegroundColor Cyan
npx wrangler d1 execute uk-crm-db --remote --command="SELECT id, type, name FROM chat_channels;"

Write-Host "`n=== Checking chat_messages table structure ===" -ForegroundColor Cyan
npx wrangler d1 execute uk-crm-db --remote --command="PRAGMA table_info(chat_messages);"

Write-Host "`n=== Checking recent chat messages ===" -ForegroundColor Cyan
npx wrangler d1 execute uk-crm-db --remote --command="SELECT id, channel_id, user_id, content, created_at FROM chat_messages ORDER BY created_at DESC LIMIT 5;"

Write-Host "`nDone!" -ForegroundColor Green
