@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo ============================================================
echo  VTU Diary Bot - Build Script (single-file exe)
echo ============================================================
echo.

if not exist ".venv\Scripts\python.exe" (
    echo [ERROR] Virtual environment not found at .venv\
    echo Run setup_venv.bat first.
    exit /b 1
)

call ".venv\Scripts\activate.bat"
if errorlevel 1 (
    echo [ERROR] Could not activate .venv
    exit /b 1
)

echo [INFO] Cleaning previous build artifacts...
if exist "dist\VTU-Diary-Bot.exe" del /f /q "dist\VTU-Diary-Bot.exe"
if exist "build\VTU-Diary-Bot" rmdir /s /q "build\VTU-Diary-Bot"
if exist "VTU-Diary-Bot.spec" del /f /q "VTU-Diary-Bot.spec"
echo.

echo [INFO] Running PyInstaller (--onefile)...
pyinstaller --noconfirm --clean --onefile --windowed ^
  --name VTU-Diary-Bot ^
  --add-data "..\shared;shared" ^
  ui.py

if errorlevel 1 (
    echo.
    echo [ERROR] PyInstaller failed.
    exit /b 1
)

echo.
echo ============================================================
echo  Build complete
echo ============================================================
echo Exe: %CD%\dist\VTU-Diary-Bot.exe
echo.
endlocal
