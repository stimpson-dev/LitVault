@echo off
cd /d %~dp0
:: Kein --reload im Betrieb: Code-Aenderungen bei laufenden Jobs loesen sonst
:: einen Reload aus, dessen Graceful-Shutdown am endlosen SSE-Progress-Stream
:: haengt -> App antwortet nicht mehr (2026-07-17). Fuer Entwicklung uvicorn
:: manuell mit --reload starten.
uv run uvicorn app.main:app --port 8000 --timeout-graceful-shutdown 5
