# Buch-Lernkarten

Eine Progressive Web App (PWA), mit der man Buchseiten fotografiert und daraus
automatisch digitale Lernkarten erstellt — sortierbar nach Wichtigkeit,
Kategorie und Beherrschungsgrad, mit Spaced-Repetition-Lernmodus und
Export/Import zum Teilen. Umsetzung der Spezifikation
`app-spec-buch-lernkarten.md`.

## Funktionsumfang

- **Bücher anlegen** (Titel, Autor)
- **Seiten fotografieren** — iPhone-Kamera oder Datei-Upload, funktioniert
  offline; Fotos werden verkleinert und lokal in IndexedDB gespeichert
- **Fotos gruppieren** — alle Fotos eines Abschnitts (z. B. die 3 Seiten einer
  Taktik) werden zu einer Karten-Einheit
- **KI-Verarbeitung** — Claude liest die Fotos direkt (kein OCR-Schritt) und
  liefert per strukturierter JSON-Ausgabe Titel, Kernaussage, Stichpunkte,
  Kategorie-Vorschlag und Wichtigkeit; vorhandene Kategorien werden
  wiederverwendet
- **Kartenverwaltung** — Liste mit Sortierung/Filter (Wichtigkeit, Kategorie,
  Lernstatus), manuelle Nachbearbeitung aller Felder
- **Lernmodus** — Spaced Repetition (vereinfachtes SM-2) mit drei
  Selbsteinschätzungsstufen; „gefestigte" Karten erscheinen seltener
- **Export/Import** — pro Buch eine JSON-Datei; auf dem iPhone über das
  Teilen-Menü (AirDrop etc.), am PC als Download; Import mit
  Dubletten-Erkennung. **Export-Dateien enthalten niemals Zugangsdaten.**

## Zwei Wege der KI-Verarbeitung

Die Spec sah die KI-Anbindung über das **Claude Agent SDK mit Abo-Login**
vor. Das Agent SDK ist aber eine Node.js-Bibliothek und läuft nicht im
Browser/auf dem iPhone — der Abo-Login (Pro/Max) ist nicht in Web-Apps
einbettbar. Deshalb gibt es zwei Wege:

### Weg 1: Über das Claude-Pro/Max-Abo (PC-Verarbeiter) — kein API-Key nötig

Der Ordner [`verarbeiter/`](verarbeiter/) enthält ein kleines PC-Tool, das
das Agent SDK mit dem **Abo-Login** nutzt. Workflow:

1. **Handy:** Seiten fotografieren (offline) → in der Buchansicht
   **„💻 Scans für PC exportieren"** → Datei per AirDrop/Mail/Dateien-App an
   den PC schicken
2. **PC (einmalige Einrichtung):**
   ```sh
   # Node.js 18+ von nodejs.org installieren, dann:
   npm install -g @anthropic-ai/claude-code
   claude                # einmal starten und mit dem Claude-Konto einloggen
   cd verarbeiter && npm install
   ```
3. **PC (pro Durchgang):**
   ```sh
   node verarbeite.mjs pfad/zur/buch-scans.json
   ```
   → erzeugt `…-verarbeitet.json`, läuft über das Abo-Guthaben
4. **Handy:** Datei zurückschicken → in der App **„Datei importieren"** —
   die Roh-Scans werden automatisch zu fertigen Karten (Fotos und
   Zuordnung bleiben erhalten, Dubletten werden erkannt)

### Weg 2: Direkt in der App (API-Key, Pay-per-Use)

In den App-Einstellungen einen API-Key von <https://platform.claude.com>
eintragen — dann verarbeitet die App direkt auf dem Gerät („🤖 Hier
verarbeiten"). Der Key wird ausschließlich lokal gespeichert und ist in
Export-Dateien niemals enthalten. Kosten für ein komplettes Buch:
realistisch wenige Cent bis niedriger einstelliger Euro-Betrag.

## Entwicklung

```sh
npm install
npm run dev       # Entwicklungsserver
npm run build     # Typprüfung + Produktions-Build nach dist/
npm run preview   # Produktions-Build lokal testen
```

Rauchtest (benötigt Playwright + Chromium):

```sh
npm run build && npx vite preview --port 4173 &
node scripts/smoke.mjs
```

## Installation auf dem iPhone

Die App wird bei jedem Push automatisch über GitHub Actions auf **GitHub
Pages** veröffentlicht (Workflow: `.github/workflows/pages.yml`; beim ersten
Lauf muss in den Repo-Einstellungen unter *Settings → Pages* die Quelle
„GitHub Actions" aktiv sein — der Workflow versucht das automatisch zu
aktivieren).

1. Auf dem iPhone in **Safari** öffnen:
   `https://louislam69.github.io/bookscanner/`
2. **Teilen-Symbol** (Viereck mit Pfeil) → **„Zum Home-Bildschirm"** →
   **Hinzufügen**
3. Die App liegt jetzt als Icon auf dem Home-Bildschirm und startet im
   Vollbild. Fotografieren, Karten, Lernmodus — alles funktioniert offline
   (Daten liegen in IndexedDB auf dem Gerät); nur „🤖 Hier verarbeiten"
   braucht Internet.

Wichtig: Immer über das installierte Icon starten (nicht über Safari), damit
die Daten dauerhaft im selben Speicher liegen. Bei App-Updates genügt ein
Neustart der App — der Service Worker aktualisiert sich selbst.

## Technik

| Bereich | Umsetzung |
|---|---|
| App-Typ | PWA (vite-plugin-pwa, Service Worker, installierbar) |
| Frontend | React 19 + TypeScript + Vite |
| Daten | IndexedDB (`idb`) — Bücher, Karten, Fotos (Blobs), Einstellungen |
| KI | `@anthropic-ai/sdk` direkt im Browser, strukturierte JSON-Ausgabe (`output_config.format`), Standardmodell `claude-opus-4-8` (in den Einstellungen wechselbar) |
| Kamera | `<input type="file" capture="environment">` — nutzt auf iOS die Kamera, am PC den Dateidialog |

## Datenmodell

Wie in der Spec (Abschnitt 6): `Buch` und `Karte` mit `titel`,
`kernaussage`, `stichpunkte`, `quelle_seiten`, `kategorie`, `tags`,
`wichtigkeit` (1–5), `lernstatus` (`neu | lernend | gefestigt`),
`naechste_wiederholung_am` und Foto-Referenzen. Zusätzlich intern:
`verarbeitet` (Roh-Scan vs. fertige Karte) und `wiederholungs_intervall`
(Spaced Repetition).

## Noch offen (spätere Erweiterungen laut Spec)

- Statistiken („wie viele Taktiken beherrsche ich schon")
- Automatische Erkennung von Kartengrenzen über mehrere Scans hinweg
- Optionales lokales KI-Modell (z. B. Ollama) für volle Offline-Fähigkeit
