; Vision Studio - Inno Setup Installer Script
; Handles large payloads (>2GB) that NSIS cannot support

#define MyAppName "Vision Studio"
#define MyAppVersion "3.2.0"
#define MyAppPublisher "Vision Studio Team"
#define MyAppURL "https://github.com/Git-Rocky-Stack/vision-studio"
#define MyAppExeName "Vision Studio.exe"
#define SourceDir "..\release\win-unpacked"
#define OutputDir "..\release"

[Setup]
AppId={{B8F3A2E1-7C4D-4E5F-9A1B-2D3C4E5F6A7B}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
LicenseFile=..\LICENSE.txt
OutputBaseFilename=Vision-Studio-{#MyAppVersion}-Setup
SetupIconFile=..\build\icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2/fast
SolidCompression=no
DiskSpanning=no
WizardStyle=modern
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
SetupLogging=yes
ShowLanguageDialog=auto
CloseApplications=force
CloseApplicationsFilter=*.exe

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: checkedonce
Name: "startmenu"; Description: "Create a Start Menu shortcut"; GroupDescription: "{cm:AdditionalIcons}"; Flags: checkedonce

[Files]
; Backend exe is ~2.4GB — store without compression to avoid OOM
Source: "{#SourceDir}\resources\VisionStudio-Backend.exe"; DestDir: "{app}\resources"; Flags: ignoreversion nocompression
; Everything else with normal compression
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "resources\VisionStudio-Backend.exe"

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent shellexec

[UninstallDelete]
Type: dirifempty; Name: "{app}\logs"
Type: dirifempty; Name: "{app}\GPUCache"

[Code]
function KillProcess(const ProcessName: string): Boolean;
var
  ResultCode: Integer;
begin
  Exec('taskkill.exe', '/F /IM "' + ProcessName + '"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := (ResultCode = 0);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  // Kill backend and main app before installing to prevent file locks
  KillProcess('VisionStudio-Backend.exe');
  KillProcess('Vision Studio.exe');
  Sleep(1000);
  Result := '';
end;

procedure InitializeWizard;
begin
  WizardForm.WelcomeLabel2.Caption :=
    'This will install {#MyAppName} {#MyAppVersion} on your computer.' + #13#10 + #13#10 +
    'System Requirements:' + #13#10 +
    '  - Windows 10/11 64-bit' + #13#10 +
    '  - 8 GB RAM minimum (16 GB recommended)' + #13#10 +
    '  - ~4 GB disk space for installation' + #13#10 +
    '  - NVIDIA GPU with 8GB+ VRAM (optional)' + #13#10 + #13#10 +
    'Click Next to continue.';
end;
