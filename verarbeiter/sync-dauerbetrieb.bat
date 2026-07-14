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

if not exist sync.mjs (
    echo FEHLER: sync.mjs nicht gefunden.
    echo.
    echo Diese Datei muss im Ordner "verarbeiter" liegen. Nicht die
    echo BAT-Datei auf den Desktop kopieren -- stattdessen: Rechtsklick
    echo auf die BAT im verarbeiter-Ordner und "Senden an" -^>
    echo "Desktop (Verknuepfung erstellen)".
    echo.
    pause
    exit /b 1
)

if not exist node_modules (
    echo Erster Start: installiere einmalig die benoetigten Pakete...
    echo ^(Das kann eine Minute dauern und braucht Internet.^)
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo FEHLER: "npm install" ist fehlgeschlagen. Internetverbindung pruefen
        echo und die Datei erneut starten.
        echo.
        pause
        exit /b 1
    )
    echo.
)

node sync.mjs --dauerbetrieb
echo.
pause
