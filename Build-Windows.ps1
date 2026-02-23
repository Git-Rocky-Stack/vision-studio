#Requires -Version 5.1
<#
.SYNOPSIS
    Vision Studio Windows Build Script
.DESCRIPTION
    Automated build script for creating Windows installer
    Supports both frontend-only and full bundle builds
.PARAMETER FullBundle
    Include Python backend with PyTorch (larger size, no Python required)
.PARAMETER SkipBackend
    Skip Python backend build (smaller size, requires Python installed)
.PARAMETER Clean
    Clean all build artifacts before building
.EXAMPLE
    .\Build-Windows.ps1
    Builds frontend-only version
.EXAMPLE
    .\Build-Windows.ps1 -FullBundle
    Builds complete standalone installer with AI backend
.EXAMPLE
    .\Build-Windows.ps1 -FullBundle -Clean
    Clean build with full bundle
#>

param(
    [switch]$FullBundle,
    [switch]$SkipBackend = !$FullBundle,
    [switch]$Clean
)

$ErrorActionPreference = "Stop"

# Colors
$Colors = @{
    Reset = "`e[0m"
    Red = "`e[31m"
    Green = "`e[32m"
    Yellow = "`e[33m"
    Blue = "`e[34m"
    Magenta = "`e[35m"
    Cyan = "`e[36m"
}

function Write-Color($Text, $Color = "Reset") {
    Write-Host "$($Colors[$Color])$Text$($Colors.Reset)"
}

function Test-Command($Command) {
    return [bool](Get-Command $Command -ErrorAction SilentlyContinue)
}

# Header
Write-Color @"
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║              Vision Studio - Windows Build Script                ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
"@ "Magenta"

Write-Host ""

# Check prerequisites
Write-Color "[1/5] Checking prerequisites..." "Blue"

if (!(Test-Command "node")) {
    Write-Color "  ❌ Node.js not found!" "Red"
    Write-Color "  Install from: https://nodejs.org/" "Yellow"
    exit 1
}

$NodeVersion = (node --version)
Write-Color "  ✅ Node.js $NodeVersion" "Green"

if (!(Test-Command "npm")) {
    Write-Color "  ❌ npm not found!" "Red"
    exit 1
}

if ($FullBundle) {
    if (!(Test-Command "python")) {
        Write-Color "  ⚠️  Python not found (required for full bundle)" "Yellow"
        Write-Color "  Install from: https://python.org/" "Yellow"
        $Continue = Read-Host "Continue anyway? (y/N)"
        if ($Continue -ne 'y') { exit 1 }
    } else {
        $PythonVersion = (python --version)
        Write-Color "  ✅ $PythonVersion" "Green"
    }
}

Write-Host ""

# Clean
if ($Clean) {
    Write-Color "[2/5] Cleaning previous builds..." "Blue"
    npm run clean:all 2>$null
    Write-Color "  ✅ Cleaned" "Green"
    Write-Host ""
} else {
    Write-Color "[2/5] Cleaning (use -Clean for full clean)..." "Blue"
    npm run clean 2>$null
    Write-Color "  ✅ Cleaned" "Green"
    Write-Host ""
}

# Install dependencies
Write-Color "[3/5] Installing Node dependencies..." "Blue"
if (Test-Path "node_modules") {
    Write-Color "  ⏩ node_modules exists, skipping" "Yellow"
} else {
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Color "  ❌ npm install failed" "Red"
        exit 1
    }
}
Write-Color "  ✅ Dependencies ready" "Green"
Write-Host ""

# Build backend (if requested)
if ($FullBundle) {
    Write-Color "[4/5] Building Python backend..." "Blue"
    Write-Color "  ⏱️  This will take 30-60 minutes..." "Yellow"
    Write-Color "  📦 Downloading PyTorch (~2.5 GB)..." "Cyan"
    
    try {
        node build-backend.cjs
        Write-Color "  ✅ Backend built" "Green"
    }
    catch {
        Write-Color "  ⚠️  Backend build failed, continuing with frontend only" "Yellow"
    }
} else {
    Write-Color "[4/5] Skipping backend build (use -FullBundle to include)" "Blue"
}

Write-Host ""

# Build Windows package
Write-Color "[5/5] Building Windows installer..." "Blue"
Write-Color "  🔨 Running electron-builder..." "Cyan"

node scripts/build-windows.js

if ($LASTEXITCODE -ne 0) {
    Write-Color "  ❌ Build failed" "Red"
    exit 1
}

# Summary
Write-Host ""
Write-Color "═══════════════════════════════════════════════════════════════" "Green"
Write-Color "                    BUILD COMPLETE!                            " "Green"
Write-Color "═══════════════════════════════════════════════════════════════" "Green"
Write-Host ""

$ReleaseDir = Resolve-Path "release"
$Files = Get-ChildItem $ReleaseDir -File | Where-Object { $_.Extension -in @('.exe', '.zip') }

Write-Color "Output files:" "Blue"
foreach ($File in $Files) {
    $SizeMB = [math]::Round($File.Length / 1MB, 2)
    Write-Color "  📄 $($File.Name) ($SizeMB MB)" "Cyan"
}

Write-Host ""
Write-Color "Location: $ReleaseDir" "Blue"
Write-Host ""
Write-Color "Next steps:" "Blue"
Write-Color "  1. Test the installer on a clean Windows machine" "White"
Write-Color "  2. Sign with code signing certificate (optional)" "White"
Write-Color "  3. Upload to GitHub Releases or your website" "White"
Write-Host ""

# Open folder
$OpenFolder = Read-Host "Open release folder? (Y/n)"
if ($OpenFolder -ne 'n') {
    Invoke-Item $ReleaseDir
}
