# Load DATABASE_URL from .env if not already set
if (-not $env:DATABASE_URL -and (Test-Path ".env")) {
  $line = Get-Content ".env" | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
  if ($line) { $env:DATABASE_URL = $line -replace '^DATABASE_URL=', '' }
}
$env:NODE_ENV="development"
$env:PORT="5000"
npm run dev




