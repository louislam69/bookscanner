import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Buch, Einstellungen, Foto, Karte } from "./types";

/**
 * Fotos werden als ArrayBuffer gespeichert, nicht als Blob: iOS-Safari
 * verliert Blobs in IndexedDB gelegentlich („The object can not be found
 * here."). `blob`/ohne-`daten` ist das Altformat, das beim Lesen
 * automatisch migriert wird.
 */
interface FotoDatensatz {
  id: string;
  karte_id: string;
  reihenfolge: number;
  daten?: ArrayBuffer;
  typ?: string;
  blob?: Blob; // Altformat
}

interface LernkartenDB extends DBSchema {
  buecher: { key: string; value: Buch };
  karten: {
    key: string;
    value: Karte;
    indexes: { "nach-buch": string };
  };
  fotos: {
    key: string;
    value: FotoDatensatz;
    indexes: { "nach-karte": string };
  };
  einstellungen: { key: string; value: string };
}

let dbPromise: Promise<IDBPDatabase<LernkartenDB>> | null = null;

function db() {
  dbPromise ??= openDB<LernkartenDB>("buch-lernkarten", 1, {
    upgrade(d) {
      d.createObjectStore("buecher", { keyPath: "id" });
      const karten = d.createObjectStore("karten", { keyPath: "id" });
      karten.createIndex("nach-buch", "buch_id");
      const fotos = d.createObjectStore("fotos", { keyPath: "id" });
      fotos.createIndex("nach-karte", "karte_id");
      d.createObjectStore("einstellungen");
    },
  });
  return dbPromise;
}

// --- Bücher ---
export const ladeBuecher = async () => (await db()).getAll("buecher");
export const ladeBuch = async (id: string) => (await db()).get("buecher", id);
export const speichereBuch = async (buch: Buch) => {
  await (await db()).put("buecher", buch);
};
export async function loescheBuch(id: string) {
  const d = await db();
  const karten = await d.getAllFromIndex("karten", "nach-buch", id);
  for (const k of karten) await loescheKarte(k.id);
  await d.delete("buecher", id);
}

// --- Karten ---
export const ladeKarten = async (buchId: string) =>
  (await db()).getAllFromIndex("karten", "nach-buch", buchId);
export const ladeKarte = async (id: string) => (await db()).get("karten", id);
export const speichereKarte = async (karte: Karte) => {
  await (await db()).put("karten", karte);
};
export async function loescheKarte(id: string) {
  const d = await db();
  const fotos = await d.getAllFromIndex("fotos", "nach-karte", id);
  for (const f of fotos) await d.delete("fotos", f.id);
  await d.delete("karten", id);
}

// --- Fotos ---
export async function speichereFoto(foto: Foto) {
  const daten = await foto.blob.arrayBuffer();
  await (await db()).put("fotos", {
    id: foto.id,
    karte_id: foto.karte_id,
    reihenfolge: foto.reihenfolge,
    daten,
    typ: foto.blob.type || "image/jpeg",
  });
}

export async function ladeFotos(karteId: string): Promise<Foto[]> {
  const d = await db();
  const rohe = await d.getAllFromIndex("fotos", "nach-karte", karteId);
  rohe.sort((a, b) => a.reihenfolge - b.reihenfolge);

  const fotos: Foto[] = [];
  for (const roh of rohe) {
    if (roh.daten) {
      fotos.push({
        id: roh.id,
        karte_id: roh.karte_id,
        reihenfolge: roh.reihenfolge,
        blob: new Blob([roh.daten], { type: roh.typ || "image/jpeg" }),
      });
    } else if (roh.blob) {
      // Altformat: einmalig ins robuste Format überführen
      try {
        const daten = await roh.blob.arrayBuffer();
        await d.put("fotos", {
          id: roh.id,
          karte_id: roh.karte_id,
          reihenfolge: roh.reihenfolge,
          daten,
          typ: roh.blob.type || "image/jpeg",
        });
        fotos.push({
          id: roh.id,
          karte_id: roh.karte_id,
          reihenfolge: roh.reihenfolge,
          blob: new Blob([daten], { type: roh.blob.type || "image/jpeg" }),
        });
      } catch {
        // Blob ist durch den iOS-Speicherfehler verloren — Foto überspringen
      }
    }
  }
  return fotos;
}

// --- Einstellungen (werden bewusst NIE exportiert) ---
export const STANDARD_MODELL = "claude-opus-4-8";

export async function ladeEinstellungen(): Promise<Einstellungen> {
  const d = await db();
  return {
    apiKey: (await d.get("einstellungen", "apiKey")) ?? "",
    modell: (await d.get("einstellungen", "modell")) ?? STANDARD_MODELL,
    githubToken: (await d.get("einstellungen", "githubToken")) ?? "",
    githubRepo: (await d.get("einstellungen", "githubRepo")) ?? "",
  };
}
export async function speichereEinstellungen(e: Einstellungen) {
  const d = await db();
  await d.put("einstellungen", e.apiKey, "apiKey");
  await d.put("einstellungen", e.modell, "modell");
  await d.put("einstellungen", e.githubToken, "githubToken");
  await d.put("einstellungen", e.githubRepo, "githubRepo");
}
