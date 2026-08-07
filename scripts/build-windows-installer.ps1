param(
    [string]$Version = "0.1.12",
    [string]$GodotPath = "",
    [string]$InnoCompilerPath = "",
    # Pull live NAKAMA_SOCKET_SERVER_KEY from Hetzner before baking (default on).
    [switch]$SkipRemoteKeySync,
    [string]$HostIp = "178.156.210.186",
    [string]$User = "root",
    [string]$IdentityFile = "",
    [switch]$Interactive
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ProjectDir = Join-Path $Root ("loot" + [char]38 + "lasers")
$SecretsConfig = Join-Path $ProjectDir "Config\nakama_secrets.cfg"
$ReleaseConfig = Join-Path $ProjectDir "Config\release_client.cfg"
$ExportDir = Join-Path $Root "dist\windows"
$ExportExe = Join-Path $ExportDir "LootAndLasers.exe"
$InstallerScript = Join-Path $Root "installer\LootAndLasers.iss"
$LF = [string][char]10

function Resolve-Executable {
    param(
        [string]$ExplicitPath,
        [string[]]$Candidates,
        [string]$Label
    )

    if ($ExplicitPath -and (Test-Path $ExplicitPath)) {
        return (Resolve-Path $ExplicitPath).Path
    }
    foreach ($candidate in $Candidates) {
        if (-not $candidate) { continue }
        $command = Get-Command $candidate -ErrorAction SilentlyContinue
        if ($command) { return $command.Source }
        if (Test-Path $candidate) { return (Resolve-Path $candidate).Path }
    }
    throw "$Label was not found. Install it or pass its path explicitly."
}

function Read-StagingServerKeyFromSecrets([string]$Path) {
    if (-not (Test-Path $Path)) { return "" }
    foreach ($line in Get-Content -Path $Path) {
        $trim = $line.Trim()
        if ($trim.StartsWith(";") -or $trim.StartsWith("#")) { continue }
        if ($trim -match '^\s*server_key\s*=\s*(.+)\s*$') {
            return $Matches[1].Trim().Trim('"').Trim("'")
        }
    }
    return ""
}

function Write-StagingSecretsFile([string]$Path, [string]$ServerKey) {
    $dir = Split-Path -Parent $Path
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
    $contents = @(
        "; Local staging secrets - gitignored. Synced from Hetzner by build-windows-installer.ps1."
        "[staging]"
        ("server_key=" + $ServerKey)
    ) -join $LF
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($Path, $contents, $utf8NoBom)
}

function Get-HetznerStagingServerKey {
    param(
        [string]$HostIp,
        [string]$User,
        [string]$IdentityFile,
        [switch]$Interactive
    )

    if (-not $IdentityFile) {
        $defaultKey = Join-Path $env:USERPROFILE ".ssh\id_ed25519"
        if (Test-Path $defaultKey) { $IdentityFile = $defaultKey }
    }

    $sshTarget = "${User}@${HostIp}"
    $sshBase = @("-o", "StrictHostKeyChecking=accept-new")
    if (-not $Interactive) {
        $sshBase += @("-o", "BatchMode=yes")
    }
    if ($IdentityFile) {
        $sshBase += @("-i", $IdentityFile, "-o", "IdentitiesOnly=yes")
    }

    if ($Interactive) {
        Write-Host "Interactive SSH (passphrase prompts allowed) using key: $IdentityFile"
    }

    Write-Host "Fetching live staging Nakama key from $sshTarget..."
    # Print only the raw value; local script validates shape and never logs the full key.
    $remoteCmd = "grep -E '^NAKAMA_SOCKET_SERVER_KEY=' /opt/lootandlasers/.env | head -1 | cut -d= -f2- | tr -d '\r\n '"
    $remote = & ssh @sshBase $sshTarget $remoteCmd
    if ($LASTEXITCODE -ne 0) {
        throw "SSH failed while reading Hetzner NAKAMA_SOCKET_SERVER_KEY (exit $LASTEXITCODE). Use -Interactive if your key needs a passphrase, or -SkipRemoteKeySync to bake a local key."
    }
    $key = if ($null -eq $remote) { "" } else { ([string]$remote).Trim() }
    if ($key -notmatch "^[0-9a-fA-F]{64}$") {
        throw "Hetzner NAKAMA_SOCKET_SERVER_KEY missing/invalid (expected 64 hex chars). Check /opt/lootandlasers/.env on the host."
    }
    return $key
}

function Assert-BakedStagingKeyInExe([string]$ExePath, [string]$ExpectedKey) {
    if (-not (Test-Path $ExePath)) {
        throw "Exported exe missing at $ExePath - cannot verify baked staging key."
    }
    # Friend builds embed release_client.cfg inside the PCK. Confirm the exact
    # key bytes are present so a bad bake cannot ship as "Server key invalid".
    $bytes = [System.IO.File]::ReadAllBytes($ExePath)
    $ascii = [System.Text.Encoding]::ASCII.GetString($bytes)
    if (-not $ascii.Contains("release_client.cfg")) {
        throw "Exported exe is missing release_client.cfg - staging key was not packaged."
    }
    if ($ascii.Contains("nakama_secrets.cfg")) {
        throw "Exported exe unexpectedly contains nakama_secrets.cfg (must stay excluded)."
    }
    $needle = 'server_key="' + $ExpectedKey + '"'
    if (-not $ascii.Contains($needle)) {
        $rx = [regex]'server_key\s*=\s*"?([0-9a-fA-F]{16,})"?'
        $hit = $rx.Match($ascii)
        $foundTail = if ($hit.Success -and $hit.Groups[1].Value.Length -ge 2) {
            $hit.Groups[1].Value.Substring($hit.Groups[1].Value.Length - 2)
        } else { "missing" }
        $expectTail = $ExpectedKey.Substring($ExpectedKey.Length - 2)
        throw ("Exported exe baked staging key mismatch (found_tail={0}, expected_tail={1})." -f $foundTail, $expectTail)
    }
    Write-Host ("Verified baked staging key in exe (len={0}, tail={1})" -f $ExpectedKey.Length, $ExpectedKey.Substring($ExpectedKey.Length - 2))
}

$Godot = Resolve-Executable -ExplicitPath $GodotPath -Label "Godot 4.7.1" -Candidates @(
    "godot",
    "godot4",
    (Join-Path $env:USERPROFILE "Desktop\Stuff\Loot and lasers\Godot_v4.7.1-stable_win64_console.exe"),
    (Join-Path $env:USERPROFILE "Desktop\Stuff\Loot and lasers\Godot_v4.7.1-stable_win64.exe"),
    (Join-Path $env:USERPROFILE "Downloads\Godot_v4.7.1-stable_win64.exe\Godot_v4.7.1-stable_win64_console.exe"),
    (Join-Path $env:USERPROFILE "Downloads\Godot_v4.7.1-stable_win64.exe\Godot_v4.7.1-stable_win64.exe")
)

$Inno = Resolve-Executable -ExplicitPath $InnoCompilerPath -Label "Inno Setup Compiler" -Candidates @(
    "ISCC.exe",
    (Join-Path ${env:ProgramFiles(x86)} "Inno Setup 6\ISCC.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 6\ISCC.exe")
)

# Source of truth: live Hetzner key (auto-sync), unless explicitly skipped.
$KeySource = ""
$Key = ""
if (-not $SkipRemoteKeySync) {
    $Key = Get-HetznerStagingServerKey -HostIp $HostIp -User $User -IdentityFile $IdentityFile -Interactive:$Interactive
    $KeySource = "Hetzner /opt/lootandlasers/.env"
    Write-StagingSecretsFile -Path $SecretsConfig -ServerKey $Key
    Write-Host ("Synced Config/nakama_secrets.cfg from Hetzner (len={0}, tail={1})" -f $Key.Length, $Key.Substring($Key.Length - 2))
} else {
    Write-Host "SkipRemoteKeySync set - using local key sources only."
    $Key = Read-StagingServerKeyFromSecrets $SecretsConfig
    if (-not [string]::IsNullOrWhiteSpace($Key)) {
        $KeySource = "Config/nakama_secrets.cfg"
    } else {
        $Key = $env:NAKAMA_SOCKET_SERVER_KEY
        if ([string]::IsNullOrWhiteSpace($Key)) {
            $Key = [Environment]::GetEnvironmentVariable("NAKAMA_SOCKET_SERVER_KEY", "User")
        }
        if (-not [string]::IsNullOrWhiteSpace($Key)) {
            $KeySource = "NAKAMA_SOCKET_SERVER_KEY"
        }
    }
}

$Key = if ($null -eq $Key) { "" } else { $Key.Trim() }
if ($Key -notmatch "^[0-9a-fA-F]{64}$") {
    throw ("Staging server key missing/invalid. Re-run without -SkipRemoteKeySync (needs SSH to Hetzner), or set " + $ProjectDir + "\Config\nakama_secrets.cfg [staging] server_key.")
}

Write-Host ("Using staging server key from {0} (len={1}, tail={2})" -f $KeySource, $Key.Length, $Key.Substring($Key.Length - 2))

New-Item -ItemType Directory -Force -Path $ExportDir | Out-Null
$releaseConfigContents = @(
    "; Generated by scripts/build-windows-installer.ps1. Never commit this file."
    "[staging]"
    ('server_key="' + $Key + '"')
) -join $LF

try {
    # UTF-8 without BOM - BOM can break Godot ConfigFile section parsing on some builds.
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($ReleaseConfig, $releaseConfigContents, $utf8NoBom)

    & $Godot --headless --path "$ProjectDir" --export-release "Windows Staging" "$ExportExe"
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $ExportExe)) {
        throw "Godot Windows export failed."
    }

    Assert-BakedStagingKeyInExe -ExePath $ExportExe -ExpectedKey $Key

    & $Inno "/DMyAppVersion=$Version" "$InstallerScript"
    if ($LASTEXITCODE -ne 0) {
        throw "Inno Setup compilation failed."
    }
}
finally {
    Remove-Item -Path $ReleaseConfig -Force -ErrorAction SilentlyContinue
}

$Installer = Join-Path $Root "dist\LootAndLasers-Setup-$Version.exe"
if (-not (Test-Path $Installer)) {
    throw "Installer output was not created at $Installer"
}

Write-Host "Installer ready:"
Write-Host $Installer
