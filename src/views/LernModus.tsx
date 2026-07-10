import { useEffect, useState } from "react";
import type { Ansicht } from "../App";
import type { Karte } from "../types";
import { ladeKarten, speichereKarte } from "../db";
import { bewerteKarte, istFaellig, type Bewertung } from "../lib/srs";

/**
 * Lernmodus (Spec Abschnitt 8): fällige Karten wie Karteikarten durchgehen,
 * Selbsteinschätzung steuert das Wiederholungsintervall.
 */
export default function LernModus({
  buchId,
  navigiere,
}: {
  buchId: string;
  navigiere: (a: Ansicht) => void;
}) {
  const [warteschlange, setWarteschlange] = useState<Karte[] | null>(null);
  const [aufgedeckt, setAufgedeckt] = useState(false);
  const [erledigt, setErledigt] = useState(0);

  useEffect(() => {
    void ladeKarten(buchId).then((karten) => {
      const faellige = karten
        .filter(istFaellig)
        .sort((a, b) => b.wichtigkeit - a.wichtigkeit);
      setWarteschlange(faellige);
    });
  }, [buchId]);

  if (warteschlange === null) return <div className="seite">Lade…</div>;

  const karte = warteschlange[0];

  async function bewerten(bewertung: Bewertung) {
    if (!karte) return;
    const aktualisiert = bewerteKarte(karte, bewertung);
    await speichereKarte(aktualisiert);
    setAufgedeckt(false);
    setWarteschlange((ws) => {
      if (!ws) return ws;
      const rest = ws.slice(1);
      // "wusste ich nicht" → kommt in derselben Sitzung nochmal dran
      return bewertung === 0 ? [...rest, aktualisiert] : rest;
    });
    if (bewertung !== 0) setErledigt((n) => n + 1);
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
        <h1>Lernmodus</h1>
        <span className="dezent">
          {erledigt} ✓ · {warteschlange.length} offen
        </span>
      </header>

      {!karte ? (
        <div className="lern-fertig">
          <p>🎉 Alle fälligen Karten wiederholt!</p>
          <button className="knopf" onClick={() => navigiere({ name: "buch", buchId })}>
            Zurück zum Buch
          </button>
        </div>
      ) : (
        <div className="lernkarte">
          <div className="lernkarte-kopf">
            <span className="dezent">
              {karte.kategorie}
              {karte.quelle_seiten && ` · S. ${karte.quelle_seiten}`}
              {" · "}
              {"★".repeat(karte.wichtigkeit)}
            </span>
          </div>
          <h2>{karte.titel}</h2>

          {aufgedeckt ? (
            <>
              <p className="kernaussage">{karte.kernaussage}</p>
              <ul>
                {karte.stichpunkte.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
              <div className="knopfzeile bewertung">
                <button className="knopf-gefahr" onClick={() => void bewerten(0)}>
                  ✗ Wusste ich nicht
                </button>
                <button className="knopf-sekundaer" onClick={() => void bewerten(1)}>
                  ~ Musste überlegen
                </button>
                <button className="knopf" onClick={() => void bewerten(2)}>
                  ✓ Wusste ich sofort
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="dezent">
                Erinnere dich an den Inhalt, dann aufdecken.
              </p>
              <button className="knopf breit" onClick={() => setAufgedeckt(true)}>
                Aufdecken
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
