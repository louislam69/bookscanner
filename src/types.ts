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
  hochgeladen?: boolean; // Roh-Scan wurde bereits in die Cloud hochgeladen
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
  /** Fine-grained GitHub-Token für das private Austausch-Repo (optional) */
  githubToken: string;
  /** Privates Austausch-Repo im Format "besitzer/name" (optional) */
  githubRepo: string;
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

/**
 * Format der Scan-Datei für die Verarbeitung am PC über das Claude-Pro-Abo:
 * unverarbeitete Scans samt Fotos (Base64-JPEG). Das PC-Tool (verarbeiter/)
 * liest diese Datei, erstellt die Karten über das Agent SDK und schreibt
 * eine normale Export-Datei zurück, die die App wieder importiert.
 */
export interface ScansExportDatei {
  format: "buch-lernkarten-scans";
  version: 1;
  exportiert_am: string;
  buch: { titel: string; autor: string };
  kategorien: string[]; // vorhandene Kategorien, damit die KI sie wiederverwendet
  scans: {
    id: string; // Karten-ID — bleibt erhalten, damit der Import zuordnen kann
    quelle_seiten: string;
    fotos: string[]; // Base64-JPEG in Aufnahme-Reihenfolge
  }[];
}

export function neueId(): string {
  return crypto.randomUUID();
}

export function jetzt(): string {
  return new Date().toISOString();
}
