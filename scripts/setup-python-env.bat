@echo off
echo Setting up Python virtual environment for LabelingTool AI sidecar...

cd /d "%~dp0..\python"

if not exist ".venv" (
    python -m venv .venv
    echo Virtual environment created.
)

call .venv\Scripts\activate

echo Installing dependencies...
pip install -r requirements.txt

echo.
echo Setup complete! Python sidecar is ready.
echo Run the app with: npm run dev
pause
