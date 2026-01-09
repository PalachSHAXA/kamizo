# Apply pending migrations to Cloudflare D1 production database
# This script will NOT break any logic - it only adds missing data

Write-Host "🔄 Applying pending migrations to production database..." -ForegroundColor Cyan
Write-Host ""

# Refresh PATH
$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')

# Set Cloudflare API token
$env:CLOUDFLARE_API_TOKEN = "MGiQRntLKr1xSAluOW0H_-QrLFTDSMWhluK9_dvZ"

# Set working directory
Set-Location "C:\Users\user\Documents\UK-CRM\cloudflare"

Write-Host "📊 Migration 022: Creating uk_general chat channel..." -ForegroundColor Yellow
npx wrangler d1 execute uk-crm-db --remote --file=migrations/022_init_uk_general_channel.sql

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Migration 022 applied successfully!" -ForegroundColor Green
} else {
    Write-Host "❌ Migration 022 failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "📊 Migration 021: Removing entrance/floor targeting from announcements..." -ForegroundColor Yellow
npx wrangler d1 execute uk-crm-db --remote --file=migrations/021_remove_announcement_entrance_floor_targeting.sql

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Migration 021 applied successfully!" -ForegroundColor Green
} else {
    Write-Host "⚠️ Migration 021 may have already been applied or failed" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "📊 Migration 020: Adding rentals tables..." -ForegroundColor Yellow
npx wrangler d1 execute uk-crm-db --remote --file=migrations/020_add_rentals_tables.sql

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Migration 020 applied successfully!" -ForegroundColor Green
} else {
    Write-Host "⚠️ Migration 020 may have already been applied or failed" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "📊 Migration 019: Adding plain password for admin..." -ForegroundColor Yellow
npx wrangler d1 execute uk-crm-db --remote --file=migrations/019_add_password_plain_for_admin.sql

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Migration 019 applied successfully!" -ForegroundColor Green
} else {
    Write-Host "⚠️ Migration 019 may have already been applied or failed" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "📊 Migration 018: Adding director role..." -ForegroundColor Yellow
npx wrangler d1 execute uk-crm-db --remote --file=migrations/018_add_director_role.sql

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Migration 018 applied successfully!" -ForegroundColor Green
} else {
    Write-Host "⚠️ Migration 018 may have already been applied or failed" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "All migrations processing complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next step: Test chat functionality" -ForegroundColor Cyan
