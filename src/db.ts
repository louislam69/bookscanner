import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Buch, Einstellungen, Foto, Karte } from "./types";

interface LernkartenDB extends DBSchema {
  buecher: { key: string; value: Buch };
  karten: {
    key: string;
    value: Karte;
    indexes: { "nach-buch": string };
  };
  fotos: {
    key: string;
    value: Foto;
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
export const speichereFoto = async (foto: Foto) => {
  await (await db()).put("fotos", foto);
};
export async function ladeFotos(karteId: string) {
  const fotos = await (await db()).getAllFromIndex("fotos", "nach-karte", karteId);
  return fotos.sort((a, b) => a.reihenfolge - b.reihenfolge);
}

// --- Einstellungen (werden bewusst NIE exportiert) ---
export const STANDARD_MODELL = "claude-opus-4-8";

export async function ladeEinstellungen(): Promise<Einstellungen> {
  const d = await db();
  return {
    apiKey: (await d.get("einstellungen", "apiKey")) ?? "",
    modell: (await d.get("einstellungen", "modell")) ?? STANDARD_MODELL,
  };
}
export async function speichereEinstellungen(e: Einstellungen) {
  const d = await db();
  await d.put("einstellungen", e.apiKey, "apiKey");
  await d.put("einstellungen", e.modell, "modell");
}
