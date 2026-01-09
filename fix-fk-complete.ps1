$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
$env:CLOUDFLARE_API_TOKEN = "MGiQRntLKr1xSAluOW0H_-QrLFTDSMWhluK9_dvZ"
Set-Location "C:\Users\user\Documents\UK-CRM\cloudflare"

Write-Host "=== Complete FK Fix ===" -ForegroundColor Cyan

Write-Host "`n1. Backup chat_message_reads" -ForegroundColor Yellow
npx wrangler d1 execute uk-crm-db --remote --command="CREATE TABLE chat_message_reads_backup AS SELECT * FROM chat_message_reads;"

Write-Host "`n2. Drop chat_message_reads (to allow dropping chat_messages)" -ForegroundColor Yellow
npx wrangler d1 execute uk-crm-db --remote --command="DROP TABLE chat_message_reads;"

Write-Host "`n3. Drop old chat_messages" -ForegroundColor Yellow
npx wrangler d1 execute uk-crm-db --remote --command="DROP TABLE chat_messages;"

Write-Host "`n4. Rename new table" -ForegroundColor Yellow
npx wrangler d1 execute uk-crm-db --remote --command="ALTER TABLE chat_messages_new RENAME TO chat_messages;"

Write-Host "`n5. Recreate chat_message_reads with correct FK" -ForegroundColor Yellow
npx wrangler d1 execute uk-crm-db --remote --command="CREATE TABLE chat_message_reads (message_id TEXT NOT NULL REFERENCES chat_messages(id), user_id TEXT NOT NULL REFERENCES users(id), read_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (message_id, user_id));"

Write-Host "`n6. Restore chat_message_reads data" -ForegroundColor Yellow
npx wrangler d1 execute uk-crm-db --remote --command="INSERT INTO chat_message_reads SELECT cmr.message_id, cmr.user_id, cmr.read_at FROM chat_message_reads_backup cmr WHERE EXISTS (SELECT 1 FROM chat_messages cm WHERE cm.id = cmr.message_id);"

Write-Host "`n7. Drop backup table" -ForegroundColor Yellow
npx wrangler d1 execute uk-crm-db --remote --command="DROP TABLE chat_message_reads_backup;"

Write-Host "`n=== Verifying ===" -ForegroundColor Cyan
npx wrangler d1 execute uk-crm-db --remote --command="SELECT sql FROM sqlite_master WHERE name='chat_messages';"

Write-Host "`nDone!" -ForegroundColor Green
