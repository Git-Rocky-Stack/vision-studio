@echo off
chcp 65001 >nul
echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║                                                              ║
echo ║                Vision Studio - Quick Start                   ║
echo ║                                                              ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

REM Check for Node.js
echo [1/4] Checking Node.js installation...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo     ❌ Node.js not found!
    echo.
    echo     Please install Node.js 18+ from:
    echo     https://nodejs.org/en/download/
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%a in ('node --version') do set NODE_VERSION=%%a
echo     ✅ Node.js %NODE_VERSION%

REM Check for Python
echo [2/4] Checking Python installation...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo     ⚠️  Python not found
    echo     You can still develop the frontend, but the AI backend won't work.
    echo     Install Python 3.10+ from https://python.org if you need the backend.
    echo.
    choice /C YN /M "Continue without Python"
    if %errorlevel% == 2 exit /b 1
) else (
    for /f "tokens=*" %%a in ('python --version') do set PYTHON_VERSION=%%a
    echo     ✅ %PYTHON_VERSION%
)

REM Install dependencies
echo [3/4] Installing dependencies...
if not exist "node_modules" (
    echo     📦 Installing Node packages (this may take a few minutes)...
    call npm install
    if %errorlevel% neq 0 (
        echo     ❌ Failed to install dependencies
        pause
        exit /b 1
    )
) else (
    echo     ✅ Node packages already installed
)

REM Check for backend
echo [4/4] Checking AI backend...
if exist "backend\venv" (
    echo     ✅ Python virtual environment found
) else (
    echo     ⚠️  No Python backend setup
    echo.
    echo     You have 3 options:
    echo.
    echo     A) Use Bundled Backend (Download 4-6 GB, works offline)
    echo        Run: npm run build:backend
    echo.
    echo     B) Use System Python (Smaller, requires Python setup)
    echo        Run: setup-python.bat
    echo.
    echo     C) Use External ComfyUI (For advanced users)
    echo        Install ComfyUI separately and set COMFYUI_URL in .env
    echo.
    echo     You can continue with frontend development now.
    echo.
)

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║                      Ready to Start!                         ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.
echo Commands:
echo   npm run dev              Start development server
echo   npm run build:backend    Build bundled Python backend
echo   npm run package          Build for distribution
echo.
echo Opening development server...
echo.

npm run dev
