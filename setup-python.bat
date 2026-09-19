@echo off
REM Vision Studio - Python backend setup for development (Windows)
REM
REM Installs what the release build bundles by running build-backend.cjs's own
REM steps (scripts\setup-dev-backend.cjs): a Python 3.10-3.12 venv in
REM backend\venv, the pinned PyTorch, requirements.txt, and the generation stack
REM (diffusers and the rest). The package lists live in build-backend.cjs only,
REM so this script cannot drift from the release build.

echo ==========================================
echo  Vision Studio - Python Backend Setup
echo ==========================================
echo.

node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed.
    echo Install it from https://nodejs.org/ and run this again.
    pause
    exit /b 1
)

node "%~dp0scripts\setup-dev-backend.cjs"
if %errorlevel% neq 0 (
    echo.
    echo Setup did not finish. See the message above.
    pause
    exit /b 1
)

echo.
echo ==========================================
echo  Setup Complete
echo ==========================================
pause
