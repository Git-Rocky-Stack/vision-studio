; Electron Builder NSIS include hooks for Vision Studio.
; Keep this file macro-only. Do not define Name/OutFile/VersionInfo here.

; Stops every Vision Studio process before files are replaced or removed.
;
; The packaged backend (resources\VisionStudio-Backend.exe) is a separate
; process that holds its executable and libraries open, and it can outlive the
; app (a crash, a killed shell). A locked backend makes an install, update or
; uninstall fail half-way, so it is terminated here, before electron-builder's
; own app-running check.
;
; Interactive runs ask before closing a running app (electron-builder's own
; "appRunning" prompt). Auto-updates (--updated) start while the app is still
; quitting: it is given up to 10 s to stop its backend cleanly first. Then the
; app goes, as a tree - it owns the backend, and a live app would restart a
; backend killed under it - followed by any orphaned backend. taskkill exit
; codes are ignored: "no such process" is the normal case.
!macro VisionStudioStopRunningProcesses
  Push $0
  Push $1

  ${IfNot} ${Silent}
  ${AndIfNot} ${isUpdated}
    nsExec::Exec `"$SYSDIR\cmd.exe" /C "$SYSDIR\tasklist.exe" /FI "IMAGENAME eq ${APP_EXECUTABLE_FILENAME}" /FO CSV /NH | "$SYSDIR\findstr.exe" /B /I /C:"\"${APP_EXECUTABLE_FILENAME}\""`
    Pop $0
    ${If} $0 == 0
      MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK visionStudioCloseApp
      Pop $1
      Pop $0
      Quit
      visionStudioCloseApp:
    ${EndIf}
  ${EndIf}

  ${If} ${isUpdated}
    StrCpy $1 0
    ${Do}
      nsExec::Exec `"$SYSDIR\cmd.exe" /C "$SYSDIR\tasklist.exe" /FI "IMAGENAME eq ${APP_EXECUTABLE_FILENAME}" /FO CSV /NH | "$SYSDIR\findstr.exe" /B /I /C:"\"${APP_EXECUTABLE_FILENAME}\""`
      Pop $0
      ${If} $0 != 0
        ${ExitDo}
      ${EndIf}
      Sleep 500
      IntOp $1 $1 + 1
    ${LoopUntil} $1 >= 20
  ${EndIf}

  nsExec::Exec `"$SYSDIR\taskkill.exe" /F /T /IM "${APP_EXECUTABLE_FILENAME}"`
  Pop $0
  nsExec::Exec `"$SYSDIR\taskkill.exe" /F /T /IM "VisionStudio-Backend.exe"`
  Pop $0
  ; Let Windows release the image and DLL handles before files are touched.
  Sleep 500

  Pop $1
  Pop $0
!macroend

; Installer and updater (.onInit).
!macro customInit
  !insertmacro VisionStudioStopRunningProcesses
!macroend

; Uninstaller (un.onInit).
!macro customUnInit
  !insertmacro VisionStudioStopRunningProcesses
!macroend
