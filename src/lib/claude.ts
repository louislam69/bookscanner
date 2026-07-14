import Anthropic from "@anthropic-ai/sdk";
import type { Einstellungen, KiKarte } from "../types";
import { blobZuBase64 } from "./bild";

/**
 * KI-Anbindung (Spec Abschnitt 7).
 *
 * Abweichung vom Plan: Das Claude Agent SDK mit Abo-Login läuft nur in
 * Node.js, nicht im Browser. Da die App bewusst ohne eigenen Server
 * auskommt, nutzen wir den im Plan genannten Fallback: die normale
 * Claude-API (Pay-per-Use) mit einem API-Key, der ausschließlich lokal
 * auf dem Gerät gespeichert wird. Der Browser-Direktzugriff ist von
 * Anthropic offiziell unterstützt (dangerouslyAllowBrowser + CORS).
 */

const KARTEN_SCHEMA = {
  type: "object",
  properties: {
    titel: {
      type: "string",
      description: "Kurzer, prägnanter Titel des inhaltlichen Abschnitts",
    },
    kernaussage: {
      type: "string",
      description: "Die zentrale Aussage in 1-3 Sätzen, eigenständig verständlich",
    },
    stichpunkte: {
      type: "array",
      items: { type: "string" },
      description: "3-7 Stichpunkte mit den wichtigsten Details",
    },
    kategorie: {
      type: "string",
      description:
        "Thematische Kategorie. Wenn eine der vorhandenen Kategorien passt, exakt diese wiederverwenden.",
    },
    tags: {
      type: "array",
      items: { type: "string" },
      description: "0-4 kurze Schlagworte",
    },
    quelle_seiten: {
      type: "string",
      description:
        'Seitenzahlen, falls auf den Fotos erkennbar (z. B. "42-44"), sonst leerer String',
    },
    wichtigkeit: {
      type: "integer",
      enum: [1, 2, 3, 4, 5],
      description:
        "Einschätzung der Wichtigkeit für die Praxis: 5 = fundamental, 1 = Randnotiz",
    },
    foto_nummern: {
      type: "array",
      items: { type: "integer" },
      description:
        "Nummern der Fotos, die zu dieser Karte gehören (1 = erstes Foto). Beispielseiten zählen zum Abschnitt, den sie illustrieren; jedes Foto gehört zu genau einer Karte.",
    },
  },
  required: [
    "titel",
    "kernaussage",
    "stichpunkte",
    "kategorie",
    "tags",
    "quelle_seiten",
    "wichtigkeit",
    "foto_nummern",
  ],
  additionalProperties: false,
} as const;

const ANTWORT_SCHEMA = {
  type: "object",
  properties: {
    karten: {
      type: "array",
      minItems: 1,
      items: KARTEN_SCHEMA,
      description: "Eine Lernkarte pro erkanntem inhaltlichen Abschnitt",
    },
  },
  required: ["karten"],
  additionalProperties: false,
} as const;

export async function erstelleKartenMitKi(
  fotos: Blob[],
  kontext: { buchTitel: string; autor: string; kategorien: string[] },
  einstellungen: Einstellungen,
): Promise<KiKarte[]> {
  if (!einstellungen.apiKey) {
    throw new Error(
      "Kein API-Key hinterlegt. Bitte zuerst in den Einstellungen einen Anthropic-API-Key eintragen.",
    );
  }

  const client = new Anthropic({
    apiKey: einstellungen.apiKey,
    dangerouslyAllowBrowser: true,
  });

  const bildBloecke = await Promise.all(
    fotos.map(async (foto) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: "image/jpeg" as const,
        data: await blobZuBase64(foto),
      },
    })),
  );

  const kategorienHinweis = kontext.kategorien.length
    ? `Bisher verwendete Kategorien in diesem Buch: ${kontext.kategorien.join(", ")}. Verwende eine davon, wenn sie inhaltlich passt; sonst schlage eine neue, kurze Kategorie vor.`
    : "Es gibt noch keine Kategorien in diesem Buch. Schlage eine kurze, wiederverwendbare Kategorie vor.";

  const auftrag = `Die Fotos zeigen aufeinanderfolgende Seiten aus dem Buch "${kontext.buchTitel}"${kontext.autor ? ` von ${kontext.autor}` : ""}. Sie können EINEN oder MEHRERE eigenständige inhaltliche Abschnitte enthalten (z. B. mehrere Taktiken, Weisheiten oder Konzepte — oft jeweils gefolgt von einer Beispielseite).

Deine Aufgabe:
1. Erkenne selbstständig, wie viele eigenständige Abschnitte die Seiten enthalten und welches Thema jeder hat.
2. Erstelle für JEDEN Abschnitt genau EINE deutsche Lernkarte, die ihn so zusammenfasst, dass man ihn ohne das Buch wiederholen kann. Packe niemals zwei verschiedene Abschnitte in eine Karte.
3. Beispielseiten sind KEINE eigenen Abschnitte: Ordne jedes Beispiel dem Abschnitt zu, den es illustriert, und fasse es dort als einen kurzen Stichpunkt zusammen, der mit "Beispiel:" beginnt.

${kategorienHinweis}`;

  let antwort;
  try {
    antwort = await client.messages.create({
      model: einstellungen.modell,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: {
        format: { type: "json_schema", schema: ANTWORT_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: [...bildBloecke, { type: "text", text: auftrag }],
        },
      ],
    });
  } catch (fehler) {
    throw uebersetzeFehler(fehler);
  }

  if (antwort.stop_reason === "refusal") {
    throw new Error(
      "Die KI hat die Verarbeitung dieser Fotos abgelehnt. Bitte prüfe die Aufnahmen und versuche es erneut.",
    );
  }
  if (antwort.stop_reason === "max_tokens") {
    throw new Error(
      "Die Antwort der KI war unvollständig (Token-Limit). Bitte erneut versuchen.",
    );
  }

  const text = antwort.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("Die KI hat keine verwertbare Antwort geliefert.");

  const roh = JSON.parse(text) as { karten: KiKarte[] };
  if (!Array.isArray(roh.karten) || roh.karten.length === 0) {
    throw new Error("Die KI hat keine verwertbare Antwort geliefert.");
  }
  return roh.karten.map((k) => ({
    titel: k.titel.trim(),
    kernaussage: k.kernaussage.trim(),
    stichpunkte: k.stichpunkte.map((s) => s.trim()).filter(Boolean),
    kategorie: k.kategorie.trim(),
    tags: k.tags.map((t) => t.trim()).filter(Boolean),
    quelle_seiten: k.quelle_seiten.trim(),
    wichtigkeit: Math.min(5, Math.max(1, Math.round(k.wichtigkeit))),
    foto_nummern: (k.foto_nummern ?? [])
      .map((n) => Math.round(n))
      .filter((n) => n >= 1 && n <= fotos.length),
  }));
}

function uebersetzeFehler(fehler: unknown): Error {
  if (fehler instanceof Anthropic.AuthenticationError) {
    return new Error(
      "Der API-Key wurde abgelehnt. Bitte in den Einstellungen prüfen.",
    );
  }
  if (fehler instanceof Anthropic.RateLimitError) {
    return new Error(
      "Zu viele Anfragen in kurzer Zeit. Bitte kurz warten und erneut versuchen.",
    );
  }
  if (fehler instanceof Anthropic.NotFoundError) {
    return new Error(
      "Das gewählte Modell ist nicht verfügbar. Bitte Modell in den Einstellungen prüfen.",
    );
  }
  if (fehler instanceof Anthropic.APIConnectionError) {
    return new Error(
      "Keine Verbindung zur Claude-API. Für die Verarbeitung wird eine Internetverbindung benötigt — Fotos bleiben gespeichert und können später verarbeitet werden.",
    );
  }
  if (fehler instanceof Anthropic.APIError) {
    return new Error(`Claude-API-Fehler (${fehler.status}): ${fehler.message}`);
  }
  return fehler instanceof Error ? fehler : new Error(String(fehler));
}
