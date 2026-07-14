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

if not exist sync.mjs (
    echo FEHLER: sync.mjs nicht gefunden.
    echo.
    echo Diese Datei muss im Ordner "verarbeiter" liegen ^(neben sync.mjs
    echo und konfig.json^). Nicht die BAT-Datei auf den Desktop kopieren --
    echo stattdessen: Rechtsklick auf sync.bat im verarbeiter-Ordner
    echo und "Senden an" -^> "Desktop (Verknuepfung erstellen)".
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

node sync.mjs
echo.
echo ------------------------------------------------------------
echo Fertig. Fenster kann geschlossen werden.
pause
