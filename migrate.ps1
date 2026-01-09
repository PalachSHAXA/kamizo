$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
$env:CLOUDFLARE_API_TOKEN = "MGiQRntLKr1xSAluOW0H_-QrLFTDSMWhluK9_dvZ"
Set-Location "C:\Users\user\Documents\UK-CRM\cloudflare"

Write-Host "Applying migration 022..."
npx wrangler d1 execute uk-crm-db --remote --file=migrations/022_init_uk_general_channel.sql

Write-Host "Applying migration 021..."
npx wrangler d1 execute uk-crm-db --remote --file=migrations/021_remove_announcement_entrance_floor_targeting.sql

Write-Host "Applying migration 020..."
npx wrangler d1 execute uk-crm-db --remote --file=migrations/020_add_rentals_tables.sql

Write-Host "Applying migration 019..."
npx wrangler d1 execute uk-crm-db --remote --file=migrations/019_add_password_plain_for_admin.sql

Write-Host "Applying migration 018..."
npx wrangler d1 execute uk-crm-db --remote --file=migrations/018_add_director_role.sql

Write-Host "Done!"
