#!/usr/bin/env node
/**
 * Buch-Lernkarten — Cloud-Sync (kein Dateien-Hin-und-Herschicken)
 *
 * Holt hochgeladene Scans aus dem privaten GitHub-Austausch-Repo, verarbeitet
 * sie über das Claude-Pro/Max-Abo (Agent SDK) und legt die fertigen Karten
 * wieder im Repo ab. Die App auf dem Handy holt sie sich beim nächsten
 * Öffnen automatisch.
 *
 *   Handy:  „☁️ In Cloud hochladen"      →  scans/…json
 *   PC:     node sync.mjs                 →  verarbeitet/…json
 *   Handy:  App öffnen (holt automatisch ab und räumt auf)
 *
 * Einrichtung (einmalig): Datei konfig.json in diesem Ordner anlegen:
 *   {
 *     "token": "github_pat_…",
 *     "repo": "louislam69/lernkarten-daten"
 *   }
 * (Gleicher Token und gleiches privates Repo wie in den App-Einstellungen.
 *  Alternativ per Umgebungsvariablen GITHUB_TOKEN und LERNKARTEN_REPO.)
 *
 * Nutzung:
 *   node sync.mjs                  einmal alles Anstehende verarbeiten
 *   node sync.mjs --dauerbetrieb   laufen lassen und alle 60 s nachschauen
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { baueExportDatei, verarbeiteScans } from "./kern.mjs";

const API = "https://api.github.com";

function ladeKonfiguration() {
  let konfig = {
    token: process.env.GITHUB_TOKEN ?? "",
    repo: process.env.LERNKARTEN_REPO ?? "",
    // Optional: "opus" für beste Erkennung (mehr Abo-Verbrauch), sonst
    // Standard des Abos. Auch per Umgebungsvariable LERNKARTEN_MODELL.
    modell: process.env.LERNKARTEN_MODELL ?? "",
  };
  const pfad = join(dirname(fileURLToPath(import.meta.url)), "konfig.json");
  if (existsSync(pfad)) {
    try {
      konfig = { ...konfig, ...JSON.parse(readFileSync(pfad, "utf8")) };
    } catch {
      console.error("konfig.json ist kein gültiges JSON.");
      process.exit(1);
    }
  }
  if (!konfig.token || !konfig.repo) {
    console.error(
      "Keine Konfiguration gefunden. Lege verarbeiter/konfig.json an:\n" +
        '  { "token": "github_pat_…", "repo": "louislam69/lernkarten-daten" }\n' +
        "(Token: fine-grained, nur dieses private Repo, Contents: Read and write)",
    );
    process.exit(1);
  }
  return konfig;
}

async function anfrage(konfig, pfad, init = {}, roh = false) {
  const antwort = await fetch(`${API}/repos/${konfig.repo}${pfad}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${konfig.token}`,
      Accept: roh ? "application/vnd.github.raw+json" : "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers,
    },
  });
  if (antwort.status === 401) {
    throw new Error("GitHub-Token abgelehnt — konfig.json prüfen.");
  }
  if (antwort.status === 403) {
    throw new Error(
      "Zugriff verweigert — hat das Token Contents: Read and write für das Repo?",
    );
  }
  return antwort;
}

function textZuBase64(text) {
  return Buffer.from(text, "utf8").toString("base64");
}

async function einDurchlauf(konfig) {
  const liste = await anfrage(konfig, "/contents/scans");
  if (liste.status === 404) {
    console.log("Keine neuen Scans in der Cloud.");
    return 0;
  }
  if (!liste.ok) throw new Error(`Auflisten fehlgeschlagen (HTTP ${liste.status})`);

  const eintraege = (await liste.json()).filter(
    (e) => e.type === "file" && e.name.endsWith(".json"),
  );
  if (eintraege.length === 0) {
    console.log("Keine neuen Scans in der Cloud.");
    return 0;
  }

  console.log(`${eintraege.length} Scan-Datei(en) gefunden.\n`);
  let verarbeitetGesamt = 0;

  for (const eintrag of eintraege) {
    console.log(`▶ ${eintrag.name}`);
    const inhalt = await anfrage(konfig, `/contents/${eintrag.path}`, {}, true);
    if (!inhalt.ok) {
      console.log("  Konnte nicht geladen werden — übersprungen.");
      continue;
    }

    let daten;
    try {
      daten = await inhalt.json();
    } catch {
      console.log("  Kein gültiges JSON — übersprungen.");
      continue;
    }

    let ergebnis;
    try {
      ergebnis = await verarbeiteScans(daten, console.log, { modell: konfig.modell });
    } catch (fehler) {
      console.log(`  ${fehler.message} — übersprungen.`);
      continue;
    }

    if (ergebnis.karten.length === 0) {
      console.log(
        "  Kein Scan konnte verarbeitet werden — Datei bleibt für einen neuen Versuch liegen.\n" +
          "  (Ist Claude Code installiert und mit dem Abo angemeldet? Test: `claude` starten)",
      );
      continue;
    }

    // Fertige Karten hochladen
    const zielName = `verarbeitet/${eintrag.name.replace(/\.json$/, "")}-verarbeitet.json`;
    const hochladen = await anfrage(konfig, `/contents/${zielName}`, {
      method: "PUT",
      body: JSON.stringify({
        message: `Verarbeitet: ${eintrag.name} (${ergebnis.karten.length} Karten)`,
        content: textZuBase64(
          JSON.stringify(baueExportDatei(daten, ergebnis.karten)),
        ),
      }),
    });
    if (!hochladen.ok) {
      console.log(`  Hochladen fehlgeschlagen (HTTP ${hochladen.status}) — Scan bleibt liegen.`);
      continue;
    }

    // Nur bei komplettem Erfolg die Scan-Datei aufräumen; bei Teilerfolg
    // bleibt sie liegen (Import auf dem Handy überspringt Dubletten).
    if (ergebnis.fehlgeschlagen.length === 0) {
      await anfrage(konfig, `/contents/${eintrag.path}`, {
        method: "DELETE",
        body: JSON.stringify({ message: `Erledigt: ${eintrag.name}`, sha: eintrag.sha }),
      });
    } else {
      console.log(
        `  Scan(s) ${ergebnis.fehlgeschlagen.join(", ")} fehlgeschlagen — Datei bleibt für einen neuen Versuch liegen.`,
      );
    }

    verarbeitetGesamt += ergebnis.karten.length;
    console.log(`  ✓ ${ergebnis.karten.length} Karte(n) → ${zielName}\n`);
  }

  if (verarbeitetGesamt > 0) {
    console.log(
      `${verarbeitetGesamt} Karte(n) bereit. Einfach die App auf dem Handy öffnen — sie holt sie automatisch ab.`,
    );
  }
  return verarbeitetGesamt;
}

const konfig = ladeKonfiguration();
const dauerbetrieb = process.argv.includes("--dauerbetrieb");

if (dauerbetrieb) {
  console.log("Dauerbetrieb: schaue alle 60 Sekunden nach neuen Scans (Strg+C zum Beenden).\n");
  for (;;) {
    try {
      await einDurchlauf(konfig);
    } catch (fehler) {
      console.error(fehler.message);
    }
    await new Promise((r) => setTimeout(r, 60_000));
  }
} else {
  try {
    await einDurchlauf(konfig);
  } catch (fehler) {
    console.error(fehler.message);
    process.exit(1);
  }
}
