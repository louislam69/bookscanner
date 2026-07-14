import type { Karte, KiKarte } from "../types";
import { jetzt, neueId } from "../types";
import {
  ladeEinstellungen,
  ladeFotos,
  ladeKarten,
  speichereFoto,
  speichereKarte,
} from "../db";
import { erstelleKartenMitKi } from "./claude";

/**
 * Verarbeitet einen Roh-Scan: schickt die gruppierten Fotos an Claude.
 * Die KI erkennt selbst, wie viele inhaltliche Abschnitte (Weisheiten)
 * die Seiten enthalten — der Scan wird zur ersten Karte, jeder weitere
 * Abschnitt wird eine eigene neue Karte, und die Fotos werden den Karten
 * zugeordnet. Braucht Internet — Fotos bleiben bei Fehlern unverändert.
 */
export async function verarbeiteKarte(
  karte: Karte,
  buch: { titel: string; autor: string },
): Promise<Karte[]> {
  const fotos = await ladeFotos(karte.id);
  if (fotos.length === 0) {
    throw new Error("Diese Karte hat keine Fotos, die verarbeitet werden könnten.");
  }
  const einstellungen = await ladeEinstellungen();
  const geschwister = await ladeKarten(karte.buch_id);
  const kategorien = [
    ...new Set(geschwister.map((k) => k.kategorie).filter(Boolean)),
  ];

  const kiKarten = await erstelleKartenMitKi(
    fotos.map((f) => f.blob),
    { buchTitel: buch.titel, autor: buch.autor, kategorien },
    einstellungen,
  );

  // Fotos den Karten zuordnen; jedes Foto höchstens einer Karte,
  // nicht zugeordnete Fotos bleiben bei der ersten Karte.
  const beansprucht = new Set<number>();
  const zuordnung = kiKarten.map((ki) =>
    ki.foto_nummern
      .map((n) => n - 1)
      .filter((i) => !beansprucht.has(i) && (beansprucht.add(i), true)),
  );
  for (let i = 0; i < fotos.length; i++) {
    if (!beansprucht.has(i)) zuordnung[0].push(i);
  }
  zuordnung[0].sort((a, b) => a - b);

  const ergebnis: Karte[] = [];
  for (let k = 0; k < kiKarten.length; k++) {
    const ki = kiKarten[k];
    const id = k === 0 ? karte.id : neueId();

    const fotoIds: string[] = [];
    for (const i of zuordnung[k]) {
      if (fotos[i].karte_id !== id) {
        await speichereFoto({ ...fotos[i], karte_id: id });
      }
      fotoIds.push(fotos[i].id);
    }

    const felder = kiFelder(ki, karte.quelle_seiten);
    const neu: Karte =
      k === 0
        ? {
            ...karte,
            ...felder,
            foto_ids: fotoIds,
            verarbeitet: true,
            zuletzt_bearbeitet_am: jetzt(),
          }
        : {
            id,
            buch_id: karte.buch_id,
            ...felder,
            lernstatus: "neu",
            naechste_wiederholung_am: null,
            wiederholungs_intervall: 0,
            foto_ids: fotoIds,
            verarbeitet: true,
            erstellt_am: jetzt(),
            zuletzt_bearbeitet_am: jetzt(),
          };
    await speichereKarte(neu);
    ergebnis.push(neu);
  }
  return ergebnis;
}

function kiFelder(ki: KiKarte, bisherigeSeiten: string) {
  return {
    titel: ki.titel,
    kernaussage: ki.kernaussage,
    stichpunkte: ki.stichpunkte,
    kategorie: ki.kategorie,
    tags: ki.tags,
    quelle_seiten: ki.quelle_seiten || bisherigeSeiten,
    wichtigkeit: ki.wichtigkeit,
  };
}
