# Run the FinPulse VADER sentiment microservice
# Usage: from repo root: .\sentiment_service\start.ps1

Set-Location $PSScriptRoot
python -m uvicorn main:app --host 0.0.0.0 --port 8766 --reload
