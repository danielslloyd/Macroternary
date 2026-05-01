@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

echo.
echo ========================================
echo   Macro Ternary Server
echo ========================================
echo.

echo Checking Python installation...
python --version >nul 2>&1
if errorlevel 1 (
    echo Error: Python not found. Please install Python.
    pause
    exit /b 1
)

echo Initializing database...
python -m mt init-db

echo Seeding demo data...
python -m mt seed-demo

echo.
echo Starting server on http://127.0.0.1:8000
echo Open this URL in your browser.
echo.
echo Press Ctrl+C to stop the server.
echo.

python -m mt serve

pause
