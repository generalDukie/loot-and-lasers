#ifndef MyAppVersion
  #define MyAppVersion "0.1.19"
#endif

#define MyAppName "Loot & Lasers"
#define MyAppExeName "LootAndLasers.exe"
#define MyAppPublisher "Loot & Lasers"
#define MyAppId "{{6B590749-52C1-4E27-BE9D-5C521833654A}"

[Setup]
AppId={#MyAppId}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\Programs\LootAndLasers
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=LootAndLasers-Setup-{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\{#MyAppExeName}
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"

[Files]
Source: "..\dist\windows\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent

[Code]
procedure DeleteDesktopShortcutIfExists(const FileName: String);
begin
  if FileExists(FileName) then
    DeleteFile(FileName);
end;

{ When the player opts into a desktop shortcut, remove any existing / legacy
  Loot & Lasers desktop .lnk first so the new install's icon replaces it
  (same name, or older installer naming) instead of leaving a stale target. }
procedure RemoveStaleDesktopShortcuts;
var
  DesktopDir: String;
begin
  DesktopDir := ExpandConstant('{autodesktop}');
  DeleteDesktopShortcutIfExists(DesktopDir + '\{#MyAppName}.lnk');
  DeleteDesktopShortcutIfExists(DesktopDir + '\LootAndLasers.lnk');
  DeleteDesktopShortcutIfExists(DesktopDir + '\Loot and Lasers.lnk');
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if (CurStep = ssInstall) and WizardIsTaskSelected('desktopicon') then
    RemoveStaleDesktopShortcuts;
end;
