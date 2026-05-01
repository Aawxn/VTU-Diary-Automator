@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo ============================================================
echo  VTU Diary Bot - Package Release
echo ============================================================
echo.

set "EXE=dist\VTU-Diary-Bot.exe"
if not exist "%EXE%" (
    echo [ERROR] %EXE% not found.
    echo Run build_exe.bat first.
    exit /b 1
)

set "OUT=dist\VTU-Diary-Bot-release"
if exist "%OUT%" rmdir /s /q "%OUT%"
mkdir "%OUT%"

copy "%EXE%" "%OUT%\VTU-Diary-Bot.exe" >nul

(
    echo VTU Diary Bot
    echo =============
    echo.
    echo 1. Double-click VTU-Diary-Bot.exe
    echo 2. Paste your diary JSON in the UI or use Load File
    echo 3. Choose browser ^(Chrome recommended^)
    echo 4. Click Preview, then Run Bot
    echo 5. Log in to VTU in the browser window
    echo 6. Let the bot complete the run
    echo.
    echo Settings and last JSON are stored in %%APPDATA%%\VTU-Diary-Bot\
) > "%OUT%\HOW-TO-RUN.txt"

set "ZIP=dist\VTU-Diary-Bot-release.zip"
if exist "%ZIP%" del /f /q "%ZIP%"

echo [INFO] Creating zip package...
powershell -NoProfile -Command "Compress-Archive -Path '%OUT%\*' -DestinationPath '%ZIP%' -Force"
if errorlevel 1 (
    echo [ERROR] Packaging failed.
    exit /b 1
)

echo.
echo Package complete:
echo   Exe: %CD%\%EXE%
echo   Zip: %CD%\%ZIP%
echo.
endlocal
