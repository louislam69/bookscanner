@echo off
rem Buch-Lernkarten: Dauerbetrieb — schaut jede Minute nach neuen Scans
rem in der Cloud und verarbeitet sie automatisch. Fenster einfach offen
rem lassen; beenden mit Strg+C oder Fenster schliessen.
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo Node.js wurde nicht gefunden. Bitte von https://nodejs.org installieren.
    echo.
    pause
    exit /b 1
)

node sync.mjs --dauerbetrieb
echo.
pause
