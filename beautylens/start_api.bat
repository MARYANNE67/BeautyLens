@echo off
echo ========================================
echo Starting Makeup Detection API Server
echo ========================================
echo.

REM Activate virtual environment if it exists
if exist venv\Scripts\activate.bat (
    echo Activating virtual environment...
    call venv\Scripts\activate.bat
    echo.
) else (
    echo Warning: Virtual environment not found.
    echo Make sure you have created venv with: py -3.10 -m venv venv
    echo.
)

REM Show Python version
echo Python version:
python --version
echo.

REM Check Python version compatibility
python -c "import sys; v=sys.version_info; exit(0 if v.major==3 and 7<=v.minor<=10 else 1)" 2>nul
if errorlevel 1 (
    echo WARNING: MediaPipe requires Python 3.7-3.10
    echo Current Python version may not be compatible with MediaPipe.
    echo Consider recreating venv with: py -3.10 -m venv venv
    echo.
)

echo Starting server on http://0.0.0.0:8000
echo Press Ctrl+C to stop the server
echo ========================================
echo.

python -m src.api.main

pause

