import type { Buch, ExportDatei, Karte, ScansExportDatei } from "../types";
import { jetzt, neueId } from "../types";
import {
  ladeBuecher,
  ladeFotos,
  ladeKarten,
  speichereBuch,
  speichereKarte,
} from "../db";
import { blobZuBase64 } from "./bild";

/**
 * Export/Import (Spec Abschnitt 9).
 * Export-Dateien enthalten ausschließlich Karteninhalte + Buch-Metadaten —
 * niemals API-Keys oder andere Zugangsdaten (die liegen in einem separaten
 * Einstellungs-Store und werden hier nie angefasst).
 */

async function teileOderLadeDatei(inhalt: string, dateiname: string) {
  const datei = new File([inhalt], dateiname, { type: "application/json" });

  // iPhone: Teilen-Menü (AirDrop, Dateien, Mail); PC: Download
  if (navigator.canShare?.({ files: [datei] })) {
    try {
      await navigator.share({ files: [datei], title: dateiname });
      return;
    } catch (fehler) {
      if ((fehler as DOMException).name === "AbortError") return;
      // sonst auf Download zurückfallen
    }
  }
  const url = URL.createObjectURL(datei);
  const a = document.createElement("a");
  a.href = url;
  a.download = dateiname;
  a.click();
  URL.revokeObjectURL(url);
}

function dateiname(buch: Buch, suffix: string) {
  const basis =
    buch.titel.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase() || "buch";
  return `${basis}-${suffix}.json`;
}

// --- Fertiges Buch exportieren (zum Teilen / Übertragen) ---

export function erstelleExport(buch: Buch, karten: Karte[]): ExportDatei {
  return {
    format: "buch-lernkarten-export",
    version: 1,
    exportiert_am: jetzt(),
    buch: { titel: buch.titel, autor: buch.autor },
    karten: karten.map(({ buch_id: _b, foto_ids: _f, ...rest }) => rest),
  };
}

export async function exportiereBuch(buch: Buch): Promise<void> {
  const karten = await ladeKarten(buch.id);
  const daten = erstelleExport(buch, karten);
  await teileOderLadeDatei(
    JSON.stringify(daten, null, 2),
    dateiname(buch, "lernkarten"),
  );
}

// --- Roh-Scans exportieren (zur Verarbeitung am PC über das Pro-Abo) ---

export async function exportiereScans(buch: Buch): Promise<number> {
  const karten = await ladeKarten(buch.id);
  const unverarbeitet = karten.filter((k) => !k.verarbeitet);
  if (unverarbeitet.length === 0) return 0;

  const scans = await Promise.all(
    unverarbeitet.map(async (karte) => {
      const fotos = await ladeFotos(karte.id);
      return {
        id: karte.id,
        quelle_seiten: karte.quelle_seiten,
        fotos: await Promise.all(fotos.map((f) => blobZuBase64(f.blob))),
      };
    }),
  );

  const daten: ScansExportDatei = {
    format: "buch-lernkarten-scans",
    version: 1,
    exportiert_am: jetzt(),
    buch: { titel: buch.titel, autor: buch.autor },
    kategorien: [
      ...new Set(karten.map((k) => k.kategorie).filter(Boolean)),
    ].sort(),
    scans,
  };
  await teileOderLadeDatei(JSON.stringify(daten), dateiname(buch, "scans"));
  return unverarbeitet.length;
}

// --- Import (fertige Karten von Freunden oder vom PC-Verarbeiter) ---

export interface ImportErgebnis {
  buchTitel: string;
  importiert: number;
  aktualisiert: number;
  uebersprungen: number;
}

export async function importiereDatei(datei: File): Promise<ImportErgebnis> {
  let daten: ExportDatei;
  try {
    daten = JSON.parse(await datei.text());
  } catch {
    throw new Error("Die Datei ist kein gültiges JSON.");
  }
  if ((daten as { format?: string }).format === "buch-lernkarten-scans") {
    throw new Error(
      "Das ist eine Scan-Datei für die Verarbeitung am PC. Bitte die vom Verarbeiter erzeugte Datei (…-verarbeitet.json) importieren.",
    );
  }
  if (daten.format !== "buch-lernkarten-export" || !Array.isArray(daten.karten)) {
    throw new Error("Die Datei ist keine Buch-Lernkarten-Exportdatei.");
  }

  // Buch anhand von Titel + Autor wiederfinden oder neu anlegen
  const buecher = await ladeBuecher();
  let buch = buecher.find(
    (b) =>
      b.titel.trim().toLowerCase() === daten.buch.titel.trim().toLowerCase() &&
      b.autor.trim().toLowerCase() === daten.buch.autor.trim().toLowerCase(),
  );
  if (!buch) {
    buch = {
      id: neueId(),
      titel: daten.buch.titel,
      autor: daten.buch.autor,
      erstellt_am: jetzt(),
    };
    await speichereBuch(buch);
  }

  const vorhandene = await ladeKarten(buch.id);
  const nachId = new Map(vorhandene.map((k) => [k.id, k]));
  const vorhandeneTitel = new Set(
    vorhandene.filter((k) => k.verarbeitet).map((k) => k.titel.trim().toLowerCase()),
  );

  let importiert = 0;
  let aktualisiert = 0;
  let uebersprungen = 0;

  for (const roh of daten.karten) {
    const bestehend = roh.id ? nachId.get(roh.id) : undefined;

    if (bestehend) {
      // Kommt ein verarbeiteter Stand für einen lokalen Roh-Scan zurück
      // (PC-Verarbeitung über das Pro-Abo), wird der Scan zur fertigen
      // Karte — Fotos und Lernfortschritt bleiben erhalten.
      if (!bestehend.verarbeitet && roh.verarbeitet) {
        await speichereKarte({
          ...bestehend,
          titel: roh.titel,
          kernaussage: roh.kernaussage,
          stichpunkte: roh.stichpunkte ?? [],
          kategorie: roh.kategorie ?? "",
          tags: roh.tags ?? [],
          quelle_seiten: roh.quelle_seiten || bestehend.quelle_seiten,
          wichtigkeit: roh.wichtigkeit ?? 3,
          verarbeitet: true,
          zuletzt_bearbeitet_am: jetzt(),
        });
        aktualisiert++;
      } else {
        uebersprungen++; // Dublette
      }
      continue;
    }

    if (vorhandeneTitel.has(roh.titel.trim().toLowerCase())) {
      uebersprungen++; // einfache Dubletten-Erkennung über den Titel
      continue;
    }

    const karte: Karte = {
      ...roh,
      id: roh.id || neueId(),
      buch_id: buch.id,
      foto_ids: [],
      stichpunkte: roh.stichpunkte ?? [],
      tags: roh.tags ?? [],
      wichtigkeit: roh.wichtigkeit ?? 3,
      lernstatus: roh.lernstatus ?? "neu",
      naechste_wiederholung_am: roh.naechste_wiederholung_am ?? null,
      wiederholungs_intervall: roh.wiederholungs_intervall ?? 0,
      verarbeitet: roh.verarbeitet ?? true,
      erstellt_am: roh.erstellt_am ?? jetzt(),
      zuletzt_bearbeitet_am: jetzt(),
    };
    await speichereKarte(karte);
    importiert++;
  }

  return { buchTitel: buch.titel, importiert, aktualisiert, uebersprungen };
}
