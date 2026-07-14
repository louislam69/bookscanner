/**
 * Gemeinsamer Verarbeitungskern für verarbeite.mjs (Datei) und sync.mjs
 * (Cloud): schickt die Fotos einer Scan-Datei über das Claude Agent SDK
 * (Abo-Login) an Claude und baut daraus fertige Lernkarten.
 */
import { query } from "@anthropic-ai/claude-agent-sdk";
import { randomUUID } from "node:crypto";
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

Sie zeigen aufeinanderfolgende Seiten aus dem Buch "${daten.buch.titel}"${daten.buch.autor ? ` von ${daten.buch.autor}` : ""}. Die Seiten können EINEN oder MEHRERE eigenständige inhaltliche Abschnitte enthalten (z. B. mehrere Taktiken, Weisheiten oder Konzepte — oft jeweils gefolgt von einer Beispielseite).

Deine Aufgabe:
1. Erkenne selbstständig, wie viele eigenständige Abschnitte die Seiten enthalten und welches Thema jeder hat.
2. Erstelle für JEDEN Abschnitt genau EINE deutsche Lernkarte, die ihn so zusammenfasst, dass man ihn ohne das Buch wiederholen kann. Packe niemals zwei verschiedene Abschnitte in eine Karte.
3. Beispielseiten sind KEINE eigenen Abschnitte: Ordne jedes Beispiel dem Abschnitt zu, den es illustriert, und fasse es dort als einen kurzen Stichpunkt zusammen, der mit "Beispiel:" beginnt.

${kategorienHinweis}

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in exakt dieser Form (kein Markdown, kein sonstiger Text):
{
  "karten": [
    {
      "titel": "kurzer, prägnanter Titel",
      "kernaussage": "die zentrale Aussage in 1-3 Sätzen",
      "stichpunkte": ["3-7 Stichpunkte mit den wichtigsten Details"],
      "kategorie": "thematische Kategorie",
      "tags": ["0-4 kurze Schlagworte"],
      "quelle_seiten": "Seitenzahlen falls auf den Fotos erkennbar, sonst leer",
      "wichtigkeit": 3,
      "fotos": [1, 2]
    }
  ]
}
"fotos" nennt die Nummern der Fotos, die zu dieser Karte gehören (1 = erstes Foto der Liste oben); Beispielseiten zählen zum jeweiligen Abschnitt, und jedes Foto gehört zu genau einer Karte.
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
        // Neue Form: { karten: [...] } — alte Einzelkarten-Antworten tolerieren
        const kiKarten = Array.isArray(ki.karten) ? ki.karten : [ki];
        if (kiKarten.length === 0) throw new Error("Antwort enthielt keine Karten");

        for (let k = 0; k < kiKarten.length; k++) {
          const roh = kiKarten[k];
          const kategorie = String(roh.kategorie ?? "").trim();
          if (kategorie && !kategorien.includes(kategorie)) kategorien.push(kategorie);

          const fotoNummern = Array.isArray(roh.fotos)
            ? roh.fotos
                .map((n) => Math.round(Number(n)))
                .filter((n) => n >= 1 && n <= scan.fotos.length)
            : [];

          karten.push({
            // Die erste Karte übernimmt die Scan-ID (aktualisiert den Scan in
            // der App), weitere Abschnitte werden eigene neue Karten.
            id: k === 0 ? scan.id : randomUUID(),
            ...(k > 0 ? { scan_id: scan.id } : {}),
            ...(fotoNummern.length ? { foto_nummern: fotoNummern } : {}),
            titel: String(roh.titel ?? "").trim() || "Ohne Titel",
            kernaussage: String(roh.kernaussage ?? "").trim(),
            stichpunkte: Array.isArray(roh.stichpunkte)
              ? roh.stichpunkte.map((s) => String(s).trim()).filter(Boolean)
              : [],
            kategorie,
            tags: Array.isArray(roh.tags)
              ? roh.tags.map((t) => String(t).trim()).filter(Boolean)
              : [],
            quelle_seiten:
              String(roh.quelle_seiten ?? "").trim() || scan.quelle_seiten || "",
            wichtigkeit: Math.min(
              5,
              Math.max(1, Math.round(Number(roh.wichtigkeit) || 3)),
            ),
            lernstatus: "neu",
            naechste_wiederholung_am: null,
            wiederholungs_intervall: 0,
            verarbeitet: true,
            erstellt_am: new Date().toISOString(),
            zuletzt_bearbeitet_am: new Date().toISOString(),
          });
          melde(`      ✓ ${karten.at(-1).titel}`);
        }
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
