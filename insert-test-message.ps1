$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
$env:CLOUDFLARE_API_TOKEN = "MGiQRntLKr1xSAluOW0H_-QrLFTDSMWhluK9_dvZ"
Set-Location "C:\Users\user\Documents\UK-CRM\cloudflare"

Write-Host "=== Inserting test message ===" -ForegroundColor Cyan

$userId = "aa04c3c0-cdc6-4c76-a88a-8ebd5153e78c"
$messageId = "test-msg-" + (Get-Date -Format "yyyyMMddHHmmss")

Write-Host "Inserting message with ID: $messageId" -ForegroundColor Yellow

$sql = "INSERT INTO chat_messages (id, channel_id, sender_id, content, created_at) VALUES ('$messageId', 'uk-general', '$userId', 'Test message from PowerShell', datetime('now'));"

npx wrangler d1 execute uk-crm-db --remote --command=$sql

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n=== SUCCESS! ===" -ForegroundColor Green
    Write-Host "Message inserted successfully!" -ForegroundColor Green

    Write-Host "`nVerifying insertion..." -ForegroundColor Cyan
    $verify = "SELECT id, channel_id, sender_id, content, created_at FROM chat_messages WHERE id = '$messageId';"
    npx wrangler d1 execute uk-crm-db --remote --command=$verify
} else {
    Write-Host "`n=== FAILED ===" -ForegroundColor Red
    Write-Host "Message insertion failed!" -ForegroundColor Red
}

Write-Host "`nDone!" -ForegroundColor Green
