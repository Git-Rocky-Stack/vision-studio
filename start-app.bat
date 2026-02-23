@echo off
echo ==========================================
echo      Vision Studio - Startup Script
echo ==========================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js 18+ from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python is not installed!
    echo Please install Python 3.10+ from https://python.org/
    pause
    exit /b 1
)

echo [OK] Node.js and Python detected
echo.

REM Check if dependencies are installed
if not exist "node_modules" (
    echo Installing frontend dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo ERROR: Failed to install frontend dependencies
        pause
        exit /b 1
    )
)

if not exist "backend\venv" (
    echo Creating Python virtual environment...
    cd backend
    python -m venv venv
    if %errorlevel% neq 0 (
        echo ERROR: Failed to create virtual environment
        pause
        exit /b 1
    )
    cd ..
)

REM Activate venv and install dependencies
cd backend
call venv\Scripts\activate

pip show fastapi >nul 2>&1
if %errorlevel% neq 0 (
    echo Installing Python dependencies...
    pip install -r requirements.txt
    if %errorlevel% neq 0 (
        echo ERROR: Failed to install Python dependencies
        pause
        exit /b 1
    )
)

cd ..

echo [OK] Dependencies ready
echo.
echo ==========================================
echo Starting Vision Studio...
echo ==========================================
echo.
echo Frontend will open in Electron
echo Backend will start on http://localhost:8000
echo.
echo Press Ctrl+C in this window to stop
echo.

REM Start the app
npm run dev

pause
