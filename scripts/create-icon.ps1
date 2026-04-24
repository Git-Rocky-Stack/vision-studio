# Vision Studio Icon Generator
# Converts the canonical PNG source into the Windows ICO used by Electron/Inno Setup.

param(
    [string]$SourcePath,
    [string]$OutputPath
)

if ([string]::IsNullOrWhiteSpace($SourcePath)) {
    $SourcePath = Join-Path $PSScriptRoot "..\icons\vision.png"
}
else {
    $SourcePath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($SourcePath)
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $PSScriptRoot "..\build\icon.ico"
}
else {
    $OutputPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
}

$SourcePath = [System.IO.Path]::GetFullPath($SourcePath)
$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)

# Create build directory if not exists
$BuildDir = Split-Path -Parent $OutputPath
if (!(Test-Path $BuildDir)) {
    New-Item -ItemType Directory -Path $BuildDir -Force
}

# Try multiple methods to create icon
$HasSource = Test-Path $SourcePath

# Method 1: Using ImageMagick (if installed)
$magick = Get-Command magick -ErrorAction SilentlyContinue
if ($magick -and $HasSource) {
    Write-Host "Using ImageMagick to convert source icon..." -ForegroundColor Green
    & magick $SourcePath -background none -define icon:auto-resize=256,128,64,48,32,16 $OutputPath
    if (Test-Path $OutputPath) {
        Write-Host "Icon created at: $OutputPath" -ForegroundColor Green
        exit 0
    }
}

# Method 2: Using Python with PIL (if available)
$python = Get-Command python -ErrorAction SilentlyContinue
if ($python) {
    try {
        $pythonCode = @"
from PIL import Image, ImageDraw, ImageFont, ImageOps
import sys

source_path = sys.argv[1]
output_path = sys.argv[2]
size = 256
sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]

if source_path != "__placeholder__":
    source = Image.open(source_path).convert("RGBA")
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    contained = ImageOps.contain(source, (size, size), method=Image.Resampling.LANCZOS)
    offset = ((size - contained.width) // 2, (size - contained.height) // 2)
    img.paste(contained, offset, contained)
else:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([0, 0, size, size], radius=40, fill=(220, 38, 38, 255))
    try:
        font = ImageFont.truetype("arial.ttf", 120)
    except Exception:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), "VS", font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    position = ((size - text_width) // 2, (size - text_height) // 2 - 20)
    draw.text(position, "VS", fill=(255, 255, 255, 255), font=font)

img.save(output_path, format="ICO", sizes=sizes)
print(f"Icon saved to {output_path}")
"@
        
        $tempPy = [System.IO.Path]::GetTempFileName() + ".py"
        $pythonCode | Out-File -FilePath $tempPy -Encoding UTF8
        
        $pythonSource = if ($HasSource) { $SourcePath } else { "__placeholder__" }
        & python $tempPy $pythonSource $OutputPath
        
        Remove-Item $tempPy -ErrorAction SilentlyContinue
        
        if (Test-Path $OutputPath) {
            if ($HasSource) {
                Write-Host "Icon created from source PNG using Python PIL" -ForegroundColor Green
            }
            else {
                Write-Host "Placeholder icon created using Python PIL" -ForegroundColor Green
            }
            exit 0
        }
    }
    catch {
        Write-Host "Python PIL method failed: $_" -ForegroundColor Yellow
    }
}

# Method 3: Create a simple text-based placeholder
Write-Host "Creating placeholder icon..." -ForegroundColor Yellow
if ($HasSource) {
    Write-Host "Found source image but no converter could build an ICO from it." -ForegroundColor Yellow
    Write-Host "Source: $SourcePath" -ForegroundColor Gray
}
Write-Host ""
Write-Host "NOTE: Please create a proper icon before distribution!" -ForegroundColor Red
Write-Host ""
Write-Host "Options:" -ForegroundColor Cyan
Write-Host "  1. Use an online ICO generator:" -ForegroundColor White
Write-Host "     https://redketchup.io/icon-converter" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. Use GIMP (free):" -ForegroundColor White
Write-Host "     - Create 256x256 image" -ForegroundColor Gray
Write-Host "     - File > Export As > icon.ico" -ForegroundColor Gray
Write-Host ""
Write-Host "  3. Install ImageMagick:" -ForegroundColor White
Write-Host "     choco install imagemagick" -ForegroundColor Gray
Write-Host ""

# Create a dummy file as placeholder
"This is a placeholder. Replace with a real .ico file before distribution." | Out-File -FilePath ($OutputPath + ".txt") -Encoding UTF8

Write-Host "Created placeholder at: $OutputPath.txt" -ForegroundColor Yellow
Write-Host "Rename to icon.ico after creating the real icon." -ForegroundColor Yellow
