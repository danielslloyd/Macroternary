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
    echo Error: Python not found. Please install Python 3.
    pause
    exit /b 1
)

echo Installing package in development mode...
cd backend
python -m pip install -e . -q
cd ..

echo Initializing database...
python -m mt init-db

echo Seeding demo data...
python -m mt seed-demo

echo.
echo Starting server on http://127.0.0.1:8000
echo Opening browser...
echo.
echo Press Ctrl+C to stop the server.
echo.

start http://127.0.0.1:8000
timeout /t 2 /nobreak >nul
python -m mt serve

pause
