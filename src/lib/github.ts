import type { Buch, Einstellungen, ExportDatei } from "../types";
import { jetzt } from "../types";
import { speichereKarte } from "../db";
import {
  erstelleScansDaten,
  importiereExportDaten,
  type ImportErgebnis,
} from "./exportImport";

/**
 * Cloud-Austausch über ein privates GitHub-Repo (statt Dateien manuell
 * hin- und herzuschicken):
 *
 *   Handy  → lädt Scans nach       scans/…json
 *   PC     → verarbeiter/sync.mjs verarbeitet sie (Pro-Abo) und legt
 *            fertige Karten unter  verarbeitet/…json ab
 *   Handy  → holt die fertigen Karten ab und löscht sie im Repo
 *
 * Wichtig: Das Austausch-Repo muss PRIVAT sein (Buchfotos!) und ist
 * bewusst ein anderes Repo als das öffentliche App-Repo.
 */

const API = "https://api.github.com";

function pruefeKonfiguration(e: Einstellungen) {
  if (!e.githubToken || !e.githubRepo) {
    throw new Error(
      "Cloud-Austausch ist nicht eingerichtet. In den Einstellungen GitHub-Token und privates Repo eintragen.",
    );
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(e.githubRepo)) {
    throw new Error(
      'Das Repo muss im Format "besitzer/name" angegeben sein, z. B. "louislam69/lernkarten-daten".',
    );
  }
}

async function anfrage(
  e: Einstellungen,
  pfad: string,
  init: RequestInit = {},
  roh = false,
): Promise<Response> {
  let antwort: Response;
  try {
    antwort = await fetch(`${API}/repos/${e.githubRepo}${pfad}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${e.githubToken}`,
        Accept: roh ? "application/vnd.github.raw+json" : "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...init.headers,
      },
    });
  } catch {
    throw new Error(
      "GitHub ist nicht erreichbar. Für den Cloud-Austausch wird eine Internetverbindung benötigt.",
    );
  }
  if (antwort.status === 401) {
    throw new Error("Das GitHub-Token wurde abgelehnt. Bitte in den Einstellungen prüfen.");
  }
  if (antwort.status === 403) {
    throw new Error(
      "Zugriff verweigert. Hat das Token Lese- UND Schreibrechte (Contents) für das Austausch-Repo?",
    );
  }
  return antwort;
}

/** Base64 für UTF-8-Text (btoa alleine kann keine Umlaute) */
function textZuBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binaer = "";
  const block = 0x8000;
  for (let i = 0; i < bytes.length; i += block) {
    binaer += String.fromCharCode(...bytes.subarray(i, i + block));
  }
  return btoa(binaer);
}

// --- Verbindungstest (Einstellungen) ---

/**
 * Prüft die Cloud-Konfiguration End-zu-Ende: Repo erreichbar, Token gültig,
 * Schreibrecht vorhanden (legt kurz eine Testdatei an und löscht sie wieder).
 * Liefert eine Erfolgsmeldung oder wirft einen verständlichen Fehler.
 */
export async function pruefeCloudVerbindung(
  einstellungen: Einstellungen,
): Promise<string> {
  pruefeKonfiguration(einstellungen);

  const repo = await anfrage(einstellungen, "");
  if (repo.status === 404) {
    throw new Error(
      `Repo "${einstellungen.githubRepo}" nicht gefunden. Gibt es das Repo, ist der Name exakt richtig geschrieben, und ist es beim Token unter „Only select repositories" ausgewählt?`,
    );
  }
  if (!repo.ok) {
    throw new Error(`Repo-Abruf fehlgeschlagen (HTTP ${repo.status}).`);
  }
  const info = (await repo.json()) as { private: boolean };

  // Schreibtest: Datei anlegen und gleich wieder löschen
  const testPfad = "verbindungstest.json";
  const anlegen = await anfrage(einstellungen, `/contents/${testPfad}`, {
    method: "PUT",
    body: JSON.stringify({
      message: "Verbindungstest der Lernkarten-App",
      content: textZuBase64(JSON.stringify({ test: jetzt() })),
    }),
  });
  if (anlegen.status === 404 || anlegen.status === 409 || anlegen.status === 422) {
    throw new Error(
      "Lesen klappt, aber Schreiben nicht. Hat das Token die Berechtigung „Contents: Read and write“ (nicht nur Read-only)?",
    );
  }
  if (!anlegen.ok) {
    throw new Error(`Schreibtest fehlgeschlagen (HTTP ${anlegen.status}).`);
  }
  const angelegt = (await anlegen.json()) as { content: { sha: string } };
  await anfrage(einstellungen, `/contents/${testPfad}`, {
    method: "DELETE",
    body: JSON.stringify({
      message: "Verbindungstest aufgeräumt",
      sha: angelegt.content.sha,
    }),
  });

  return info.private
    ? "✓ Verbindung steht: Lesen und Schreiben funktionieren, das Repo ist privat."
    : "✓ Verbindung steht — ABER das Repo ist ÖFFENTLICH! Bitte auf privat stellen, sonst sind deine Buchfotos für jeden sichtbar.";
}

// --- Scans hochladen (Handy → Cloud) ---

export async function ladeScansHoch(
  buch: Buch,
  einstellungen: Einstellungen,
): Promise<number> {
  pruefeKonfiguration(einstellungen);

  let { daten, karten } = await erstelleScansDaten(buch, true);
  if (karten.length === 0) {
    // Nichts Neues — auf Wunsch alle noch unverarbeiteten erneut hochladen
    const alle = await erstelleScansDaten(buch, false);
    if (alle.karten.length === 0) return 0;
    if (
      !confirm(
        "Alle Scans wurden bereits hochgeladen. Trotzdem erneut hochladen (verbraucht am PC erneut Abo-Guthaben)?",
      )
    ) {
      return 0;
    }
    daten = alle.daten;
    karten = alle.karten;
  }

  const slug =
    buch.titel.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase() || "buch";
  const name = `scans/${new Date().toISOString().replace(/[:.]/g, "-")}-${slug}.json`;

  const antwort = await anfrage(einstellungen, `/contents/${name}`, {
    method: "PUT",
    body: JSON.stringify({
      message: `Scans: ${buch.titel} (${karten.length} Abschnitte)`,
      content: textZuBase64(JSON.stringify(daten)),
    }),
  });
  if (antwort.status === 404) {
    throw new Error(
      `Repo "${einstellungen.githubRepo}" nicht gefunden. Existiert es, und hat das Token Zugriff darauf?`,
    );
  }
  if (!antwort.ok) {
    throw new Error(`Hochladen fehlgeschlagen (HTTP ${antwort.status}).`);
  }

  for (const karte of karten) {
    await speichereKarte({
      ...karte,
      hochgeladen: true,
      zuletzt_bearbeitet_am: jetzt(),
    });
  }
  return karten.length;
}

// --- Fertige Karten abholen (Cloud → Handy) ---

export interface CloudErgebnis {
  dateien: number;
  importiert: number;
  aktualisiert: number;
  uebersprungen: number;
}

export async function holeVerarbeitete(
  einstellungen: Einstellungen,
): Promise<CloudErgebnis> {
  pruefeKonfiguration(einstellungen);

  const liste = await anfrage(einstellungen, "/contents/verarbeitet");
  if (liste.status === 404) {
    // Ordner existiert noch nicht → nichts zu holen
    return { dateien: 0, importiert: 0, aktualisiert: 0, uebersprungen: 0 };
  }
  if (!liste.ok) {
    throw new Error(`Abruf fehlgeschlagen (HTTP ${liste.status}).`);
  }

  const eintraege = (await liste.json()) as {
    name: string;
    path: string;
    sha: string;
    type: string;
  }[];
  const gesamt: CloudErgebnis = {
    dateien: 0,
    importiert: 0,
    aktualisiert: 0,
    uebersprungen: 0,
  };

  for (const eintrag of eintraege) {
    if (eintrag.type !== "file" || !eintrag.name.endsWith(".json")) continue;

    const inhalt = await anfrage(
      einstellungen,
      `/contents/${eintrag.path}`,
      {},
      true,
    );
    if (!inhalt.ok) continue;

    let ergebnis: ImportErgebnis;
    try {
      ergebnis = await importiereExportDaten(
        (await inhalt.json()) as ExportDatei,
      );
    } catch {
      continue; // fehlerhafte Datei liegen lassen
    }

    gesamt.dateien++;
    gesamt.importiert += ergebnis.importiert;
    gesamt.aktualisiert += ergebnis.aktualisiert;
    gesamt.uebersprungen += ergebnis.uebersprungen;

    // Erfolgreich importiert → Datei im Repo aufräumen
    await anfrage(einstellungen, `/contents/${eintrag.path}`, {
      method: "DELETE",
      body: JSON.stringify({
        message: `Importiert: ${eintrag.name}`,
        sha: eintrag.sha,
      }),
    });
  }

  return gesamt;
}
