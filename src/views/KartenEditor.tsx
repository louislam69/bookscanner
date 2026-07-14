import { useEffect, useState } from "react";
import type { Ansicht } from "../App";
import type { Buch, Karte, Lernstatus } from "../types";
import { jetzt } from "../types";
import { ladeBuch, ladeFotos, ladeKarte, loescheKarte, speichereKarte } from "../db";
import { blobZuObjektUrl } from "../lib/bild";
import { verarbeiteKarte } from "../lib/verarbeitung";

export default function KartenEditor({
  karteId,
  buchId,
  navigiere,
}: {
  karteId: string;
  buchId: string;
  navigiere: (a: Ansicht) => void;
}) {
  const [karte, setKarte] = useState<Karte | null>(null);
  const [buch, setBuch] = useState<Buch | null>(null);
  const [fotoUrls, setFotoUrls] = useState<string[]>([]);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState("");
  const [gespeichert, setGespeichert] = useState(false);

  useEffect(() => {
    void ladeKarte(karteId).then((k) => setKarte(k ?? null));
    void ladeBuch(buchId).then((b) => setBuch(b ?? null));
    let urls: string[] = [];
    void ladeFotos(karteId).then((fotos) => {
      urls = fotos.map((f) => blobZuObjektUrl(f.blob));
      setFotoUrls(urls);
    });
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [karteId, buchId]);

  if (!karte) return <div className="seite">Lade…</div>;

  function aendere<K extends keyof Karte>(feld: K, wert: Karte[K]) {
    setKarte((k) => (k ? { ...k, [feld]: wert } : k));
    setGespeichert(false);
  }

  async function speichern() {
    if (!karte) return;
    await speichereKarte({ ...karte, zuletzt_bearbeitet_am: jetzt() });
    setGespeichert(true);
  }

  async function verarbeiten() {
    if (!karte || !buch) return;
    setFehler("");
    setLaeuft(true);
    try {
      const neue = await verarbeiteKarte(karte, buch);
      if (neue.length > 1) {
        // Die KI hat mehrere Abschnitte erkannt — zurück zur Buchansicht,
        // dort sind alle entstandenen Karten zu sehen.
        navigiere({ name: "buch", buchId });
        return;
      }
      setKarte(neue[0]);
    } catch (f) {
      setFehler((f as Error).message);
    } finally {
      setLaeuft(false);
    }
  }

  async function alsScanZuruecksetzen() {
    if (!karte) return;
    if (
      !confirm(
        "Karte wieder zum unverarbeiteten Scan machen? Die Fotos bleiben erhalten — der Scan kann dann neu verarbeitet werden (Cloud/PC oder hier), z. B. damit die KI ihn in mehrere Karten aufteilt.",
      )
    ) {
      return;
    }
    const zurueck = {
      ...karte,
      verarbeitet: false,
      hochgeladen: false,
      zuletzt_bearbeitet_am: jetzt(),
    };
    await speichereKarte(zurueck);
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
        <h1>{karte.verarbeitet ? "Karte bearbeiten" : "Roh-Scan"}</h1>
      </header>

      {!karte.verarbeitet && (
        <div className="hinweis-block">
          <p>
            Dieser Scan wurde noch nicht verarbeitet. Die KI liest die Fotos
            und füllt die Karte automatisch aus (Internet nötig).
          </p>
          <button
            className="knopf"
            disabled={laeuft}
            onClick={() => void verarbeiten()}
          >
            {laeuft ? "🤖 KI liest die Seiten…" : "🤖 Jetzt verarbeiten"}
          </button>
        </div>
      )}
      {fehler && <p className="fehler">{fehler}</p>}

      <div className="formular">
        <label>
          Titel
          <input
            value={karte.titel}
            onChange={(e) => aendere("titel", e.target.value)}
          />
        </label>
        <label>
          Kernaussage
          <textarea
            rows={3}
            value={karte.kernaussage}
            onChange={(e) => aendere("kernaussage", e.target.value)}
          />
        </label>
        <label>
          Stichpunkte (einer pro Zeile)
          <textarea
            rows={6}
            value={karte.stichpunkte.join("\n")}
            onChange={(e) =>
              aendere(
                "stichpunkte",
                e.target.value.split("\n").filter((z) => z.trim() !== ""),
              )
            }
          />
        </label>
        <div className="feld-zeile">
          <label>
            Kategorie
            <input
              value={karte.kategorie}
              onChange={(e) => aendere("kategorie", e.target.value)}
            />
          </label>
          <label>
            Seiten
            <input
              value={karte.quelle_seiten}
              onChange={(e) => aendere("quelle_seiten", e.target.value)}
            />
          </label>
        </div>
        <div className="feld-zeile">
          <label>
            Wichtigkeit
            <select
              value={karte.wichtigkeit}
              onChange={(e) => aendere("wichtigkeit", Number(e.target.value))}
            >
              {[5, 4, 3, 2, 1].map((w) => (
                <option key={w} value={w}>
                  {"★".repeat(w)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Lernstatus
            <select
              value={karte.lernstatus}
              onChange={(e) =>
                aendere("lernstatus", e.target.value as Lernstatus)
              }
            >
              <option value="neu">Neu</option>
              <option value="lernend">Lernend</option>
              <option value="gefestigt">Gefestigt</option>
            </select>
          </label>
        </div>
        <label>
          Tags (mit Komma getrennt)
          <input
            value={karte.tags.join(", ")}
            onChange={(e) =>
              aendere(
                "tags",
                e.target.value
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
              )
            }
          />
        </label>
      </div>

      <div className="knopfzeile">
        <button className="knopf" onClick={() => void speichern()}>
          {gespeichert ? "✓ Gespeichert" : "Speichern"}
        </button>
        {karte.verarbeitet && fotoUrls.length > 0 && (
          <>
            <button
              className="knopf-sekundaer"
              disabled={laeuft}
              onClick={() => void verarbeiten()}
              title="Karte aus den Fotos neu erstellen (hier, per API-Key)"
            >
              {laeuft ? "🤖 …" : "🤖 Neu erstellen"}
            </button>
            <button
              className="knopf-sekundaer"
              disabled={laeuft}
              onClick={() => void alsScanZuruecksetzen()}
              title="Karte wird wieder zum unverarbeiteten Scan — z. B. um sie über die Cloud (PC/Pro-Abo) neu und ggf. in mehrere Karten aufteilen zu lassen"
            >
              ↩️ Als Scan zurücksetzen
            </button>
          </>
        )}
        <button
          className="knopf-gefahr"
          onClick={async () => {
            if (confirm("Karte samt Fotos löschen?")) {
              await loescheKarte(karte.id);
              navigiere({ name: "buch", buchId });
            }
          }}
        >
          Löschen
        </button>
      </div>

      {fotoUrls.length > 0 && (
        <>
          <h2 className="abschnitt">Original-Fotos</h2>
          <div className="foto-raster">
            {fotoUrls.map((url, i) => (
              <figure key={url} className="foto-kachel">
                <img src={url} alt={`Seite ${i + 1}`} />
              </figure>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
