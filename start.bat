@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo [OTA] checking ports 3000/8000 ...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-check.ps1"

echo [OTA] starting backend on http://127.0.0.1:8000 ...
start "OTA-Backend" cmd /k "cd /d %~dp0backend && .venv\Scripts\python.exe -m uvicorn app.main:app --port 8000"

echo [OTA] starting frontend on http://localhost:3000 ...
start "OTA-Frontend" cmd /k "cd /d %~dp0frontend && npm.cmd run dev"

timeout /t 10 /nobreak >nul
start http://localhost:3000

echo [OTA] ready. Close the two cmd windows to stop backend/frontend.
