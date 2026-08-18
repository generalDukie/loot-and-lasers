# Deploy Node API to Hetzner staging (public HTTPS -> 127.0.0.1:8787).
# Prerequisites: SSH key authorized for root@178.156.210.186; Docker on the host.
#
# Usage (from repo root, PowerShell):
#   .\scripts\deploy-hetzner-node-api.ps1
#   .\scripts\deploy-hetzner-node-api.ps1 -IdentityFile "$env:USERPROFILE\.ssh\loot_hetzner_deploy"
#   .\scripts\deploy-hetzner-node-api.ps1 -Interactive
#       # prompts for key passphrase (no ssh-agent required)

param(
  [string]$HostIp = "178.156.210.186",
  [string]$User = "root",
  [string]$RemoteDir = "/opt/lootandlasers",
  [string]$IdentityFile = "",
  [switch]$Interactive,
  [switch]$AllowDirty
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

if ($RemoteDir -notmatch '^/[A-Za-z0-9._/-]+$') {
  throw "RemoteDir must be an absolute path containing only letters, numbers, dot, underscore, dash, and slash."
}

$gitSha = (& git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $gitSha -notmatch '^[0-9a-f]{40}$') {
  throw "A valid Git commit is required for a traceable deployment."
}
$trackedChanges = (& git status --porcelain --untracked-files=no) -join "`n"
$isDirty = -not [string]::IsNullOrWhiteSpace($trackedChanges)
if ($isDirty -and -not $AllowDirty) {
  throw "Tracked files differ from commit $gitSha. Commit them first, or pass -AllowDirty explicitly."
}
$shortSha = $gitSha.Substring(0, 12)
$timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$packageVersion = (Get-Content (Join-Path $Root "package.json") -Raw | ConvertFrom-Json).version
$releaseVersion = "${packageVersion}+${shortSha}"
$buildId = "${shortSha}-${timestamp}"
if ($isDirty) { $buildId = "${buildId}-dirty" }

$DefaultHetznerIdentityFile = Join-Path $env:USERPROFILE "Desktop\LootLasers\SSH\Farts"
$ThisMachineHetznerIdentityFile = Join-Path $env:USERPROFILE ".ssh\loot_hetzner_deploy"

if (-not $IdentityFile) {
  if (Test-Path $ThisMachineHetznerIdentityFile) {
    $IdentityFile = $ThisMachineHetznerIdentityFile
  } elseif (Test-Path $DefaultHetznerIdentityFile) {
    $IdentityFile = $DefaultHetznerIdentityFile
  } else {
    $fallbackKey = Join-Path $env:USERPROFILE ".ssh\id_ed25519"
    if (Test-Path $fallbackKey) { $IdentityFile = $fallbackKey }
  }
}

$sshTarget = "${User}@${HostIp}"
$sshBase = @("-o", "StrictHostKeyChecking=accept-new")
if (-not $Interactive) {
  # Non-interactive CI-style runs cannot prompt for a passphrase.
  $sshBase += @("-o", "BatchMode=yes")
}
if ($IdentityFile) {
  $sshBase += @("-i", $IdentityFile, "-o", "IdentitiesOnly=yes")
}

function Invoke-Remote([string]$Cmd) {
  & ssh @sshBase $sshTarget $Cmd
  if ($LASTEXITCODE -ne 0) { throw "Remote command failed ($LASTEXITCODE): $Cmd" }
}

if ($Interactive) {
  Write-Host "Interactive SSH (passphrase prompts allowed) using key: $IdentityFile"
}

Write-Host "Checking SSH $sshTarget..."
Invoke-Remote "echo ok && command -v docker && docker compose version"

Write-Host "Ensuring remote dir $RemoteDir..."
Invoke-Remote "mkdir -p $RemoteDir"

$archive = Join-Path $env:TEMP "loot-node-api-deploy-${buildId}.tgz"
if (Test-Path $archive) { Remove-Item $archive -Force }

Write-Host "Packaging sources..."
Write-Host "  release: $releaseVersion"
Write-Host "  git sha: $gitSha"
Write-Host "  build:   $buildId"
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
  package.json package-lock.json `
  src/lib server scripts/backup-node-api.sh deploy .env.backup.example
if ($LASTEXITCODE -ne 0) { throw "tar failed" }

Write-Host "Uploading archive..."
& scp @sshBase $archive "${sshTarget}:${RemoteDir}/deploy.tgz"
if ($LASTEXITCODE -ne 0) { throw "scp failed" }

$buildMetadataPath = Join-Path $env:TEMP "loot-node-api-build-${buildId}.env"
$buildMetadata = @(
  "RELEASE_VERSION=$releaseVersion"
  "GIT_SHA=$gitSha"
  "BUILD_ID=$buildId"
) -join "`n"
[System.IO.File]::WriteAllText(
  $buildMetadataPath,
  "${buildMetadata}`n",
  [System.Text.Encoding]::ASCII
)
& scp @sshBase $buildMetadataPath "${sshTarget}:${RemoteDir}/.deploy-build.env"
if ($LASTEXITCODE -ne 0) { throw "build metadata upload failed" }

$remoteScriptPath = Join-Path $env:TEMP "loot-node-api-remote.sh"
@'
set -euo pipefail
cd __REMOTE_DIR__
tar -xzf deploy.tgz
rm -f deploy.tgz
if [ ! -f .env.node-api ]; then
  cp .env.node-api.example .env.node-api
  SECRET=$(openssl rand -hex 32)
  sed -i "s/REPLACE_WITH_LONG_RANDOM_SECRET/${SECRET}/" .env.node-api
  BRIDGE_SECRET=$(openssl rand -hex 32)
  sed -i "s/REPLACE_WITH_A_DIFFERENT_LONG_RANDOM_SECRET/${BRIDGE_SECRET}/" .env.node-api
  echo "Created .env.node-api with fresh JWT and service secrets"
fi
if command -v ufw >/dev/null 2>&1; then
  ufw allow 8787/tcp || true
fi
if command -v firewall-cmd >/dev/null 2>&1; then
  firewall-cmd --permanent --add-port=8787/tcp || true
  firewall-cmd --reload || true
fi
docker compose -f docker-compose.node-api.yml \
  --env-file .env.node-api \
  --env-file .deploy-build.env \
  up -d --build
sleep 4
curl -fsS http://127.0.0.1:8787/health
echo
BUILD_JSON=$(curl -fsS http://127.0.0.1:8787/health/build)
echo "$BUILD_JSON"
set -a
. ./.deploy-build.env
set +a
echo "$BUILD_JSON" | grep -F "\"git_sha\":\"${GIT_SHA}\"" >/dev/null
docker compose -f docker-compose.node-api.yml \
  --env-file .env.node-api \
  --env-file .deploy-build.env \
  ps

if [ -f /etc/lootandlasers/backup.env ]; then
  if ! command -v restic >/dev/null 2>&1; then
    echo "Backup credentials exist, but restic is not installed." >&2
    exit 1
  fi
  chmod +x scripts/backup-node-api.sh
  install -m 0644 deploy/lootandlasers-node-backup.service /etc/systemd/system/
  install -m 0644 deploy/lootandlasers-node-backup.timer /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable --now lootandlasers-node-backup.timer
  echo "Encrypted offsite backup timer enabled"
else
  echo "Backup timer not enabled: install /etc/lootandlasers/backup.env from .env.backup.example"
fi
'@ | Set-Content -Path $remoteScriptPath -Encoding ascii -NoNewline
# Ensure LF endings for bash
$bytes = [System.IO.File]::ReadAllBytes($remoteScriptPath)
$text = [System.Text.Encoding]::ASCII.GetString($bytes) -replace "`r`n", "`n" -replace "`r", "`n"
$text = $text.Replace("__REMOTE_DIR__", $RemoteDir)
[System.IO.File]::WriteAllText($remoteScriptPath, $text)

Write-Host "Uploading remote build script..."
& scp @sshBase $remoteScriptPath "${sshTarget}:${RemoteDir}/_deploy.sh"
if ($LASTEXITCODE -ne 0) { throw "scp script failed" }

Write-Host "Extracting and building on host..."
Invoke-Remote "bash ${RemoteDir}/_deploy.sh && rm -f ${RemoteDir}/_deploy.sh"

Write-Host ""
Write-Host "Public health check (HTTPS reverse proxy)..."
try {
  $h = Invoke-WebRequest -Uri "https://${HostIp}/health/build" -UseBasicParsing -TimeoutSec 15
  Write-Host $h.Content
  if ($h.Content -notmatch [regex]::Escape($gitSha)) {
    throw "Public build metadata does not contain deployed Git SHA $gitSha"
  }
} catch {
  Write-Warning "HTTPS /health failed: $($_.Exception.Message)"
  Write-Warning "Node binds 127.0.0.1:8787 - confirm nginx proxies 443 to that port."
  throw
}

foreach ($tempFile in @($archive, $remoteScriptPath, $buildMetadataPath)) {
  if (Test-Path -LiteralPath $tempFile) { Remove-Item -LiteralPath $tempFile -Force }
}

Write-Host "Done. Staging NODE URL: https://${HostIp}"
