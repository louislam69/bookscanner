import { useEffect, useRef, useState } from "react";
import { entzerreSeite, findeSeite, ladeOpenCv, type Ecken } from "../lib/scanner";

/**
 * Dokumentenscanner: Live-Kamerabild mit automatischer Seitenerkennung.
 * Die erkannte Seite wird grün umrandet; beim Auslösen wird sie automatisch
 * zugeschnitten und perspektivisch entzerrt (Fallback: ganzes Bild).
 */
export default function ScannerKamera({
  beiFoto,
  beiSchliessen,
}: {
  beiFoto: (blob: Blob) => void;
  beiSchliessen: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const eckenRef = useRef<Ecken | null>(null);
  const [status, setStatus] = useState<"laedt" | "bereit" | "fehler">("laedt");
  const [fehlerText, setFehlerText] = useState("");
  const [blitz, setBlitz] = useState(false);
  const [anzahl, setAnzahl] = useState(0);
  const [seiteErkannt, setSeiteErkannt] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let intervall: ReturnType<typeof setInterval> | null = null;
    let beendet = false;

    (async () => {
      try {
        const [cv, medien] = await Promise.all([
          ladeOpenCv(),
          navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: "environment",
              width: { ideal: 2560 },
              height: { ideal: 1440 },
            },
            audio: false,
          }),
        ]);
        if (beendet) {
          medien.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = medien;
        const video = videoRef.current!;
        video.srcObject = medien;
        await video.play();
        setStatus("bereit");

        // Erkennung auf verkleinertem Bild (~5x pro Sekunde)
        const suchCanvas = document.createElement("canvas");
        intervall = setInterval(() => {
          if (!video.videoWidth) return;
          const faktor = 400 / video.videoWidth;
          suchCanvas.width = 400;
          suchCanvas.height = Math.round(video.videoHeight * faktor);
          suchCanvas
            .getContext("2d")!
            .drawImage(video, 0, 0, suchCanvas.width, suchCanvas.height);

          let ecken: Ecken | null = null;
          try {
            ecken = findeSeite(cv, suchCanvas);
          } catch {
            /* einzelne fehlgeschlagene Frames ignorieren */
          }
          eckenRef.current = ecken
            ? (ecken.map(([x, y]) => [x / faktor, y / faktor]) as Ecken)
            : null;
          setSeiteErkannt(!!ecken);

          // Umriss über das Video zeichnen
          const overlay = overlayRef.current;
          if (!overlay) return;
          overlay.width = video.videoWidth;
          overlay.height = video.videoHeight;
          const ctx = overlay.getContext("2d")!;
          ctx.clearRect(0, 0, overlay.width, overlay.height);
          if (eckenRef.current) {
            ctx.strokeStyle = "rgba(80, 220, 130, 0.95)";
            ctx.fillStyle = "rgba(80, 220, 130, 0.18)";
            ctx.lineWidth = Math.max(3, overlay.width / 250);
            ctx.beginPath();
            eckenRef.current.forEach(([x, y], i) =>
              i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y),
            );
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }
        }, 200);
      } catch (fehler) {
        setStatus("fehler");
        setFehlerText(
          (fehler as DOMException).name === "NotAllowedError"
            ? "Kamera-Zugriff wurde abgelehnt. Bitte in den Safari-Einstellungen erlauben."
            : `Scanner konnte nicht starten: ${(fehler as Error).message}`,
        );
      }
    })();

    return () => {
      beendet = true;
      if (intervall) clearInterval(intervall);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function ausloesen() {
    const video = videoRef.current;
    if (!video?.videoWidth) return;

    // Volle Auflösung aufnehmen
    const voll = document.createElement("canvas");
    voll.width = video.videoWidth;
    voll.height = video.videoHeight;
    voll.getContext("2d")!.drawImage(video, 0, 0);

    const ausgabe = document.createElement("canvas");
    const ecken = eckenRef.current;
    if (ecken) {
      const cv = await ladeOpenCv();
      try {
        entzerreSeite(cv, voll, ecken, ausgabe);
      } catch {
        ausgabe.width = voll.width;
        ausgabe.height = voll.height;
        ausgabe.getContext("2d")!.drawImage(voll, 0, 0);
      }
    } else {
      // Keine Seite erkannt → ganzes Bild übernehmen
      ausgabe.width = voll.width;
      ausgabe.height = voll.height;
      ausgabe.getContext("2d")!.drawImage(voll, 0, 0);
    }

    const blob = await new Promise<Blob | null>((resolve) =>
      ausgabe.toBlob(resolve, "image/jpeg", 0.9),
    );
    if (blob) {
      beiFoto(blob);
      setAnzahl((n) => n + 1);
      setBlitz(true);
      setTimeout(() => setBlitz(false), 180);
    }
  }

  return (
    <div className="scanner">
      <video ref={videoRef} playsInline muted />
      <canvas ref={overlayRef} className="scanner-overlay" />
      {blitz && <div className="scanner-blitz" />}

      <div className="scanner-kopf">
        <button className="scanner-knopf klein" onClick={beiSchliessen}>
          ✕ {anzahl > 0 ? `Fertig (${anzahl})` : "Schließen"}
        </button>
        <span className="scanner-status">
          {status === "laedt" && "Scanner lädt…"}
          {status === "bereit" &&
            (seiteErkannt ? "✓ Seite erkannt" : "Seite ins Bild halten…")}
        </span>
      </div>

      {status === "fehler" ? (
        <div className="scanner-fehler">
          <p>{fehlerText}</p>
          <button className="knopf" onClick={beiSchliessen}>
            Zurück
          </button>
        </div>
      ) : (
        <div className="scanner-fuss">
          <button
            className="scanner-ausloeser"
            disabled={status !== "bereit"}
            onClick={() => void ausloesen()}
            title="Foto aufnehmen"
          />
        </div>
      )}
    </div>
  );
}
