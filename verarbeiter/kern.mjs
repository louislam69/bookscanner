/**
 * Gemeinsamer Verarbeitungskern für verarbeite.mjs (Datei) und sync.mjs
 * (Cloud): schickt die Fotos einer Scan-Datei über das Claude Agent SDK
 * (Abo-Login) an Claude und baut daraus fertige Lernkarten.
 */
import { query } from "@anthropic-ai/claude-agent-sdk";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function pruefeScanDatei(daten) {
  if (daten?.format !== "buch-lernkarten-scans" || !Array.isArray(daten.scans)) {
    throw new Error(
      "Keine Scan-Datei der Buch-Lernkarten-App (erwartet: format „buch-lernkarten-scans“).",
    );
  }
}

function extrahiereJson(text) {
  const anfang = text.indexOf("{");
  const ende = text.lastIndexOf("}");
  if (anfang === -1 || ende <= anfang) {
    throw new Error("Antwort enthielt kein JSON");
  }
  return JSON.parse(text.slice(anfang, ende + 1));
}

/**
 * Verarbeitet alle Scans einer Scan-Datei.
 * @returns {Promise<{karten: object[], fehlgeschlagen: number[]}>}
 */
export async function verarbeiteScans(daten, melde = console.log) {
  pruefeScanDatei(daten);

  const arbeitsordner = mkdtempSync(join(tmpdir(), "lernkarten-"));
  const kategorien = [...(daten.kategorien ?? [])];
  const karten = [];
  const fehlgeschlagen = [];

  try {
    for (let i = 0; i < daten.scans.length; i++) {
      const scan = daten.scans[i];
      melde(`  [${i + 1}/${daten.scans.length}] Verarbeite Scan…`);

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
          wichtigkeit: Math.min(
            5,
            Math.max(1, Math.round(Number(ki.wichtigkeit) || 3)),
          ),
          lernstatus: "neu",
          naechste_wiederholung_am: null,
          wiederholungs_intervall: 0,
          verarbeitet: true,
          erstellt_am: new Date().toISOString(),
          zuletzt_bearbeitet_am: new Date().toISOString(),
        });
        melde(`      ✓ ${karten.at(-1).titel}`);
      } catch (fehler) {
        melde(`      ✗ fehlgeschlagen: ${fehler.message}`);
        fehlgeschlagen.push(i + 1);
      }
    }
  } finally {
    rmSync(arbeitsordner, { recursive: true, force: true });
  }

  return { karten, fehlgeschlagen };
}

export function baueExportDatei(daten, karten) {
  return {
    format: "buch-lernkarten-export",
    version: 1,
    exportiert_am: new Date().toISOString(),
    buch: { titel: daten.buch.titel, autor: daten.buch.autor ?? "" },
    karten,
  };
}
