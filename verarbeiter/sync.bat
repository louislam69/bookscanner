@echo off
rem Buch-Lernkarten: Scans aus der Cloud verarbeiten (einmaliger Durchlauf)
rem Einfach doppelklicken. Das Fenster zeigt den Fortschritt und bleibt offen.
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo Node.js wurde nicht gefunden. Bitte von https://nodejs.org installieren.
    echo.
    pause
    exit /b 1
)

node sync.mjs
echo.
echo ------------------------------------------------------------
echo Fertig. Fenster kann geschlossen werden.
pause
