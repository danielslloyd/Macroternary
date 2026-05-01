@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

echo.
echo ========================================
echo   Macro Ternary Server
echo ========================================
echo.

REM Check if uv is installed
echo Checking for uv (Python version manager)...
uv --version >nul 2>&1
if errorlevel 1 (
    echo uv not found. Installing uv...
    powershell -Command "irm https://astral.sh/uv/install.ps1 | iex" >nul 2>&1
    if errorlevel 1 (
        echo.
        echo ERROR: Could not install uv automatically.
        echo.
        echo Please install uv manually:
        echo   https://docs.astral.sh/uv/getting-started/installation/
        echo.
        echo After installing uv, run this script again.
        pause
        exit /b 1
    )
    echo uv installed successfully!
)

echo.
echo Setting up environment with correct Python version...
cd backend
uv sync --quiet
if errorlevel 1 (
    echo Error: Failed to set up environment.
    cd ..
    pause
    exit /b 1
)

echo Initializing database...
uv run mt init-db

echo Seeding demo data...
uv run mt seed-demo

cd ..

echo.
echo Starting server on http://127.0.0.1:8000
echo Opening browser...
echo.
echo Press Ctrl+C to stop the server.
echo.

start http://127.0.0.1:8000
timeout /t 2 /nobreak >nul
cd backend
echo.
echo [Starting server with debug logging...]
echo.
set PYTHONUNBUFFERED=1
uv run mt serve --log-level debug

pause
