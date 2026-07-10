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

## Abweichung von der Spezifikation (wichtig)

Die Spec sah die KI-Anbindung über das **Claude Agent SDK mit Abo-Login**
vor. Das ist technisch nicht umsetzbar: Das Agent SDK ist eine
Node.js-Bibliothek und läuft nicht im Browser, und der Abo-Login (Pro/Max)
ist nicht in Web-Apps einbettbar. Da die App bewusst **ohne eigenen Server**
auskommt, ist der in der Spec bereits genannte Fallback umgesetzt:

> Normale Claude-API (Pay-per-Use) mit einem **API-Key**, der ausschließlich
> lokal auf dem Gerät gespeichert wird (Anthropic-seitig offiziell
> unterstützter Browser-Direktzugriff). Kosten für ein komplettes Buch:
> realistisch wenige Cent bis niedriger einstelliger Euro-Betrag.

Einen API-Key gibt es unter <https://platform.claude.com>. Er wird in den
App-Einstellungen eingetragen.

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

## Nutzung auf dem iPhone

1. Die gebaute App über HTTPS hosten (z. B. GitHub Pages, Netlify, oder ein
   beliebiger statischer Webspace — es gibt keinerlei Server-Logik)
2. Seite in Safari öffnen → Teilen → **„Zum Home-Bildschirm"**
3. Die App startet dann im Vollbild, Fotografieren funktioniert offline;
   nur der Verarbeitungsschritt braucht Internet

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
