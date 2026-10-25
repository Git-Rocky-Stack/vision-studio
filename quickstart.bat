@echo off
setlocal EnableDelayedExpansion
REM Vision Studio - developer quick start (Windows)
REM
REM Checks Node.js and Python, installs the Node packages, says how to set up
REM the AI backend if it is missing, then starts the dev build (npm run dev).
REM
REM Variables set inside a parenthesised block are read with !VAR! and exit
REM codes with "if errorlevel N": %VAR% and %errorlevel% are expanded when the
REM whole block is parsed, before any command in it has run.

echo.
echo ==============================================================
echo                 Vision Studio - Quick Start
echo ==============================================================
echo.

REM Node.js: the toolchain (Vite, Vitest, jsdom, ESLint) needs
REM ^20.19.0 or ^22.13.0 or 24 and later - the "engines" range in package.json.
echo [1/4] Checking Node.js installation...
node --version >nul 2>&1
if errorlevel 1 (
    echo     [X] Node.js not found.
    echo.
    echo     Install Node.js 22 LTS ^(or 20.19+, or 24+^) from:
    echo     https://nodejs.org/en/download/
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%a in ('node --version') do set NODE_VERSION=%%a
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>=24||(a===22&&b>=13)||(a===20&&b>=19)?0:1)"
if errorlevel 1 (
    echo     [X] Node.js !NODE_VERSION! is not supported.
    echo     Install Node.js 22 LTS ^(or 20.19+, or 24+^) from https://nodejs.org/
    echo.
    pause
    exit /b 1
)
echo     [OK] Node.js %NODE_VERSION%

REM Python: the pinned PyTorch 2.5.1 publishes wheels for Python 3.10-3.12 only.
echo [2/4] Checking Python installation...
python --version >nul 2>&1
if errorlevel 1 (
    echo     [!] Python not found.
    echo     You can still develop the frontend, but the AI backend will not run.
    echo     Install Python 3.12 ^(3.10 to 3.12 are supported^) from https://www.python.org/downloads/
    echo.
    choice /C YN /M "Continue without Python"
    if errorlevel 2 exit /b 1
) else (
    for /f "tokens=*" %%a in ('python --version') do set PYTHON_VERSION=%%a
    echo     [OK] !PYTHON_VERSION! ^(the backend needs Python 3.10 to 3.12^)
)

REM Node packages
echo [3/4] Installing dependencies...
if not exist "node_modules" (
    echo     Installing Node packages - this may take a few minutes...
    call npm install
    if errorlevel 1 (
        echo     [X] Failed to install dependencies
        pause
        exit /b 1
    )
) else (
    echo     [OK] Node packages already installed
)

REM AI backend
echo [4/4] Checking AI backend...
if exist "backend\venv" (
    echo     [OK] Python virtual environment found in backend\venv
) else (
    echo     [!] No Python backend set up yet.
    echo.
    echo     You have 3 options:
    echo.
    echo     A^) System Python - recommended for development
    echo        Run: setup-python.bat
    echo        Installs the pinned PyTorch, requirements.txt and the generation
    echo        stack into backend\venv. npm run dev then uses that venv.
    echo.
    echo     B^) Bundled backend - the release build
    echo        Run: npm run build:backend
    echo        A local PyInstaller build: roughly 30-60 minutes, about 2.6 GB
    echo        of output in resources\, plus several GB of downloads on the way.
    echo.
    echo     C^) External ComfyUI - for advanced users
    echo        Install and start ComfyUI separately. The backend connects to
    echo        http://127.0.0.1:8188, or to the COMFYUI_URL environment variable
    echo        if you set one. No .env file is read.
    echo.
    echo     You can continue with frontend development now.
    echo.
)

echo.
echo ==============================================================
echo                       Ready to Start
echo ==============================================================
echo.
echo Commands:
echo   npm run dev              Start the development build
echo   setup-python.bat         Set up the Python backend in backend\venv
echo   npm run build:backend    Build the bundled Python backend
echo   npm run package:win      Build the Windows distributable
echo.
echo Opening development server...
echo.

npm run dev
