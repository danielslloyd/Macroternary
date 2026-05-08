@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

echo.
echo ========================================
echo   Food Prevalence Classifier
echo ========================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found. Please install Python 3.8+
    pause
    exit /b 1
)

REM Install httpx if not already installed
echo Checking dependencies...
python -c "import httpx" >nul 2>&1
if errorlevel 1 (
    echo Installing httpx...
    pip install httpx >nul 2>&1
    if errorlevel 1 (
        echo ERROR: Failed to install httpx
        pause
        exit /b 1
    )
)

echo.
echo Starting classifier...
echo.
echo Make sure Ollama is running on http://127.0.0.1:11434
echo.

python classify_foods.py

pause
