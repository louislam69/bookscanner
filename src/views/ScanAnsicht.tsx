import { useEffect, useRef, useState } from "react";
import type { Ansicht } from "../App";
import type { Buch, Foto, Karte } from "../types";
import { jetzt, neueId } from "../types";
import { ladeBuch, speichereFoto, speichereKarte } from "../db";
import { blobZuObjektUrl, verkleinereFoto } from "../lib/bild";
import { verarbeiteKarte } from "../lib/verarbeitung";

/**
 * Foto-Erfassung (Spec Abschnitt 3, Schritte 2-4): Fotos aufnehmen oder
 * hochladen, als eine Einheit gruppieren, dann sofort verarbeiten (online)
 * oder als Roh-Scan speichern (offline).
 */
export default function ScanAnsicht({
  buchId,
  navigiere,
}: {
  buchId: string;
  navigiere: (a: Ansicht) => void;
}) {
  const [buch, setBuch] = useState<Buch | null>(null);
  const [fotos, setFotos] = useState<{ blob: Blob; url: string }[]>([]);
  const [seiten, setSeiten] = useState("");
  const [status, setStatus] = useState<"bereit" | "speichert" | "verarbeitet">(
    "bereit",
  );
  const [fehler, setFehler] = useState("");
  const kameraRef = useRef<HTMLInputElement>(null);
  const dateiRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void ladeBuch(buchId).then((b) => setBuch(b ?? null));
  }, [buchId]);

  useEffect(
    () => () => fotos.forEach((f) => URL.revokeObjectURL(f.url)),
    // Aufräumen nur beim Verlassen der Ansicht
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  async function hinzufuegen(e: React.ChangeEvent<HTMLInputElement>) {
    const dateien = [...(e.target.files ?? [])];
    e.target.value = "";
    setFehler("");
    try {
      const neue = await Promise.all(
        dateien.map(async (d) => {
          const blob = await verkleinereFoto(d);
          return { blob, url: blobZuObjektUrl(blob) };
        }),
      );
      setFotos((alt) => [...alt, ...neue]);
    } catch (f) {
      setFehler((f as Error).message);
    }
  }

  function entfernen(index: number) {
    setFotos((alt) => {
      URL.revokeObjectURL(alt[index].url);
      return alt.filter((_, i) => i !== index);
    });
  }

  async function speichern(mitKi: boolean) {
    if (fotos.length === 0 || !buch) return;
    setFehler("");
    setStatus("speichert");

    const karte: Karte = {
      id: neueId(),
      buch_id: buchId,
      titel: "",
      kernaussage: "",
      stichpunkte: [],
      quelle_seiten: seiten.trim(),
      kategorie: "",
      tags: [],
      wichtigkeit: 3,
      lernstatus: "neu",
      naechste_wiederholung_am: null,
      wiederholungs_intervall: 0,
      foto_ids: [],
      verarbeitet: false,
      erstellt_am: jetzt(),
      zuletzt_bearbeitet_am: jetzt(),
    };

    for (let i = 0; i < fotos.length; i++) {
      const foto: Foto = {
        id: neueId(),
        karte_id: karte.id,
        reihenfolge: i,
        blob: fotos[i].blob,
      };
      karte.foto_ids.push(foto.id);
      await speichereFoto(foto);
    }
    await speichereKarte(karte);

    if (mitKi) {
      setStatus("verarbeitet");
      try {
        await verarbeiteKarte(karte, buch);
      } catch (f) {
        // Fotos sind gespeichert — Verarbeitung kann später nachgeholt werden
        setFehler(
          `${(f as Error).message} — Der Scan wurde gespeichert und kann später verarbeitet werden.`,
        );
        setStatus("bereit");
        setTimeout(() => navigiere({ name: "buch", buchId }), 2500);
        return;
      }
    }
    navigiere({ name: "buch", buchId });
  }

  return (
    <div className="seite">
      <header className="kopf">
        <button
          className="knopf-leise"
          onClick={() => navigiere({ name: "buch", buchId })}
        >
          ←
        </button>
        <h1>Seiten scannen</h1>
      </header>

      <p className="dezent">
        Fotografiere alle Seiten, die zu <strong>einem</strong> Abschnitt
        gehören (z. B. die 3 Seiten einer Taktik). Sie werden zusammen zu einer
        Lernkarte verarbeitet.
      </p>

      <div className="knopfzeile">
        <button className="knopf" onClick={() => kameraRef.current?.click()}>
          📷 Foto aufnehmen
        </button>
        <button
          className="knopf-sekundaer"
          onClick={() => dateiRef.current?.click()}
        >
          🖼 Aus Galerie/Datei
        </button>
        <input
          ref={kameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={hinzufuegen}
        />
        <input
          ref={dateiRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={hinzufuegen}
        />
      </div>

      {fotos.length > 0 && (
        <>
          <div className="foto-raster">
            {fotos.map((foto, i) => (
              <figure key={foto.url} className="foto-kachel">
                <img src={foto.url} alt={`Seite ${i + 1}`} />
                <figcaption>
                  {i + 1}
                  <button
                    className="knopf-leise"
                    onClick={() => entfernen(i)}
                    title="Foto entfernen"
                  >
                    ✕
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>

          <label className="formular">
            Seiten im Buch (optional)
            <input
              value={seiten}
              onChange={(e) => setSeiten(e.target.value)}
              placeholder="z. B. 42-44"
              inputMode="numeric"
            />
          </label>

          <div className="knopfzeile">
            <button
              className="knopf"
              disabled={status !== "bereit"}
              onClick={() => void speichern(true)}
            >
              {status === "verarbeitet"
                ? "🤖 KI liest die Seiten…"
                : status === "speichert"
                  ? "Speichert…"
                  : "🤖 Karte erstellen (KI)"}
            </button>
            <button
              className="knopf-sekundaer"
              disabled={status !== "bereit"}
              onClick={() => void speichern(false)}
            >
              Nur speichern (offline)
            </button>
          </div>
        </>
      )}

      {fehler && <p className="fehler">{fehler}</p>}
    </div>
  );
}
