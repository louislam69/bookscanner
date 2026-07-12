import { useEffect, useRef, useState } from "react";
import type { Ansicht } from "../App";
import type { Buch } from "../types";
import { jetzt, neueId } from "../types";
import { ladeBuecher, ladeEinstellungen, loescheBuch, speichereBuch } from "../db";
import { importiereDatei } from "../lib/exportImport";
import { holeVerarbeitete } from "../lib/github";

export default function BuchListe({
  navigiere,
}: {
  navigiere: (a: Ansicht) => void;
}) {
  const [buecher, setBuecher] = useState<Buch[]>([]);
  const [zeigeFormular, setZeigeFormular] = useState(false);
  const [titel, setTitel] = useState("");
  const [autor, setAutor] = useState("");
  const [meldung, setMeldung] = useState("");
  const [cloudAktiv, setCloudAktiv] = useState(false);
  const [cloudLaeuft, setCloudLaeuft] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const aktualisiere = () => void ladeBuecher().then(setBuecher);
  useEffect(aktualisiere, []);

  async function cloudAbholen(still: boolean) {
    setCloudLaeuft(true);
    try {
      const einstellungen = await ladeEinstellungen();
      const e = await holeVerarbeitete(einstellungen);
      if (e.aktualisiert || e.importiert) {
        setMeldung(
          `☁️ ${e.aktualisiert + e.importiert} fertige Karte(n) aus der Cloud übernommen.`,
        );
        aktualisiere();
      } else if (!still) {
        setMeldung("☁️ Keine fertigen Karten in der Cloud gefunden.");
      }
    } catch (fehler) {
      if (!still) setMeldung((fehler as Error).message);
    } finally {
      setCloudLaeuft(false);
    }
  }

  // Beim App-Start automatisch nach fertigen Karten in der Cloud schauen
  useEffect(() => {
    void ladeEinstellungen().then((e) => {
      const aktiv = !!(e.githubToken && e.githubRepo);
      setCloudAktiv(aktiv);
      if (aktiv && navigator.onLine) void cloudAbholen(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function anlegen(e: React.FormEvent) {
    e.preventDefault();
    if (!titel.trim()) return;
    const buch: Buch = {
      id: neueId(),
      titel: titel.trim(),
      autor: autor.trim(),
      erstellt_am: jetzt(),
    };
    await speichereBuch(buch);
    setTitel("");
    setAutor("");
    setZeigeFormular(false);
    navigiere({ name: "buch", buchId: buch.id });
  }

  async function importieren(e: React.ChangeEvent<HTMLInputElement>) {
    const datei = e.target.files?.[0];
    e.target.value = "";
    if (!datei) return;
    try {
      const ergebnis = await importiereDatei(datei);
      const teile = [
        ergebnis.importiert > 0 && `${ergebnis.importiert} Karten importiert`,
        ergebnis.aktualisiert > 0 &&
          `${ergebnis.aktualisiert} Scans zu fertigen Karten verarbeitet`,
        ergebnis.uebersprungen > 0 &&
          `${ergebnis.uebersprungen} Dubletten übersprungen`,
      ].filter(Boolean);
      setMeldung(
        `„${ergebnis.buchTitel}": ${teile.length ? teile.join(", ") : "keine neuen Karten"}.`,
      );
      aktualisiere();
    } catch (fehler) {
      setMeldung((fehler as Error).message);
    }
  }

  return (
    <div className="seite">
      <header className="kopf">
        <h1>📚 Meine Bücher</h1>
        <button
          className="knopf-leise"
          onClick={() => navigiere({ name: "einstellungen" })}
        >
          ⚙️
        </button>
      </header>

      {meldung && (
        <p className="hinweis" onClick={() => setMeldung("")}>
          {meldung}
        </p>
      )}

      {buecher.length === 0 && !zeigeFormular && (
        <p className="leer">
          Noch keine Bücher. Lege dein erstes Buch an und fotografiere die
          Seiten, aus denen Lernkarten werden sollen.
        </p>
      )}

      <ul className="liste">
        {buecher.map((buch) => (
          <li key={buch.id} className="karte-eintrag">
            <button
              className="eintrag-haupt"
              onClick={() => navigiere({ name: "buch", buchId: buch.id })}
            >
              <strong>{buch.titel}</strong>
              {buch.autor && <span className="dezent">{buch.autor}</span>}
            </button>
            <button
              className="knopf-leise"
              title="Buch löschen"
              onClick={async () => {
                if (
                  confirm(
                    `„${buch.titel}" mit allen Karten und Fotos löschen?`,
                  )
                ) {
                  await loescheBuch(buch.id);
                  aktualisiere();
                }
              }}
            >
              🗑
            </button>
          </li>
        ))}
      </ul>

      {zeigeFormular ? (
        <form className="formular" onSubmit={anlegen}>
          <label>
            Titel
            <input
              value={titel}
              onChange={(e) => setTitel(e.target.value)}
              placeholder="z. B. Schafkopf für Gewinner"
              autoFocus
              required
            />
          </label>
          <label>
            Autor (optional)
            <input
              value={autor}
              onChange={(e) => setAutor(e.target.value)}
              placeholder="Autor"
            />
          </label>
          <div className="knopfzeile">
            <button type="submit" className="knopf">
              Buch anlegen
            </button>
            <button
              type="button"
              className="knopf-sekundaer"
              onClick={() => setZeigeFormular(false)}
            >
              Abbrechen
            </button>
          </div>
        </form>
      ) : (
        <div className="knopfzeile">
          <button className="knopf" onClick={() => setZeigeFormular(true)}>
            ＋ Neues Buch
          </button>
          {cloudAktiv && (
            <button
              className="knopf-sekundaer"
              disabled={cloudLaeuft}
              onClick={() => void cloudAbholen(false)}
            >
              {cloudLaeuft ? "☁️ Prüft…" : "☁️ Cloud abholen"}
            </button>
          )}
          <button
            className="knopf-sekundaer"
            onClick={() => importRef.current?.click()}
          >
            Datei importieren
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={importieren}
          />
        </div>
      )}
    </div>
  );
}
