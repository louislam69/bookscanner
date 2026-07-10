import type { Buch, ExportDatei, Karte } from "../types";
import { jetzt, neueId } from "../types";
import { ladeBuecher, ladeKarten, speichereBuch, speichereKarte } from "../db";

/**
 * Export/Import (Spec Abschnitt 9).
 * Die Export-Datei enthält ausschließlich Karteninhalte + Buch-Metadaten —
 * niemals API-Keys oder andere Zugangsdaten (die liegen in einem separaten
 * Einstellungs-Store und werden hier nie angefasst).
 */

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
  const json = JSON.stringify(daten, null, 2);
  const dateiname = `${buch.titel.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase() || "buch"}-lernkarten.json`;
  const datei = new File([json], dateiname, { type: "application/json" });

  // iPhone: Teilen-Menü (AirDrop, Dateien, Mail); PC: Download
  if (navigator.canShare?.({ files: [datei] })) {
    try {
      await navigator.share({ files: [datei], title: buch.titel });
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

export interface ImportErgebnis {
  buchTitel: string;
  importiert: number;
  uebersprungen: number;
}

export async function importiereDatei(datei: File): Promise<ImportErgebnis> {
  let daten: ExportDatei;
  try {
    daten = JSON.parse(await datei.text());
  } catch {
    throw new Error("Die Datei ist kein gültiges JSON.");
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

  // Dubletten-Erkennung: gleiche Karten-ID oder gleicher Titel im Buch
  const vorhandene = await ladeKarten(buch.id);
  const vorhandeneIds = new Set(vorhandene.map((k) => k.id));
  const vorhandeneTitel = new Set(
    vorhandene.map((k) => k.titel.trim().toLowerCase()),
  );

  let importiert = 0;
  let uebersprungen = 0;
  for (const roh of daten.karten) {
    if (
      vorhandeneIds.has(roh.id) ||
      vorhandeneTitel.has(roh.titel.trim().toLowerCase())
    ) {
      uebersprungen++;
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

  return { buchTitel: buch.titel, importiert, uebersprungen };
}
