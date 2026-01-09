$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
$env:CLOUDFLARE_API_TOKEN = "MGiQRntLKr1xSAluOW0H_-QrLFTDSMWhluK9_dvZ"
Set-Location "C:\Users\user\Documents\UK-CRM\cloudflare"

Write-Host "=== Fixing chat_messages FK - Step by Step ===" -ForegroundColor Cyan

Write-Host "`nStep 1: Create new table with correct FK" -ForegroundColor Yellow
npx wrangler d1 execute uk-crm-db --remote --file=fix_fk_manual.sql

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Table created" -ForegroundColor Green

    Write-Host "`nStep 2: Copy data from old table" -ForegroundColor Yellow
    npx wrangler d1 execute uk-crm-db --remote --command="INSERT INTO chat_messages_new SELECT * FROM chat_messages;"

    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Data copied" -ForegroundColor Green

        Write-Host "`nStep 3: Drop old table" -ForegroundColor Yellow
        npx wrangler d1 execute uk-crm-db --remote --command="DROP TABLE chat_messages;"

        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Old table dropped" -ForegroundColor Green

            Write-Host "`nStep 4: Rename new table" -ForegroundColor Yellow
            npx wrangler d1 execute uk-crm-db --remote --command="ALTER TABLE chat_messages_new RENAME TO chat_messages;"

            if ($LASTEXITCODE -eq 0) {
                Write-Host "✅ Table renamed" -ForegroundColor Green

                Write-Host "`n=== SUCCESS ===" -ForegroundColor Green
                Write-Host "Verifying..." -ForegroundColor Cyan
                npx wrangler d1 execute uk-crm-db --remote --command="SELECT sql FROM sqlite_master WHERE name='chat_messages';"
            }
        }
    }
}

Write-Host "`nDone!" -ForegroundColor Cyan
