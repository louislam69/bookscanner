#!/usr/bin/env node
/**
 * Buch-Lernkarten — PC-Verarbeiter
 *
 * Verarbeitet eine aus der App exportierte Scan-Datei (…-scans.json) zu
 * fertigen Lernkarten — über das Claude Agent SDK und damit über das
 * monatliche Guthaben eines Claude-Pro/Max-Abos (kein API-Key nötig).
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
 * Diese Datei aufs Handy übertragen (AirDrop, Mail, Dateien-App) und in der
 * App über „Datei importieren" einlesen — die Roh-Scans werden dann
 * automatisch zu fertigen Karten.
 */
import { query } from "@anthropic-ai/claude-agent-sdk";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const eingabe = process.argv[2];
if (!eingabe || eingabe === "--hilfe" || eingabe === "-h") {
  console.log("Nutzung: node verarbeite.mjs <pfad/zur/buch-scans.json>");
  console.log("Die Scan-Datei erzeugst du in der App über");
  console.log("„💻 Scans für PC exportieren“ in der Buchansicht.");
  process.exit(eingabe ? 0 : 1);
}

let daten;
try {
  daten = JSON.parse(readFileSync(eingabe, "utf8"));
} catch (fehler) {
  console.error(`Datei konnte nicht gelesen werden: ${fehler.message}`);
  process.exit(1);
}
if (daten.format !== "buch-lernkarten-scans" || !Array.isArray(daten.scans)) {
  console.error(
    "Das ist keine Scan-Datei der Buch-Lernkarten-App (erwartet: format „buch-lernkarten-scans“).",
  );
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

const arbeitsordner = mkdtempSync(join(tmpdir(), "lernkarten-"));
const kategorien = [...(daten.kategorien ?? [])];
const karten = [];
const fehlgeschlagen = [];

function extrahiereJson(text) {
  const anfang = text.indexOf("{");
  const ende = text.lastIndexOf("}");
  if (anfang === -1 || ende <= anfang) {
    throw new Error("Antwort enthielt kein JSON");
  }
  return JSON.parse(text.slice(anfang, ende + 1));
}

for (let i = 0; i < daten.scans.length; i++) {
  const scan = daten.scans[i];
  process.stdout.write(`[${i + 1}/${daten.scans.length}] Verarbeite Scan… `);

  // Fotos als Dateien ablegen, damit Claude sie mit dem Read-Tool liest
  const fotoPfade = scan.fotos.map((b64, n) => {
    const pfad = join(arbeitsordner, `scan-${i}-seite-${n + 1}.jpg`);
    writeFileSync(pfad, Buffer.from(b64, "base64"));
    return pfad;
  });

  const kategorienHinweis = kategorien.length
    ? `Bisher verwendete Kategorien: ${kategorien.join(", ")}. Verwende eine davon, wenn sie inhaltlich passt; sonst schlage eine neue, kurze Kategorie vor.`
    : "Schlage eine kurze, wiederverwendbare Kategorie vor.";

  const auftrag = `Lies diese Fotos (in genau dieser Reihenfolge) mit dem Read-Tool:
${fotoPfade.map((p) => `- ${p}`).join("\n")}

Sie zeigen zusammengehörige Seiten aus dem Buch "${daten.buch.titel}"${daten.buch.autor ? ` von ${daten.buch.autor}` : ""} und behandeln einen inhaltlichen Abschnitt (z. B. eine Taktik, ein Konzept, eine Methode).

Erstelle daraus eine deutsche Lernkarte, die den Abschnitt so zusammenfasst, dass man ihn ohne das Buch wiederholen kann. ${kategorienHinweis}

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in exakt dieser Form (kein Markdown, kein sonstiger Text):
{
  "titel": "kurzer, prägnanter Titel",
  "kernaussage": "die zentrale Aussage in 1-3 Sätzen",
  "stichpunkte": ["3-7 Stichpunkte mit den wichtigsten Details"],
  "kategorie": "thematische Kategorie",
  "tags": ["0-4 kurze Schlagworte"],
  "quelle_seiten": "Seitenzahlen falls auf den Fotos erkennbar, sonst leer",
  "wichtigkeit": 3
}
"wichtigkeit" ist eine Ganzzahl 1-5 (5 = fundamental, 1 = Randnotiz).`;

  try {
    let ergebnis = null;
    for await (const nachricht of query({
      prompt: auftrag,
      options: {
        cwd: arbeitsordner,
        allowedTools: ["Read"],
        permissionMode: "bypassPermissions",
        maxTurns: 16,
      },
    })) {
      if (nachricht.type === "result") {
        if (nachricht.subtype !== "success") {
          throw new Error(
            `Agent-Lauf fehlgeschlagen (${nachricht.subtype ?? "unbekannt"})`,
          );
        }
        ergebnis = nachricht.result;
      }
    }
    if (!ergebnis) throw new Error("Keine Antwort erhalten");

    const ki = extrahiereJson(ergebnis);
    const kategorie = String(ki.kategorie ?? "").trim();
    if (kategorie && !kategorien.includes(kategorie)) kategorien.push(kategorie);

    karten.push({
      id: scan.id,
      titel: String(ki.titel ?? "").trim() || "Ohne Titel",
      kernaussage: String(ki.kernaussage ?? "").trim(),
      stichpunkte: Array.isArray(ki.stichpunkte)
        ? ki.stichpunkte.map((s) => String(s).trim()).filter(Boolean)
        : [],
      kategorie,
      tags: Array.isArray(ki.tags)
        ? ki.tags.map((t) => String(t).trim()).filter(Boolean)
        : [],
      quelle_seiten:
        String(ki.quelle_seiten ?? "").trim() || scan.quelle_seiten || "",
      wichtigkeit: Math.min(5, Math.max(1, Math.round(Number(ki.wichtigkeit) || 3))),
      lernstatus: "neu",
      naechste_wiederholung_am: null,
      wiederholungs_intervall: 0,
      verarbeitet: true,
      erstellt_am: new Date().toISOString(),
      zuletzt_bearbeitet_am: new Date().toISOString(),
    });
    console.log(`✓ ${karten.at(-1).titel}`);
  } catch (fehler) {
    console.log(`✗ fehlgeschlagen: ${fehler.message}`);
    fehlgeschlagen.push(i + 1);
  }
}

rmSync(arbeitsordner, { recursive: true, force: true });

if (karten.length === 0) {
  console.error(
    "\nKein Scan konnte verarbeitet werden. Ist Claude Code installiert und mit dem Abo angemeldet? (Test: einfach `claude` im Terminal starten)",
  );
  process.exit(1);
}

const ausgabe = resolve(eingabe.replace(/\.json$/i, "") + "-verarbeitet.json");
writeFileSync(
  ausgabe,
  JSON.stringify(
    {
      format: "buch-lernkarten-export",
      version: 1,
      exportiert_am: new Date().toISOString(),
      buch: { titel: daten.buch.titel, autor: daten.buch.autor ?? "" },
      karten,
    },
    null,
    2,
  ),
);

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
