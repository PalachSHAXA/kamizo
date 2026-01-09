$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
$env:CLOUDFLARE_API_TOKEN = "MGiQRntLKr1xSAluOW0H_-QrLFTDSMWhluK9_dvZ"
Set-Location "C:\Users\user\Documents\UK-CRM\cloudflare"

Write-Host "=== Testing direct INSERT to channel e14f06c9 ===" -ForegroundColor Cyan

$channelId = "e14f06c9-701a-4f44-8f8b-3040ada4d226"
$userId = "df919ca9-b1b8-4626-8d34-1771659f9009" # resident_id from channel
$messageId = "test-direct-" + (Get-Date -Format "yyyyMMddHHmmss")

Write-Host "`n1. Checking channel exists:" -ForegroundColor Yellow
npx wrangler d1 execute uk-crm-db --remote --command="SELECT * FROM chat_channels WHERE id = '$channelId';"

Write-Host "`n2. Checking user exists:" -ForegroundColor Yellow
npx wrangler d1 execute uk-crm-db --remote --command="SELECT id, name, role FROM users WHERE id = '$userId';"

Write-Host "`n3. Attempting INSERT:" -ForegroundColor Yellow
$sql = "INSERT INTO chat_messages (id, channel_id, sender_id, content, created_at) VALUES ('$messageId', '$channelId', '$userId', 'Test direct insert from PowerShell', datetime('now'));"
npx wrangler d1 execute uk-crm-db --remote --command=$sql

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n=== INSERT SUCCESS ===" -ForegroundColor Green
    Write-Host "Verifying..." -ForegroundColor Cyan
    npx wrangler d1 execute uk-crm-db --remote --command="SELECT * FROM chat_messages WHERE id = '$messageId';"
} else {
    Write-Host "`n=== INSERT FAILED ===" -ForegroundColor Red
}

Write-Host "`nDone!" -ForegroundColor Green
