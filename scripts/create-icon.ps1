# Vision Studio Icon Generator
# Creates a simple ICO file for the application

param(
    [string]$OutputPath = "..\build\icon.ico"
)

# Create build directory if not exists
$BuildDir = Split-Path -Parent $OutputPath
if (!(Test-Path $BuildDir)) {
    New-Item -ItemType Directory -Path $BuildDir -Force
}

# Try multiple methods to create icon

# Method 1: Using ImageMagick (if installed)
$magick = Get-Command magick -ErrorAction SilentlyContinue
if ($magick) {
    Write-Host "Using ImageMagick to create icon..." -ForegroundColor Green
    
    # Create a simple gradient icon using ImageMagick
    $tempPng = [System.IO.Path]::GetTempFileName() + ".png"
    
    # Create a 256x256 gradient image
    & magick convert -size 256x256 "gradient:#dc2626-#991b1b" -pointsize 80 -fill white -gravity center -annotate +0+0 "VS" $tempPng
    
    # Convert to ICO with multiple sizes
    & magick convert $tempPng -define icon:auto-resize=256,128,64,48,32,16 $OutputPath
    
    Remove-Item $tempPng -ErrorAction SilentlyContinue
    Write-Host "Icon created at: $OutputPath" -ForegroundColor Green
    exit 0
}

# Method 2: Using Python with PIL (if available)
$python = Get-Command python -ErrorAction SilentlyContinue
if ($python) {
    try {
        $pythonCode = @"
from PIL import Image, ImageDraw, ImageFont
import sys

# Create base image
size = 256
img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Draw gradient background (simplified as solid with border)
draw.rounded_rectangle([0, 0, size, size], radius=40, fill=(220, 38, 38, 255))

# Add text
try:
    font = ImageFont.truetype("arial.ttf", 120)
except:
    font = ImageFont.load_default()

# Draw VS text in white
bbox = draw.textbbox((0, 0), "VS", font=font)
text_width = bbox[2] - bbox[0]
text_height = bbox[3] - bbox[1]
position = ((size - text_width) // 2, (size - text_height) // 2 - 20)
draw.text(position, "VS", fill=(255, 255, 255, 255), font=font)

# Save as ICO
img.save(sys.argv[1], format='ICO', sizes=[(256,256), (128,128), (64,64), (48,48), (32,32), (16,16)])
print(f"Icon saved to {sys.argv[1]}")
"@
        
        $tempPy = [System.IO.Path]::GetTempFileName() + ".py"
        $pythonCode | Out-File -FilePath $tempPy -Encoding UTF8
        
        & python $tempPy $OutputPath
        
        Remove-Item $tempPy -ErrorAction SilentlyContinue
        
        if (Test-Path $OutputPath) {
            Write-Host "Icon created using Python PIL" -ForegroundColor Green
            exit 0
        }
    }
    catch {
        Write-Host "Python PIL method failed: $_" -ForegroundColor Yellow
    }
}

# Method 3: Create a simple text-based placeholder
Write-Host "Creating placeholder icon..." -ForegroundColor Yellow
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
