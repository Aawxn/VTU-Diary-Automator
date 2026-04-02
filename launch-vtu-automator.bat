@echo off
setlocal

set "VTU_URL=https://vtu.internyet.in/dashboard/student/student-diary"
set "EXT_DIR=%~dp0"
if "%EXT_DIR:~-1%"=="\" set "EXT_DIR=%EXT_DIR:~0,-1%"

set "PROFILE_ROOT=%LOCALAPPDATA%\VTU-Diary-Automator"
set "PROFILE_DIR=%PROFILE_ROOT%\browser-profile"

if not exist "%PROFILE_ROOT%" mkdir "%PROFILE_ROOT%" >nul 2>nul
if not exist "%PROFILE_DIR%" mkdir "%PROFILE_DIR%" >nul 2>nul

set "BROWSER_PATH="

if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
  set "BROWSER_PATH=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
)

if not defined BROWSER_PATH if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
  set "BROWSER_PATH=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
)

if not defined BROWSER_PATH if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  set "BROWSER_PATH=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
)

if not defined BROWSER_PATH if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
  set "BROWSER_PATH=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
)

if not defined BROWSER_PATH (
  echo Could not find Microsoft Edge or Google Chrome.
  echo Install Edge or Chrome, then run this launcher again.
  pause
  exit /b 1
)

start "" "%BROWSER_PATH%" ^
  --user-data-dir="%PROFILE_DIR%" ^
  --disable-extensions-except="%EXT_DIR%" ^
  --load-extension="%EXT_DIR%" ^
  "%VTU_URL%"

exit /b 0
