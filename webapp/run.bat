@echo off
setlocal

rem Name the console window so it is identifiable in the taskbar.
title The Meridian

rem ===================================================================
rem  Meridian - start the forecasting demonstration on Windows.
rem
rem  Uses the uv already installed on this machine, creates the project
rem  environment (.venv) if it is missing, installs dependencies, and
rem  serves the app on port 7070.
rem
rem    run.bat                 full engine (installs the model backend)
rem    set LITE=1 && run.bat   baseline engine only - no torch
rem    set PORT=8080 && run.bat   serve on a different port
rem ===================================================================

rem Work from the folder this script lives in (/d also switches drive).
cd /d "%~dp0"

if "%HOST%"=="" set "HOST=0.0.0.0"
if "%PORT%"=="" set "PORT=7070"

rem ---- require an existing uv ---------------------------------------
where uv >nul 2>nul
if errorlevel 1 (
    echo Error: 'uv' was not found on PATH.
    echo Install it once with:
    echo     powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 ^| iex"
    echo then open a new terminal and re-run this script.
    exit /b 1
)
for /f "delims=" %%v in ('uv --version') do set "UVVER=%%v"
echo --^> Using %UVVER%

rem ---- create the environment ---------------------------------------
if not exist ".venv" (
    echo --^> Creating the project environment ^(.venv^)
    uv venv
    if errorlevel 1 (
        echo Error: could not create the environment.
        exit /b 1
    )
) else (
    echo --^> Reusing the existing environment ^(.venv^)
)

rem ---- install dependencies -----------------------------------------
if "%LITE%"=="1" (
    echo --^> LITE mode: installing light dependencies only ^(baseline engine^)
    uv sync
    set "DEMO_FORCE_FALLBACK=1"
) else (
    echo --^> Installing dependencies, including the model backend
    uv sync --extra full
)
if errorlevel 1 (
    echo Error: dependency installation failed.
    exit /b 1
)
if not "%LITE%"=="1" echo --^> Model weights are fetched on the first projection request

rem ---- check the port is free ---------------------------------------
netstat -ano | findstr /r /c:":%PORT% .*LISTENING" >nul 2>nul
if not errorlevel 1 (
    echo Error: port %PORT% is already in use.
    echo Free it, or run:  set PORT=8080 ^&^& run.bat
    exit /b 1
)

echo.
echo ====================================================================
echo   Meridian is running at:  http://localhost:%PORT%
echo   Press Ctrl+C to stop.
echo ====================================================================
echo.

uv run uvicorn backend.main:app --host %HOST% --port %PORT%

endlocal
