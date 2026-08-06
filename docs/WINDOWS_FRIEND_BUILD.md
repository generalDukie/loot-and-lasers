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
3. The Hetzner staging socket key in **either**:
   - `loot&lasers/Config/nakama_secrets.cfg` (`[staging] server_key=…`, preferred), or
   - user env `NAKAMA_SOCKET_SERVER_KEY`

   The value must match `/opt/lootandlasers/.env` on Hetzner (`NAKAMA_SOCKET_SERVER_KEY`).
   A key that only exists on the build PC (and not on the server) produces
   “Invalid server key” / auth failures on friend machines.

## Build

From the repository root:

```powershell
.\scripts\build-windows-installer.ps1 -Version "0.1.8"
```

The script:

1. validates the user-scoped staging client key;
2. writes a temporary, gitignored release configuration;
3. exports the `Windows Staging` Godot preset;
4. deletes the temporary configuration in a `finally` block;
5. compiles `dist\LootAndLasers-Setup-0.1.8.exe`.

To use non-default tool locations:

```powershell
.\scripts\build-windows-installer.ps1 `
  -Version "0.1.8" `
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
