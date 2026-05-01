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
    echo Error: Python not found. Please install Python 3.12 or higher.
    echo Download from: https://www.python.org/downloads/
    pause
    exit /b 1
)

for /f "tokens=2" %%i in ('python --version 2^>^&1') do set PYTHON_VERSION=%%i
echo Found Python %PYTHON_VERSION%

echo Checking Python version...
python -c "import sys; exit(0 if sys.version_info >= (3, 12) else 1)" >nul 2>&1
if errorlevel 1 (
    echo Error: Python 3.12 or higher is required.
    echo Current version: %PYTHON_VERSION%
    echo.
    echo Please install Python 3.12+:
    echo https://www.python.org/downloads/
    echo.
    echo Or use a Python version manager like pyenv or conda.
    pause
    exit /b 1
)

echo Installing package in development mode...
cd backend
python -m pip install -e . -q
if errorlevel 1 (
    echo Error: Failed to install package.
    cd ..
    pause
    exit /b 1
)
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
