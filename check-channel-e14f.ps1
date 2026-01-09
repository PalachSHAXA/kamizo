$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
$env:CLOUDFLARE_API_TOKEN = "MGiQRntLKr1xSAluOW0H_-QrLFTDSMWhluK9_dvZ"
Set-Location "C:\Users\user\Documents\UK-CRM\cloudflare"

Write-Host "=== Checking channel e14f06c9-701a-4f44-8f8b-3040ada4d226 ===" -ForegroundColor Cyan

$channelId = "e14f06c9-701a-4f44-8f8b-3040ada4d226"

Write-Host "`n1. Channel info:" -ForegroundColor Yellow
$sql1 = "SELECT * FROM chat_channels WHERE id = '$channelId';"
npx wrangler d1 execute uk-crm-db --remote --command=$sql1

Write-Host "`n2. Recent messages in this channel:" -ForegroundColor Yellow
$sql2 = "SELECT id, sender_id, content, created_at FROM chat_messages WHERE channel_id = '$channelId' ORDER BY created_at DESC LIMIT 5;"
npx wrangler d1 execute uk-crm-db --remote --command=$sql2

Write-Host "`nDone!" -ForegroundColor Green
