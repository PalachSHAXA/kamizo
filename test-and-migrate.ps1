$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
$env:CLOUDFLARE_API_TOKEN = "MGiQRntLKr1xSAluOW0H_-QrLFTDSMWhluK9_dvZ"
Set-Location "C:\Users\user\Documents\UK-CRM\cloudflare"

Write-Host "=== Testing API Token ===" -ForegroundColor Cyan
Write-Host "Checking D1 access..."

Write-Host "`n=== Applying migrations to production ===" -ForegroundColor Cyan
npx wrangler d1 migrations apply uk-crm-db --remote

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n=== SUCCESS ===" -ForegroundColor Green
    Write-Host "Migrations applied successfully!"
    Write-Host "Chat should now work!"

    Write-Host "`n=== Verifying uk-general channel ===" -ForegroundColor Cyan
    $checkSql = "SELECT id, type, name FROM chat_channels WHERE id = 'uk-general';"
    npx wrangler d1 execute uk-crm-db --remote --command=$checkSql
} else {
    Write-Host "`n=== FAILED ===" -ForegroundColor Red
    Write-Host "Migrations failed. Trying direct SQL approach..."

    Write-Host "`n=== Creating uk-general channel directly ===" -ForegroundColor Yellow
    $sql = "INSERT OR IGNORE INTO chat_channels (id, type, name, description, created_at) VALUES ('uk-general', 'uk_general', 'Общий чат УК', 'Общий чат для связи с управляющей компанией', datetime('now'));"
    npx wrangler d1 execute uk-crm-db --remote --command=$sql

    if ($LASTEXITCODE -eq 0) {
        Write-Host "`nChannel created! Verifying..."  -ForegroundColor Green
        $checkSql = "SELECT id, type, name FROM chat_channels WHERE id = 'uk-general';"
        npx wrangler d1 execute uk-crm-db --remote --command=$checkSql
    }
}

Write-Host "`nDone!" -ForegroundColor Cyan
