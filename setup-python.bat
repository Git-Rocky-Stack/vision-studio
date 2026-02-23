@echo off
echo ==========================================
echo  Vision Studio - Python Backend Setup
echo ==========================================
echo.

REM Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python is not installed!
    echo Please install Python 3.10+ from https://python.org
    pause
    exit /b 1
)

for /f "tokens=*" %%a in ('python --version') do echo Found: %%a
echo.

REM Create virtual environment
echo [1/4] Creating virtual environment...
cd backend
if exist "venv" (
    echo     Virtual environment already exists
) else (
    python -m venv venv
    if %errorlevel% neq 0 (
        echo ERROR: Failed to create virtual environment
        pause
        exit /b 1
    )
    echo     ✅ Created
)

REM Activate virtual environment
echo [2/4] Activating virtual environment...
call venv\Scripts\activate

REM Check for CUDA
echo [3/4] Checking for NVIDIA GPU...
nvidia-smi >nul 2>&1
if %errorlevel% equ 0 (
    echo     ✅ NVIDIA GPU detected
    echo.
    echo     Installing PyTorch with CUDA 12.1...
    echo     ^(This will download ~2.5 GB and may take 10-30 minutes^)
    echo.
    pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
) else (
    echo     ⚠️  No NVIDIA GPU detected
    echo     Installing CPU-only PyTorch...
    echo     ^(This will download ~500 MB^)
    echo.
    pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
)

if %errorlevel% neq 0 (
    echo ERROR: Failed to install PyTorch
    pause
    exit /b 1
)

echo     ✅ PyTorch installed

REM Install other dependencies
echo [4/4] Installing other dependencies...
pip install -r requirements.txt

if %errorlevel% neq 0 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)

echo     ✅ All dependencies installed
echo.

REM Verify installation
echo Verifying installation...
python -c "import torch; print(f'PyTorch: {torch.__version__}'); print(f'CUDA Available: {torch.cuda.is_available()}'); print(f'CUDA Version: {torch.version.cuda if torch.cuda.is_available() else \"N/A\"}')"

echo.
echo ==========================================
echo  Setup Complete!
echo ==========================================
echo.
echo You can now run the backend with:
echo   cd backend
echo   venv\Scripts\activate
echo   python main.py
echo.
echo Or start the full app with:
echo   npm run dev
echo.

pause
