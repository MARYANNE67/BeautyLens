#!/bin/bash
echo "========================================"
echo "Starting Makeup Detection API Server"
echo "========================================"
echo ""

# Activate virtual environment if it exists
if [ -d "venv" ]; then
    echo "Activating virtual environment..."
    source venv/bin/activate
    echo ""
else
    echo "Warning: Virtual environment not found."
    echo "Make sure you have created venv with: python3.10 -m venv venv"
    echo ""
fi

# Show Python version
echo "Python version:"
python --version
echo ""

# Check Python version compatibility
python -c "import sys; v=sys.version_info; exit(0 if v.major==3 and 7<=v.minor<=10 else 1)" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "WARNING: MediaPipe requires Python 3.7-3.10"
    echo "Current Python version may not be compatible with MediaPipe."
    echo "Consider recreating venv with: python3.10 -m venv venv"
    echo ""
fi

echo "Starting server on http://0.0.0.0:8000"
echo "Press Ctrl+C to stop the server"
echo "========================================"
echo ""

python -m src.api.main

