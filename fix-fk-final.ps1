$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
$env:CLOUDFLARE_API_TOKEN = "MGiQRntLKr1xSAluOW0H_-QrLFTDSMWhluK9_dvZ"
Set-Location "C:\Users\user\Documents\UK-CRM\cloudflare"

Write-Host "=== Fixing FK - Final Approach ===" -ForegroundColor Cyan

Write-Host "`n1. Copying ONLY valid messages (with existing sender_id)" -ForegroundColor Yellow
$sql = "INSERT INTO chat_messages_new (id, channel_id, sender_id, content, created_at) SELECT cm.id, cm.channel_id, cm.sender_id, cm.content, cm.created_at FROM chat_messages cm WHERE EXISTS (SELECT 1 FROM users u WHERE u.id = cm.sender_id);"

npx wrangler d1 execute uk-crm-db --remote --command=$sql

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Valid messages copied" -ForegroundColor Green

    Write-Host "`n2. Dropping old table" -ForegroundColor Yellow
    npx wrangler d1 execute uk-crm-db --remote --command="DROP TABLE chat_messages;"

    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Old table dropped" -ForegroundColor Green

        Write-Host "`n3. Renaming new table" -ForegroundColor Yellow
        npx wrangler d1 execute uk-crm-db --remote --command="ALTER TABLE chat_messages_new RENAME TO chat_messages;"

        if ($LASTEXITCODE -eq 0) {
            Write-Host "`n=== SUCCESS ===" -ForegroundColor Green
            Write-Host "FK fixed! Verifying..." -ForegroundColor Cyan
            npx wrangler d1 execute uk-crm-db --remote --command="SELECT sql FROM sqlite_master WHERE name='chat_messages';"
        }
    }
}

Write-Host "`nDone!" -ForegroundColor Cyan
