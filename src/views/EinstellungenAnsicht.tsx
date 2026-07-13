import { useEffect, useState } from "react";
import type { Ansicht } from "../App";
import { ladeEinstellungen, speichereEinstellungen, STANDARD_MODELL } from "../db";
import { pruefeCloudVerbindung } from "../lib/github";

const MODELLE = [
  { id: "claude-opus-4-8", name: "Claude Opus 4.8 (beste Qualität)" },
  { id: "claude-sonnet-5", name: "Claude Sonnet 5 (günstiger)" },
  { id: "claude-haiku-4-5", name: "Claude Haiku 4.5 (am günstigsten)" },
];

export default function EinstellungenAnsicht({
  navigiere,
}: {
  navigiere: (a: Ansicht) => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [modell, setModell] = useState(STANDARD_MODELL);
  const [githubToken, setGithubToken] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [gespeichert, setGespeichert] = useState(false);
  const [testLaeuft, setTestLaeuft] = useState(false);
  const [testErgebnis, setTestErgebnis] = useState("");

  useEffect(() => {
    void ladeEinstellungen().then((e) => {
      setApiKey(e.apiKey);
      setModell(e.modell);
      setGithubToken(e.githubToken);
      setGithubRepo(e.githubRepo);
    });
  }, []);

  async function speichern() {
    await speichereEinstellungen({
      apiKey: apiKey.trim(),
      modell,
      githubToken: githubToken.trim(),
      githubRepo: githubRepo.trim(),
    });
    setGespeichert(true);
  }

  return (
    <div className="seite">
      <header className="kopf">
        <button className="knopf-leise" onClick={() => navigiere({ name: "liste" })}>
          ←
        </button>
        <h1>Einstellungen</h1>
      </header>

      <div className="formular">
        <label>
          Anthropic-API-Key
          <input
            type="password"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setGespeichert(false);
            }}
            placeholder="sk-ant-…"
            autoComplete="off"
          />
        </label>
        <p className="dezent">
          Der Key wird ausschließlich lokal auf diesem Gerät gespeichert und
          ist in Export-Dateien niemals enthalten. Einen Key bekommst du unter{" "}
          <a href="https://platform.claude.com" target="_blank" rel="noreferrer">
            platform.claude.com
          </a>
          . Die Kosten für ein komplettes Buch liegen typischerweise im
          Cent-Bereich.
        </p>

        <label>
          KI-Modell
          <select value={modell} onChange={(e) => {
            setModell(e.target.value);
            setGespeichert(false);
          }}>
            {MODELLE.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>

        <h2 className="abschnitt">☁️ Cloud-Austausch mit dem PC (Pro-Abo)</h2>
        <p className="dezent">
          Damit landen Scans automatisch in einem <strong>privaten</strong>{" "}
          GitHub-Repo, der PC verarbeitet sie über dein Claude-Pro-Abo, und
          die fertigen Karten erscheinen hier von selbst. Einrichtung: (1) auf
          github.com ein neues <strong>privates</strong> Repo anlegen (z. B.
          „lernkarten-daten"), (2) unter{" "}
          <em>Settings → Developer settings → Fine-grained tokens</em> ein
          Token nur für dieses Repo mit der Berechtigung{" "}
          <em>Contents: Read and write</em> erstellen, (3) beides hier und in
          der Datei <code>verarbeiter/konfig.json</code> am PC eintragen.
        </p>
        <label>
          Privates Austausch-Repo (besitzer/name)
          <input
            value={githubRepo}
            onChange={(e) => {
              setGithubRepo(e.target.value);
              setGespeichert(false);
            }}
            placeholder="louislam69/lernkarten-daten"
            autoCapitalize="none"
            autoCorrect="off"
          />
        </label>
        <label>
          GitHub-Token
          <input
            type="password"
            value={githubToken}
            onChange={(e) => {
              setGithubToken(e.target.value);
              setGespeichert(false);
            }}
            placeholder="github_pat_…"
            autoComplete="off"
          />
        </label>
      </div>

      <div className="knopfzeile">
        <button className="knopf" onClick={() => void speichern()}>
          {gespeichert ? "✓ Gespeichert" : "Speichern"}
        </button>
        <button
          className="knopf-sekundaer"
          disabled={testLaeuft}
          onClick={async () => {
            setTestErgebnis("");
            setTestLaeuft(true);
            try {
              // erst speichern, dann mit dem gespeicherten Stand testen
              await speichern();
              const einstellungen = await ladeEinstellungen();
              setTestErgebnis(await pruefeCloudVerbindung(einstellungen));
            } catch (fehler) {
              setTestErgebnis(`✗ ${(fehler as Error).message}`);
            } finally {
              setTestLaeuft(false);
            }
          }}
        >
          {testLaeuft ? "☁️ Teste…" : "☁️ Verbindung testen"}
        </button>
      </div>
      {testErgebnis && (
        <p className={testErgebnis.startsWith("✓") ? "hinweis" : "fehler"}>
          {testErgebnis}
        </p>
      )}

      <h2 className="abschnitt">So funktioniert die App</h2>
      <ol className="dezent anleitung">
        <li>Buch anlegen</li>
        <li>
          Zusammengehörige Seiten fotografieren (geht offline — Fotos werden
          lokal gespeichert)
        </li>
        <li>Verarbeiten: Claude liest die Fotos und erstellt die Lernkarte</li>
        <li>Karten nachbearbeiten, sortieren und filtern</li>
        <li>Im Lernmodus mit Spaced Repetition üben</li>
        <li>Buch als Datei exportieren und mit Freunden teilen</li>
      </ol>
      <p className="dezent">
        Tipp fürs iPhone: In Safari über „Teilen → Zum Home-Bildschirm" wird
        die App wie eine native App installiert.
      </p>
    </div>
  );
}
