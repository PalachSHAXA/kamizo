$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
$env:CLOUDFLARE_API_TOKEN = "MGiQRntLKr1xSAluOW0H_-QrLFTDSMWhluK9_dvZ"
Set-Location "C:\Users\user\Documents\UK-CRM\cloudflare"

Write-Host "=== Applying migration 023 - Fix chat_messages FK ===" -ForegroundColor Cyan

Write-Host "`nAttempting automatic migration..." -ForegroundColor Yellow
npx wrangler d1 migrations apply uk-crm-db --remote

if ($LASTEXITCODE -ne 0) {
    Write-Host "`nAutomatic migration failed. Trying manual approach..." -ForegroundColor Yellow

    Write-Host "`n1. Creating new table..." -ForegroundColor Cyan
    $sql1 = @"
CREATE TABLE IF NOT EXISTS chat_messages_new (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES chat_channels(id),
  sender_id TEXT NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
"@
    npx wrangler d1 execute uk-crm-db --remote --command=$sql1

    Write-Host "`n2. Copying data..." -ForegroundColor Cyan
    $sql2 = "INSERT INTO chat_messages_new (id, channel_id, sender_id, content, created_at) SELECT id, channel_id, sender_id, content, created_at FROM chat_messages;"
    npx wrangler d1 execute uk-crm-db --remote --command=$sql2

    Write-Host "`n3. Dropping old table..." -ForegroundColor Cyan
    $sql3 = "DROP TABLE chat_messages;"
    npx wrangler d1 execute uk-crm-db --remote --command=$sql3

    Write-Host "`n4. Renaming new table..." -ForegroundColor Cyan
    $sql4 = "ALTER TABLE chat_messages_new RENAME TO chat_messages;"
    npx wrangler d1 execute uk-crm-db --remote --command=$sql4
}

Write-Host "`n=== Verifying fix ===" -ForegroundColor Cyan
npx wrangler d1 execute uk-crm-db --remote --command="SELECT sql FROM sqlite_master WHERE type='table' AND name='chat_messages';"

Write-Host "`nDone!" -ForegroundColor Green
