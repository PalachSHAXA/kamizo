# Refresh PATH from system environment
$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')

Write-Host "Building frontend..." -ForegroundColor Cyan
Set-Location "C:\Users\user\Documents\UK-CRM\src\frontend"
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Frontend build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "Frontend built successfully!" -ForegroundColor Green

Write-Host "`nApplying database migrations..." -ForegroundColor Cyan
Set-Location "C:\Users\user\Documents\UK-CRM\cloudflare"
$env:CLOUDFLARE_API_TOKEN = "MGiQRntLKr1xSAluOW0H_-QrLFTDSMWhluK9_dvZ"

Write-Host "Running: wrangler d1 migrations apply uk-crm-db --remote"
npx wrangler d1 migrations apply uk-crm-db --remote

if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: Migrations may have failed. Continuing with deployment..." -ForegroundColor Yellow
}

Write-Host "`nDeploying to Cloudflare..." -ForegroundColor Cyan
npx wrangler deploy

if ($LASTEXITCODE -ne 0) {
    Write-Host "Deployment failed!" -ForegroundColor Red
    exit 1
}

Write-Host "`nDeployment successful!" -ForegroundColor Green
