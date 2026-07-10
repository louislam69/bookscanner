// Datenmodell gemäß Spec, Abschnitt 6

export type Lernstatus = "neu" | "lernend" | "gefestigt";

export interface Buch {
  id: string;
  titel: string;
  autor: string;
  erstellt_am: string; // ISO 8601
}

export interface Karte {
  id: string;
  buch_id: string;
  titel: string;
  kernaussage: string;
  stichpunkte: string[];
  quelle_seiten: string; // z. B. "42-44"
  kategorie: string;
  tags: string[];
  wichtigkeit: number; // 1-5
  lernstatus: Lernstatus;
  naechste_wiederholung_am: string | null; // ISO 8601, null = sofort fällig
  wiederholungs_intervall: number; // Tage, intern für Spaced Repetition
  foto_ids: string[]; // Referenzen auf Original-Fotos
  verarbeitet: boolean; // false = Roh-Scan, wartet auf KI-Verarbeitung
  erstellt_am: string;
  zuletzt_bearbeitet_am: string;
}

export interface Foto {
  id: string;
  karte_id: string;
  reihenfolge: number;
  blob: Blob;
}

export interface Einstellungen {
  apiKey: string;
  modell: string;
}

/** Antwortstruktur der KI-Kartenerstellung */
export interface KiKarte {
  titel: string;
  kernaussage: string;
  stichpunkte: string[];
  kategorie: string;
  tags: string[];
  quelle_seiten: string;
  wichtigkeit: number;
}

/** Format der Export-Datei (Abschnitt 9). Enthält niemals Zugangsdaten. */
export interface ExportDatei {
  format: "buch-lernkarten-export";
  version: 1;
  exportiert_am: string;
  buch: { titel: string; autor: string };
  karten: Omit<Karte, "buch_id" | "foto_ids">[];
}

export function neueId(): string {
  return crypto.randomUUID();
}

export function jetzt(): string {
  return new Date().toISOString();
}
