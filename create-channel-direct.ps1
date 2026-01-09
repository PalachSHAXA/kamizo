$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
$env:CLOUDFLARE_API_TOKEN = "MGiQRntLKr1xSAluOW0H_-QrLFTDSMWhluK9_dvZ"
Set-Location "C:\Users\user\Documents\UK-CRM\cloudflare"

Write-Host "Creating uk-general channel..."

$sql = "INSERT OR IGNORE INTO chat_channels (id, type, name, description, created_at) VALUES ('uk-general', 'uk_general', 'Общий чат УК', 'Общий чат для связи с управляющей компанией', datetime('now'));"

npx wrangler d1 execute uk-crm-db --remote --command=$sql

Write-Host "Done!"
