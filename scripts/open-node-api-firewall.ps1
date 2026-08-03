# Run in elevated PowerShell (Right-click → Run as administrator)
# Opens inbound TCP 8787 so LAN friends can reach the Node auth API.

$ErrorActionPreference = "Stop"
$name = "LootLasers Node API 8787"
$existing = Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "Firewall rule already exists: $name"
} else {
  New-NetFirewallRule -DisplayName $name -Direction Inbound -Protocol TCP -LocalPort 8787 -Action Allow | Out-Null
  Write-Host "Added firewall rule: $name"
}

Write-Host ""
Write-Host "Use one of these as LOOT_NODE_API_URL for friends on your LAN:"
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike "127.*" -and $_.PrefixOrigin -ne "WellKnown" } |
  ForEach-Object { Write-Host ("  http://{0}:8787  ({1})" -f $_.IPAddress, $_.InterfaceAlias) }
