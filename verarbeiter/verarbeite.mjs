#!/usr/bin/env node
/**
 * Buch-Lernkarten — PC-Verarbeiter (Datei-Modus)
 *
 * Verarbeitet eine aus der App exportierte Scan-Datei (…-scans.json) zu
 * fertigen Lernkarten — über das Claude Agent SDK und damit über das
 * monatliche Guthaben eines Claude-Pro/Max-Abos (kein API-Key nötig).
 *
 * Für den bequemeren Weg ohne Dateien hin- und herschicken siehe sync.mjs
 * (Cloud-Austausch über ein privates GitHub-Repo).
 *
 * Voraussetzungen (einmalig):
 *   1. Node.js 18+ installieren (nodejs.org)
 *   2. Claude Code installieren und mit dem Abo anmelden:
 *        npm install -g @anthropic-ai/claude-code
 *        claude   →  im Dialog mit dem Claude-Konto (Pro/Max) einloggen
 *   3. In diesem Ordner:  npm install
 *
 * Nutzung:
 *   node verarbeite.mjs <pfad/zur/buch-scans.json>
 *
 * Ergebnis: <pfad/zur/buch-scans-verarbeitet.json>
 * Diese Datei aufs Handy übertragen und in der App über „Datei importieren"
 * einlesen — die Roh-Scans werden dann automatisch zu fertigen Karten.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { baueExportDatei, pruefeScanDatei, verarbeiteScans } from "./kern.mjs";

const eingabe = process.argv[2];
if (!eingabe || eingabe === "--hilfe" || eingabe === "-h") {
  console.log("Nutzung: node verarbeite.mjs <pfad/zur/buch-scans.json>");
  console.log("Die Scan-Datei erzeugst du in der App über");
  console.log("„💾 Als Datei exportieren“ in der Buchansicht.");
  console.log("Cloud-Variante ohne Dateien: node sync.mjs (siehe README)");
  process.exit(eingabe ? 0 : 1);
}

let daten;
try {
  daten = JSON.parse(readFileSync(eingabe, "utf8"));
} catch (fehler) {
  console.error(`Datei konnte nicht gelesen werden: ${fehler.message}`);
  process.exit(1);
}
try {
  pruefeScanDatei(daten);
} catch (fehler) {
  console.error(fehler.message);
  process.exit(1);
}
if (daten.scans.length === 0) {
  console.error("Die Datei enthält keine Scans.");
  process.exit(1);
}

console.log(
  `Buch: ${daten.buch.titel}${daten.buch.autor ? ` von ${daten.buch.autor}` : ""}`,
);
console.log(`${daten.scans.length} Scan(s) zu verarbeiten.\n`);

const { karten, fehlgeschlagen } = await verarbeiteScans(daten);

if (karten.length === 0) {
  console.error(
    "\nKein Scan konnte verarbeitet werden. Ist Claude Code installiert und mit dem Abo angemeldet? (Test: einfach `claude` im Terminal starten)",
  );
  process.exit(1);
}

const ausgabe = resolve(eingabe.replace(/\.json$/i, "") + "-verarbeitet.json");
writeFileSync(ausgabe, JSON.stringify(baueExportDatei(daten, karten), null, 2));

console.log(`\n${karten.length} Karte(n) erstellt.`);
if (fehlgeschlagen.length) {
  console.log(
    `Scan(s) ${fehlgeschlagen.join(", ")} fehlgeschlagen — Datei erneut verarbeiten, die fertigen Karten werden beim Import nicht doppelt angelegt.`,
  );
}
console.log(`\nErgebnis: ${ausgabe}`);
console.log(
  "Diese Datei aufs Handy übertragen (AirDrop/Mail/Dateien) und in der App über „Datei importieren“ einlesen.",
);
