/**
 * Seitenerkennung wie bei einer Dokumentenscanner-App: findet die Buchseite
 * im Kamerabild und schneidet sie beim Auslösen perspektivisch entzerrt aus.
 * OpenCV.js (~13 MB) wird erst beim Öffnen des Scanners nachgeladen und vom
 * Service Worker gecacht.
 */

// OpenCV.js ist untypisiert — wir nutzen ein schlankes eigenes Interface.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CV = any;

export type Ecken = [number, number][]; // 4 Punkte: [x, y]

// Als eigenständige Datei einbinden (kein Bundler-Import: das UMD/WASM-Modul
// verträgt sich nicht mit der ESM-Interop des Bundlers)
import opencvUrl from "@techstark/opencv-js/dist/opencv.js?url";

let cvPromise: Promise<CV> | null = null;

export function ladeOpenCv(): Promise<CV> {
  cvPromise ??= (async () => {
    const fenster = window as unknown as { cv?: CV };
    if (!fenster.cv) {
      await new Promise<void>((resolve, reject) => {
        const skript = document.createElement("script");
        skript.src = opencvUrl;
        skript.onload = () => resolve();
        skript.onerror = () =>
          reject(new Error("OpenCV konnte nicht geladen werden (offline?)"));
        document.head.appendChild(skript);
      });
    }
    // Das UMD-Modul stellt window.cv bereit — anfangs als Promise,
    // die sich nach der WASM-Initialisierung zum echten Modul auflöst.
    let cv = fenster.cv as CV;
    if (cv && typeof cv.then === "function") {
      cv = await cv;
    }
    if (!cv?.Mat) {
      await new Promise<void>((resolve, reject) => {
        const start = Date.now();
        const timer = setInterval(() => {
          const aktuell = fenster.cv as CV;
          if (aktuell?.Mat) {
            cv = aktuell;
            clearInterval(timer);
            resolve();
          } else if (Date.now() - start > 20000) {
            clearInterval(timer);
            reject(new Error("OpenCV konnte nicht initialisiert werden"));
          }
        }, 100);
      });
    }
    return cv;
  })();
  return cvPromise;
}

/**
 * Sucht die größte viereckige Kontur (die Buchseite) im Canvas.
 * Liefert die 4 Eckpunkte in Canvas-Koordinaten oder null.
 */
export function findeSeite(cv: CV, canvas: HTMLCanvasElement): Ecken | null {
  const src = cv.imread(canvas);
  const grau = new cv.Mat();
  const kanten = new cv.Mat();
  const konturen = new cv.MatVector();
  const hierarchie = new cv.Mat();
  try {
    cv.cvtColor(src, grau, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(grau, grau, new cv.Size(5, 5), 0);
    cv.Canny(grau, kanten, 60, 180);
    // Lücken in den Kanten schließen
    const kern = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
    cv.dilate(kanten, kanten, kern);
    kern.delete();

    cv.findContours(
      kanten,
      konturen,
      hierarchie,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE,
    );

    const mindestFlaeche = canvas.width * canvas.height * 0.15;
    let beste: Ecken | null = null;
    let besteFlaeche = mindestFlaeche;

    for (let i = 0; i < konturen.size(); i++) {
      const kontur = konturen.get(i);
      const flaeche = cv.contourArea(kontur);
      if (flaeche > besteFlaeche) {
        const naeherung = new cv.Mat();
        cv.approxPolyDP(kontur, naeherung, 0.02 * cv.arcLength(kontur, true), true);
        if (naeherung.rows === 4) {
          besteFlaeche = flaeche;
          beste = [];
          for (let p = 0; p < 4; p++) {
            beste.push([naeherung.data32S[p * 2], naeherung.data32S[p * 2 + 1]]);
          }
        }
        naeherung.delete();
      }
      kontur.delete();
    }
    return beste;
  } finally {
    src.delete();
    grau.delete();
    kanten.delete();
    konturen.delete();
    hierarchie.delete();
  }
}

/** Ecken in die Reihenfolge oben-links, oben-rechts, unten-rechts, unten-links bringen */
function sortiereEcken(ecken: Ecken): Ecken {
  const nachSumme = [...ecken].sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  const nachDiff = [...ecken].sort((a, b) => a[0] - a[1] - (b[0] - b[1]));
  return [nachSumme[0], nachDiff[3], nachSumme[3], nachDiff[0]];
}

/**
 * Schneidet die erkannte Seite perspektivisch entzerrt aus `quelle` aus
 * und zeichnet sie nach `ziel`.
 */
export function entzerreSeite(
  cv: CV,
  quelle: HTMLCanvasElement,
  ecken: Ecken,
  ziel: HTMLCanvasElement,
): void {
  const [ol, or, ur, ul] = sortiereEcken(ecken);
  const abstand = (a: [number, number], b: [number, number]) =>
    Math.hypot(a[0] - b[0], a[1] - b[1]);
  const breite = Math.round(Math.max(abstand(ol, or), abstand(ul, ur)));
  const hoehe = Math.round(Math.max(abstand(ol, ul), abstand(or, ur)));

  const src = cv.imread(quelle);
  const dst = new cv.Mat();
  const von = cv.matFromArray(4, 1, cv.CV_32FC2, [
    ol[0], ol[1], or[0], or[1], ur[0], ur[1], ul[0], ul[1],
  ]);
  const nach = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0, breite, 0, breite, hoehe, 0, hoehe,
  ]);
  const transformation = cv.getPerspectiveTransform(von, nach);
  try {
    cv.warpPerspective(
      src,
      dst,
      transformation,
      new cv.Size(breite, hoehe),
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
      new cv.Scalar(255, 255, 255, 255),
    );
    ziel.width = breite;
    ziel.height = hoehe;
    cv.imshow(ziel, dst);
  } finally {
    src.delete();
    dst.delete();
    von.delete();
    nach.delete();
    transformation.delete();
  }
}
