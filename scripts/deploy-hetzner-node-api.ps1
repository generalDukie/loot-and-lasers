# Deploy Node API to Hetzner staging (public HTTPS -> 127.0.0.1:8787).
# Prerequisites: SSH key authorized for root@178.156.210.186; Docker on the host.
#
# Usage (from repo root, PowerShell):
#   .\scripts\deploy-hetzner-node-api.ps1
#   .\scripts\deploy-hetzner-node-api.ps1 -IdentityFile "$env:USERPROFILE\.ssh\id_ed25519"

param(
  [string]$HostIp = "178.156.210.186",
  [string]$User = "root",
  [string]$RemoteDir = "/opt/lootandlasers",
  [string]$IdentityFile = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$sshTarget = "${User}@${HostIp}"
$sshBase = @("-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new")
if ($IdentityFile) {
  $sshBase += @("-i", $IdentityFile, "-o", "IdentitiesOnly=yes")
}

function Invoke-Remote([string]$Cmd) {
  & ssh @sshBase $sshTarget $Cmd
  if ($LASTEXITCODE -ne 0) { throw "Remote command failed ($LASTEXITCODE): $Cmd" }
}

Write-Host "Checking SSH $sshTarget..."
Invoke-Remote "echo ok && command -v docker && docker compose version"

Write-Host "Ensuring remote dir $RemoteDir..."
Invoke-Remote "mkdir -p $RemoteDir"

$archive = Join-Path $env:TEMP "loot-node-api-deploy.tgz"
if (Test-Path $archive) { Remove-Item $archive -Force }

Write-Host "Packaging sources..."
if (-not (Get-Command tar -ErrorAction SilentlyContinue)) {
  throw "tar is required (install Git for Windows)."
}

& tar -czf $archive `
  --exclude=node_modules `
  --exclude=server/node_modules `
  --exclude=server/data `
  --exclude=dist `
  --exclude=.git `
  Dockerfile docker-entrypoint.sh docker-compose.node-api.yml .env.node-api.example .dockerignore `
  package.json package-lock.json index.html vite.config.js tailwind.config.js postcss.config.js jsconfig.json components.json `
  public src server
if ($LASTEXITCODE -ne 0) { throw "tar failed" }

Write-Host "Uploading archive..."
& scp @sshBase $archive "${sshTarget}:${RemoteDir}/deploy.tgz"
if ($LASTEXITCODE -ne 0) { throw "scp failed" }

$remoteScriptPath = Join-Path $env:TEMP "loot-node-api-remote.sh"
@'
set -euo pipefail
cd /opt/lootandlasers
tar -xzf deploy.tgz
rm -f deploy.tgz
if [ ! -f .env.node-api ]; then
  cp .env.node-api.example .env.node-api
  SECRET=$(openssl rand -hex 32)
  sed -i "s/REPLACE_WITH_LONG_RANDOM_SECRET/${SECRET}/" .env.node-api
  echo "Created .env.node-api with fresh JWT_SECRET"
fi
if command -v ufw >/dev/null 2>&1; then
  ufw allow 8787/tcp || true
fi
if command -v firewall-cmd >/dev/null 2>&1; then
  firewall-cmd --permanent --add-port=8787/tcp || true
  firewall-cmd --reload || true
fi
docker compose -f docker-compose.node-api.yml --env-file .env.node-api up -d --build
sleep 4
curl -fsS http://127.0.0.1:8787/health
echo
docker compose -f docker-compose.node-api.yml --env-file .env.node-api ps
'@ | Set-Content -Path $remoteScriptPath -Encoding ascii -NoNewline
# Ensure LF endings for bash
$bytes = [System.IO.File]::ReadAllBytes($remoteScriptPath)
$text = [System.Text.Encoding]::ASCII.GetString($bytes) -replace "`r`n", "`n" -replace "`r", "`n"
[System.IO.File]::WriteAllText($remoteScriptPath, $text)

Write-Host "Uploading remote build script..."
& scp @sshBase $remoteScriptPath "${sshTarget}:${RemoteDir}/_deploy.sh"
if ($LASTEXITCODE -ne 0) { throw "scp script failed" }

Write-Host "Extracting and building on host..."
Invoke-Remote "bash ${RemoteDir}/_deploy.sh && rm -f ${RemoteDir}/_deploy.sh"

Write-Host ""
Write-Host "Public health check (HTTPS reverse proxy)..."
try {
  $h = Invoke-WebRequest -Uri "https://${HostIp}/health" -UseBasicParsing -TimeoutSec 15
  Write-Host $h.Content
} catch {
  Write-Warning "HTTPS /health failed: $($_.Exception.Message)"
  Write-Warning "Node binds 127.0.0.1:8787 - confirm nginx proxies 443 to that port."
}

Write-Host "Done. Staging NODE URL: https://${HostIp}"
