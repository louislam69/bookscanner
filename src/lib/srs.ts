import type { Karte } from "../types";
import { jetzt } from "../types";

/**
 * Spaced Repetition (Spec Abschnitt 8), vereinfachtes SM-2 mit drei Stufen:
 *   0 = wusste ich nicht
 *   1 = musste überlegen
 *   2 = wusste ich sofort
 */
export type Bewertung = 0 | 1 | 2;

const GEFESTIGT_AB_TAGEN = 21;

export function bewerteKarte(karte: Karte, bewertung: Bewertung): Karte {
  let intervall: number;
  if (bewertung === 0) {
    intervall = 0; // sofort wieder fällig (kommt in derselben Sitzung erneut)
  } else if (bewertung === 1) {
    intervall = karte.wiederholungs_intervall < 1
      ? 1
      : Math.round(karte.wiederholungs_intervall * 1.5);
  } else {
    intervall = karte.wiederholungs_intervall < 1
      ? 2
      : Math.round(karte.wiederholungs_intervall * 2.5);
  }

  const faellig = new Date();
  faellig.setDate(faellig.getDate() + intervall);

  return {
    ...karte,
    wiederholungs_intervall: intervall,
    naechste_wiederholung_am: intervall === 0 ? null : faellig.toISOString(),
    lernstatus: intervall >= GEFESTIGT_AB_TAGEN ? "gefestigt" : "lernend",
    zuletzt_bearbeitet_am: jetzt(),
  };
}

export function istFaellig(karte: Karte): boolean {
  if (!karte.verarbeitet) return false;
  if (!karte.naechste_wiederholung_am) return true;
  return new Date(karte.naechste_wiederholung_am).getTime() <= Date.now();
}
