$python = Join-Path $PSScriptRoot '..\.venv\Scripts\python.exe'
Push-Location (Join-Path $PSScriptRoot '..')
& $python -m uvicorn app.main:app --reload --port 8000
Pop-Location
