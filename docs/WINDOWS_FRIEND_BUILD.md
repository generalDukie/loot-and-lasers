# Windows friend build

The friend build is a staging-bound Windows installer. Players install and launch
it without PowerShell, environment variables, repository access, or Hetzner access.

## What is packaged

- Nakama: `https://178.156.210.186:8443`
- Node gameplay API: `https://178.156.210.186`
- The Nakama client server key required by every game client

The installer never packages the wallet bridge secret, Node JWT secret, database
credentials, Hetzner credentials, or administrator credentials. The Nakama client
key is inherently recoverable from a distributed client and must not be reused as
a server-side administrative secret.

## Prerequisites

1. Godot 4.7.1 and its Windows export templates
2. Inno Setup 6
3. SSH access to Hetzner (`root@178.156.210.186`) — the build script pulls the live
   `NAKAMA_SOCKET_SERVER_KEY` from `/opt/lootandlasers/.env` automatically.
   Default identity: `%USERPROFILE%\Desktop\LootLasers\SSH\Farts`

   Offline fallback (`-SkipRemoteKeySync`): local `Config/nakama_secrets.cfg` or
   env `NAKAMA_SOCKET_SERVER_KEY`. Those must still match Hetzner or friends get
   “Invalid server key”.

## Build

From the repository root:

```powershell
.\scripts\build-windows-installer.ps1 -Version "0.1.19"
```

If your SSH key is passphrase-protected (common), use:

```powershell
.\scripts\build-windows-installer.ps1 -Version "0.1.19" -Interactive
```

The script:

1. **SSH to Hetzner and reads the live** `NAKAMA_SOCKET_SERVER_KEY` from `/opt/lootandlasers/.env` (source of truth);
2. writes that key into gitignored `Config/nakama_secrets.cfg` so local editor + future builds stay aligned;
3. writes a temporary, gitignored `Config/release_client.cfg`;
4. exports the `Windows Staging` Godot preset (custom feature `staging_client`);
5. **verifies** the exported exe embeds that exact key (fails the build on mismatch/missing bake);
6. deletes the temporary configuration in a `finally` block;
7. compiles `dist\LootAndLasers-Setup-0.1.19.exe`.

You no longer need to hand-copy the key before each installer build. Use `-SkipRemoteKeySync` only for offline/emergency local bakes.

Friend builds read **only** the baked `release_client.cfg` key — they ignore machine env vars. If login shows “Server key invalid” / “Staging server key invalid”, rebuild with remote sync enabled (default) so the bake matches Hetzner, then reinstall.

To use non-default tool locations:

```powershell
.\scripts\build-windows-installer.ps1 `
  -Version "0.1.9" `
  -GodotPath "C:\path\to\Godot_console.exe" `
  -InnoCompilerPath "C:\path\to\ISCC.exe"
```

## Share and install

Send only the generated installer from `dist\`. Friends run it, accept the default
per-user installation directory, and launch from the Start Menu or desktop.

This friends/test installer is unsigned. Windows SmartScreen may show a warning:
select **More info**, verify the filename, then select **Run anyway**. A public
release should use a trusted code-signing certificate.

## Release verification

Before sharing:

1. confirm raw ports 7350 and 8787 remain inaccessible publicly;
2. install the generated build without staging environment variables;
3. confirm the badge shows HTTPS Nakama and Node endpoints;
4. register or log in, restore a Character, and verify account isolation;
5. uninstall from Windows Settings.
