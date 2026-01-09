$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
$env:CLOUDFLARE_API_TOKEN = "MGiQRntLKr1xSAluOW0H_-QrLFTDSMWhluK9_dvZ"
Set-Location "C:\Users\user\Documents\UK-CRM\cloudflare"

Write-Host "=== Testing message insertion ===" -ForegroundColor Cyan

# Test 1: Check if uk-general channel exists
Write-Host "`n1. Checking if uk-general channel exists..." -ForegroundColor Yellow
$checkChannel = "SELECT id, type, name FROM chat_channels WHERE id = 'uk-general';"
npx wrangler d1 execute uk-crm-db --remote --command=$checkChannel

# Test 2: Get a test user ID
Write-Host "`n2. Getting a test user (first resident)..." -ForegroundColor Yellow
$getUser = "SELECT id, name, role FROM users WHERE role = 'resident' LIMIT 1;"
npx wrangler d1 execute uk-crm-db --remote --command=$getUser

Write-Host "`n3. Attempting to insert a test message..." -ForegroundColor Yellow
Write-Host "Note: Replace USER_ID below with actual user ID from step 2" -ForegroundColor Cyan

# Test 3: Try to insert a message (use actual user ID)
# This will be manual - user needs to copy ID from step 2

Write-Host "`n=== Analysis ===" -ForegroundColor Cyan
Write-Host "Based on the results above:" -ForegroundColor White
Write-Host "- If uk-general channel exists -> channel is OK" -ForegroundColor Green
Write-Host "- If we have a resident user -> we can test message insert" -ForegroundColor Green
Write-Host "`nTo test message insert manually, run:" -ForegroundColor Yellow
Write-Host "npx wrangler d1 execute uk-crm-db --remote --command=`"INSERT INTO chat_messages (id, channel_id, sender_id, content) VALUES ('test-msg-001', 'uk-general', 'USER_ID_HERE', 'Test message');`"" -ForegroundColor Cyan

Write-Host "`nDone!" -ForegroundColor Green
