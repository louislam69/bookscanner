import { useEffect, useMemo, useState } from "react";
import type { Ansicht } from "../App";
import type { Buch, Karte, Lernstatus } from "../types";
import { ladeBuch, ladeEinstellungen, ladeKarten } from "../db";
import { exportiereBuch, exportiereScans } from "../lib/exportImport";
import { ladeScansHoch } from "../lib/github";
import { verarbeiteKarte } from "../lib/verarbeitung";
import { istFaellig } from "../lib/srs";

type Sortierung = "wichtigkeit" | "kategorie" | "lernstatus" | "erstellt";

const STATUS_SYMBOL: Record<Lernstatus, string> = {
  neu: "🆕",
  lernend: "📖",
  gefestigt: "✅",
};

export default function BuchAnsicht({
  buchId,
  navigiere,
}: {
  buchId: string;
  navigiere: (a: Ansicht) => void;
}) {
  const [buch, setBuch] = useState<Buch | null>(null);
  const [karten, setKarten] = useState<Karte[]>([]);
  const [sortierung, setSortierung] = useState<Sortierung>("wichtigkeit");
  const [kategorieFilter, setKategorieFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | Lernstatus>("");
  const [laufend, setLaufend] = useState<string | null>(null);
  const [fehler, setFehler] = useState("");
  const [meldung, setMeldung] = useState("");
  const [cloudAktiv, setCloudAktiv] = useState(false);
  const [laedtHoch, setLaedtHoch] = useState(false);

  const aktualisiere = () => {
    void ladeBuch(buchId).then((b) => setBuch(b ?? null));
    void ladeKarten(buchId).then(setKarten);
  };
  useEffect(aktualisiere, [buchId]);
  useEffect(() => {
    void ladeEinstellungen().then((e) =>
      setCloudAktiv(!!(e.githubToken && e.githubRepo)),
    );
  }, []);

  const kategorien = useMemo(
    () => [...new Set(karten.map((k) => k.kategorie).filter(Boolean))].sort(),
    [karten],
  );

  const sichtbar = useMemo(() => {
    let liste = karten.filter(
      (k) =>
        (!kategorieFilter || k.kategorie === kategorieFilter) &&
        (!statusFilter || k.lernstatus === statusFilter),
    );
    const nachStatus: Record<Lernstatus, number> = {
      neu: 0,
      lernend: 1,
      gefestigt: 2,
    };
    liste = [...liste].sort((a, b) => {
      switch (sortierung) {
        case "wichtigkeit":
          return b.wichtigkeit - a.wichtigkeit;
        case "kategorie":
          return a.kategorie.localeCompare(b.kategorie, "de");
        case "lernstatus":
          return nachStatus[a.lernstatus] - nachStatus[b.lernstatus];
        case "erstellt":
          return a.erstellt_am.localeCompare(b.erstellt_am);
      }
    });
    // Unverarbeitete Scans immer oben anzeigen
    return [...liste.filter((k) => !k.verarbeitet), ...liste.filter((k) => k.verarbeitet)];
  }, [karten, sortierung, kategorieFilter, statusFilter]);

  const unverarbeitet = karten.filter((k) => !k.verarbeitet);
  const faellig = karten.filter(istFaellig).length;

  async function alleVerarbeiten() {
    if (!buch) return;
    setFehler("");
    for (const karte of unverarbeitet) {
      setLaufend(karte.id);
      try {
        await verarbeiteKarte(karte, buch);
        aktualisiere();
      } catch (f) {
        setFehler((f as Error).message);
        break;
      }
    }
    setLaufend(null);
    aktualisiere();
  }

  if (!buch) return <div className="seite">Lade…</div>;

  return (
    <div className="seite">
      <header className="kopf">
        <button className="knopf-leise" onClick={() => navigiere({ name: "liste" })}>
          ←
        </button>
        <h1>
          {buch.titel}
          {buch.autor && <span className="dezent"> · {buch.autor}</span>}
        </h1>
      </header>

      <div className="knopfzeile">
        <button
          className="knopf"
          onClick={() => navigiere({ name: "scan", buchId })}
        >
          📷 Seiten scannen
        </button>
        <button
          className="knopf-sekundaer"
          disabled={karten.filter((k) => k.verarbeitet).length === 0}
          onClick={() => navigiere({ name: "lernen", buchId })}
        >
          🎓 Lernen{faellig > 0 ? ` (${faellig} fällig)` : ""}
        </button>
        <button
          className="knopf-sekundaer"
          disabled={karten.length === 0}
          onClick={() => void exportiereBuch(buch)}
        >
          ⬆️ Exportieren
        </button>
      </div>

      {unverarbeitet.length > 0 && (
        <div className="hinweis-block">
          <p>
            {unverarbeitet.length} Scan{unverarbeitet.length > 1 ? "s" : ""}{" "}
            wartet auf Verarbeitung — über die Cloud (PC mit Pro-Abo holt sie
            sich automatisch), hier per API-Key oder als Datei-Export.
          </p>
          <div className="knopfzeile">
            {cloudAktiv && (
              <button
                className="knopf"
                disabled={laufend !== null || laedtHoch}
                onClick={async () => {
                  if (!buch) return;
                  setFehler("");
                  setMeldung("");
                  setLaedtHoch(true);
                  try {
                    const einstellungen = await ladeEinstellungen();
                    const n = await ladeScansHoch(buch, einstellungen);
                    if (n > 0) {
                      setMeldung(
                        `${n} Scan(s) hochgeladen. Am PC verarbeitet sie „node sync.mjs" — die fertigen Karten erscheinen hier beim nächsten App-Start automatisch.`,
                      );
                    }
                    aktualisiere();
                  } catch (f) {
                    setFehler((f as Error).message);
                  } finally {
                    setLaedtHoch(false);
                  }
                }}
              >
                {laedtHoch ? "☁️ Lädt hoch…" : "☁️ In Cloud hochladen"}
              </button>
            )}
            <button
              className={cloudAktiv ? "knopf-sekundaer" : "knopf"}
              disabled={laufend !== null}
              onClick={() => void alleVerarbeiten()}
            >
              {laufend ? "Verarbeite…" : "🤖 Hier verarbeiten"}
            </button>
            <button
              className="knopf-sekundaer"
              disabled={laufend !== null}
              onClick={() => void exportiereScans(buch)}
            >
              💾 Als Datei exportieren
            </button>
          </div>
        </div>
      )}
      {meldung && (
        <p className="hinweis" onClick={() => setMeldung("")}>
          {meldung}
        </p>
      )}
      {fehler && (
        <p className="fehler" onClick={() => setFehler("")}>
          {fehler}
        </p>
      )}

      {karten.length > 0 && (
        <div className="filterzeile">
          <select
            value={sortierung}
            onChange={(e) => setSortierung(e.target.value as Sortierung)}
          >
            <option value="wichtigkeit">Nach Wichtigkeit</option>
            <option value="kategorie">Nach Kategorie</option>
            <option value="lernstatus">Nach Lernstatus</option>
            <option value="erstellt">Nach Reihenfolge</option>
          </select>
          <select
            value={kategorieFilter}
            onChange={(e) => setKategorieFilter(e.target.value)}
          >
            <option value="">Alle Kategorien</option>
            {kategorien.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "" | Lernstatus)}
          >
            <option value="">Jeder Status</option>
            <option value="neu">Neu</option>
            <option value="lernend">Lernend</option>
            <option value="gefestigt">Gefestigt</option>
          </select>
        </div>
      )}

      {karten.length === 0 && (
        <p className="leer">
          Noch keine Karten. Fotografiere die zusammengehörigen Seiten eines
          Abschnitts — die KI macht daraus eine Lernkarte.
        </p>
      )}

      <ul className="liste">
        {sichtbar.map((karte) => (
          <li key={karte.id} className="karte-eintrag">
            <button
              className="eintrag-haupt"
              onClick={() =>
                navigiere({ name: "karte", karteId: karte.id, buchId })
              }
            >
              <strong>
                {karte.verarbeitet ? (
                  karte.titel
                ) : (
                  <em>
                    {laufend === karte.id
                      ? "🤖 Wird verarbeitet…"
                      : "📷 Unverarbeiteter Scan"}
                  </em>
                )}
              </strong>
              <span className="dezent">
                {karte.verarbeitet && (
                  <>
                    {STATUS_SYMBOL[karte.lernstatus]}{" "}
                    {"★".repeat(karte.wichtigkeit)}
                    {karte.kategorie && ` · ${karte.kategorie}`}
                    {karte.quelle_seiten && ` · S. ${karte.quelle_seiten}`}
                  </>
                )}
                {!karte.verarbeitet && `${karte.foto_ids.length} Foto(s)`}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
