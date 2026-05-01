@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo  VTU Diary Bot -- First-Time Setup
echo ============================================================
echo.

:: ── 1. Check Python ─────────────────────────────────────────
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed or not on PATH.
    echo.
    echo  Download Python 3.11 from https://www.python.org/downloads/
    echo  Make sure to check "Add Python to PATH" during install.
    echo.
    pause
    exit /b 1
)

for /f "tokens=2 delims= " %%v in ('python --version 2^>^&1') do set PY_VER=%%v
echo [INFO] Using Python %PY_VER%

:: ── 2. Create virtual environment ───────────────────────────
if exist ".venv\Scripts\python.exe" (
    echo [INFO] Virtual environment already exists, skipping creation.
) else (
    echo [INFO] Creating virtual environment...
    python -m venv .venv
    if errorlevel 1 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
    echo [INFO] Virtual environment created.
)

:: ── 3. Install pip packages ──────────────────────────────────
echo.
echo [INFO] Installing Python dependencies...
".venv\Scripts\pip" install -r requirements.txt
if errorlevel 1 (
    echo [ERROR] pip install failed.
    pause
    exit /b 1
)

:: ── 4. Install Playwright browsers ──────────────────────────
echo.
echo [INFO] Installing Playwright browser (Chromium)...
".venv\Scripts\playwright" install chromium
if errorlevel 1 (
    echo [ERROR] Playwright browser install failed.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo  Setup complete!
echo ============================================================
echo.
echo  Next steps:
echo    1. Edit shared\data.json with your diary entries
echo    2. Edit bot\config.json with your VTU settings
echo    3. To build the .exe:   run build_exe.bat
echo    4. To run the bot now:  run .venv\Scripts\python.exe ui.py
echo.
pause
endlocal
