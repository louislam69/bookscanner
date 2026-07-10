import type { Karte } from "../types";
import { jetzt } from "../types";
import { ladeEinstellungen, ladeFotos, ladeKarten, speichereKarte } from "../db";
import { erstelleKarteMitKi } from "./claude";

/**
 * Verarbeitet einen Roh-Scan: schickt die gruppierten Fotos an Claude und
 * füllt die Karte mit Titel, Kernaussage, Stichpunkten und Kategorie.
 * Braucht Internet — Fotos bleiben bei Fehlern unverändert gespeichert.
 */
export async function verarbeiteKarte(
  karte: Karte,
  buch: { titel: string; autor: string },
): Promise<Karte> {
  const fotos = await ladeFotos(karte.id);
  if (fotos.length === 0) {
    throw new Error("Diese Karte hat keine Fotos, die verarbeitet werden könnten.");
  }
  const einstellungen = await ladeEinstellungen();
  const geschwister = await ladeKarten(karte.buch_id);
  const kategorien = [
    ...new Set(geschwister.map((k) => k.kategorie).filter(Boolean)),
  ];

  const ki = await erstelleKarteMitKi(
    fotos.map((f) => f.blob),
    { buchTitel: buch.titel, autor: buch.autor, kategorien },
    einstellungen,
  );

  const aktualisiert: Karte = {
    ...karte,
    titel: ki.titel,
    kernaussage: ki.kernaussage,
    stichpunkte: ki.stichpunkte,
    kategorie: ki.kategorie,
    tags: ki.tags,
    quelle_seiten: ki.quelle_seiten || karte.quelle_seiten,
    wichtigkeit: ki.wichtigkeit,
    verarbeitet: true,
    zuletzt_bearbeitet_am: jetzt(),
  };
  await speichereKarte(aktualisiert);
  return aktualisiert;
}
