@echo off
title LitVault

echo Starting LitVault...
echo.

:: Backend starten (neues Fenster)
:: Kein --reload im Betrieb (haengender Reload bei laufenden Jobs, 2026-07-17);
:: --timeout-graceful-shutdown verhindert, dass offene SSE-Streams einen
:: Neustart unbegrenzt blockieren.
start "LitVault Backend" cmd /k "cd /d C:\Coding\LitVault\backend && .venv\Scripts\python -m uvicorn app.main:app --port 8000 --timeout-graceful-shutdown 5"

:: Kurz warten bis Backend bereit ist
ping -n 4 127.0.0.1 >nul

:: Frontend starten (neues Fenster)
start "LitVault Frontend" cmd /k "cd /d C:\Coding\LitVault\frontend && npm run dev"

echo.
echo LitVault gestartet!
echo   Backend:  http://localhost:8000
echo   Frontend: http://localhost:5173
echo.
echo Dieses Fenster kann geschlossen werden.
pause
