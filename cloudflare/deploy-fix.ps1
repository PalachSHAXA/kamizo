# Refresh PATH from system environment
$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')

# Set working directory
Set-Location "C:\Users\user\Documents\UK-CRM\cloudflare"

# Set API token
$env:CLOUDFLARE_API_TOKEN = "MGiQRntLKr1xSAluOW0H_-QrLFTDSMWhluK9_dvZ"

# Deploy
npx wrangler deploy
