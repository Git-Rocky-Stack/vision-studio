[Setup]
AppId={{D6A91C5B-8797-5707-93BB-1C19079A50DF}
AppName=Vision Studio
AppVersion=3.0.0
AppVerName=Vision Studio 3.0.0
AppPublisher=Vision Studio Team
AppPublisherURL=https://github.com/Git-Rocky-Stack/vision-studio
AppSupportURL=https://github.com/Git-Rocky-Stack/vision-studio/issues
DefaultDirName={autopf}\Vision Studio
DefaultGroupName=Vision Studio
AllowNoIcons=yes
LicenseFile=LICENSE.txt
OutputDir=release
OutputBaseFilename=Vision-Studio-Setup-3.0.0
SetupIconFile=build\icon.ico
Compression=lzma2/fast
SolidCompression=no
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\Vision Studio.exe
UninstallDisplayName=Vision Studio
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
DiskSpanning=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "quicklaunchicon"; Description: "{cm:CreateQuickLaunchIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked; OnlyBelowVersion: 6.1; Check: not IsAdminInstallMode

[Files]
Source: "release\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Vision Studio"; Filename: "{app}\Vision Studio.exe"
Name: "{group}\{cm:UninstallProgram,Vision Studio}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Vision Studio"; Filename: "{app}\Vision Studio.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\Vision Studio.exe"; Description: "{cm:LaunchProgram,Vision Studio}"; Flags: nowait postinstall skipifsilent
