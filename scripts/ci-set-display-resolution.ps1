<#
.SYNOPSIS
  Sets the primary display of a CI Windows runner to a given resolution and
  fails if the result is smaller than the E2E window needs.

.DESCRIPTION
  GitHub's windows-latest runners boot at 1024x768. The E2E fixture opens the
  app at 1600x1000; Windows clamps a window to the screen, so on the stock
  runner the app falls back to its 1200x800 minimum and every Windows visual
  baseline (captured at 1600x1000) fails on size alone. This raises the
  resolution through user32 ChangeDisplaySettings, which works on every runner
  image with a display adapter (Set-DisplayResolution is not present on all of
  them), then verifies the change took effect.

.EXAMPLE
  pwsh scripts/ci-set-display-resolution.ps1 -Width 1920 -Height 1080 -MinWidth 1600 -MinHeight 1000
#>
param(
  [int]$Width = 1920,
  [int]$Height = 1080,
  [int]$MinWidth = 1600,
  [int]$MinHeight = 1000
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class CiDisplay {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct DEVMODE {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
    public short dmSpecVersion;
    public short dmDriverVersion;
    public short dmSize;
    public short dmDriverExtra;
    public int dmFields;
    public int dmPositionX;
    public int dmPositionY;
    public int dmDisplayOrientation;
    public int dmDisplayFixedOutput;
    public short dmColor;
    public short dmDuplex;
    public short dmYResolution;
    public short dmTTOption;
    public short dmCollate;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
    public short dmLogPixels;
    public int dmBitsPerPel;
    public int dmPelsWidth;
    public int dmPelsHeight;
    public int dmDisplayFlags;
    public int dmDisplayFrequency;
    public int dmICMMethod;
    public int dmICMIntent;
    public int dmMediaType;
    public int dmDitherType;
    public int dmReserved1;
    public int dmReserved2;
    public int dmPanningWidth;
    public int dmPanningHeight;
  }

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern bool EnumDisplaySettings(string deviceName, int modeNum, ref DEVMODE devMode);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int ChangeDisplaySettings(ref DEVMODE devMode, int flags);

  private const int ENUM_CURRENT_SETTINGS = -1;
  private const int DM_PELSWIDTH = 0x80000;
  private const int DM_PELSHEIGHT = 0x100000;

  public static DEVMODE Current() {
    DEVMODE mode = new DEVMODE();
    mode.dmSize = (short)Marshal.SizeOf(typeof(DEVMODE));
    if (!EnumDisplaySettings(null, ENUM_CURRENT_SETTINGS, ref mode)) {
      throw new InvalidOperationException("EnumDisplaySettings failed: no display adapter?");
    }
    return mode;
  }

  // Returns the DISP_CHANGE_* code (0 = DISP_CHANGE_SUCCESSFUL).
  public static int Set(int width, int height) {
    DEVMODE mode = Current();
    mode.dmPelsWidth = width;
    mode.dmPelsHeight = height;
    mode.dmFields = DM_PELSWIDTH | DM_PELSHEIGHT;
    return ChangeDisplaySettings(ref mode, 0);
  }
}
'@

$before = [CiDisplay]::Current()
Write-Host "Display before: $($before.dmPelsWidth)x$($before.dmPelsHeight)"

$code = [CiDisplay]::Set($Width, $Height)
$after = [CiDisplay]::Current()
Write-Host "ChangeDisplaySettings returned $code; display now: $($after.dmPelsWidth)x$($after.dmPelsHeight)"

if ($after.dmPelsWidth -lt $MinWidth -or $after.dmPelsHeight -lt $MinHeight) {
  Write-Host "::error::Runner display is $($after.dmPelsWidth)x$($after.dmPelsHeight); the E2E window needs at least ${MinWidth}x${MinHeight} or the Windows visual baselines cannot match."
  exit 1
}
