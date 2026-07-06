@echo off
REM ============================================================
REM  view-tool startup script (developer / source-tree mode)
REM  Double-click to run, Ctrl+C to stop
REM  For the SEA-built binary, just double-click view-tool.exe
REM ============================================================

title view-tool
cd /d "%~dp0"

echo.
echo ============================================================
echo   view-tool is starting...
echo   Open http://localhost:3333 in your browser
echo   Press Ctrl+C to stop the service
echo ============================================================
echo.

call npm start

echo.
echo ============================================================
echo   Service stopped.
echo ============================================================
cmd /k
