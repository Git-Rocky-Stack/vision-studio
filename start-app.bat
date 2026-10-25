@echo off
setlocal
REM Vision Studio - start the development build with a working AI backend.
REM
REM Installs the Node packages if they are missing, and sets up backend\venv
REM with the full generation stack if it is missing or incomplete, by running
REM the same steps as setup-python.bat (scripts\setup-dev-backend.cjs: the
REM pinned PyTorch, requirements.txt, diffusers and the rest). Then runs
REM npm run dev, which starts the backend from backend\venv.
REM
REM Exit codes are tested with "if errorlevel N": %errorlevel% inside a
REM parenthesised block is expanded before the block runs.

echo ==========================================
echo      Vision Studio - Startup Script
echo ==========================================
echo.

REM Node.js ^20.19.0 or ^22.13.0 or 24+ (package.json "engines")
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed.
    echo Install Node.js 22 LTS ^(or 20.19+, or 24+^) from https://nodejs.org/
    pause
    exit /b 1
)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>=24||(a===22&&b>=13)||(a===20&&b>=19)?0:1)"
if errorlevel 1 (
    echo ERROR: This Node.js version is not supported.
    echo Install Node.js 22 LTS ^(or 20.19+, or 24+^) from https://nodejs.org/
    pause
    exit /b 1
)

REM Python 3.10-3.12: the pinned PyTorch 2.5.1 has no wheels for newer Pythons.
REM setup-dev-backend.cjs finds a compatible interpreter (uv, then the py
REM launcher for 3.12/3.11/3.10, then python on PATH) and refuses an
REM unsupported one.
python --version >nul 2>&1
if errorlevel 1 (
    py --version >nul 2>&1
    if errorlevel 1 (
        echo ERROR: Python is not installed.
        echo Install Python 3.12 ^(3.10 to 3.12 are supported^) from https://www.python.org/downloads/
        pause
        exit /b 1
    )
)

echo [OK] Node.js and Python detected
echo.

if not exist "node_modules" (
    echo Installing frontend dependencies...
    call npm install
    if errorlevel 1 (
        echo ERROR: Failed to install frontend dependencies
        pause
        exit /b 1
    )
)

REM A venv with requirements.txt alone starts the backend but cannot generate,
REM so check for the generation stack itself, not only for the venv folder.
set "VENV_PY=backend\venv\Scripts\python.exe"
set "BACKEND_READY=0"
if exist "%VENV_PY%" (
    "%VENV_PY%" -c "import torch, diffusers, transformers, accelerate" >nul 2>&1
    if not errorlevel 1 set "BACKEND_READY=1"
)

if "%BACKEND_READY%"=="0" (
    echo Setting up the Python backend in backend\venv.
    echo This downloads PyTorch and the generation stack - several GB, and it
    echo can take a while the first time.
    echo.
    node "%~dp0scripts\setup-dev-backend.cjs"
    if errorlevel 1 (
        echo.
        echo ERROR: Backend setup did not finish. See the message above.
        pause
        exit /b 1
    )
)

echo [OK] Dependencies ready
echo.
echo ==========================================
echo Starting Vision Studio...
echo ==========================================
echo.
echo The app opens in an Electron window.
echo The backend starts on http://127.0.0.1:8000
echo.
echo Press Ctrl+C in this window to stop
echo.

npm run dev

pause
