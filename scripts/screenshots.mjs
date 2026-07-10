// Erzeugt Demo-Screenshots (für Doku/Review). Nutzung: node scripts/screenshots.mjs <zielordner>
import { chromium } from "playwright";

const ziel = process.argv[2] ?? ".";
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto("http://localhost:4173/");
await page.waitForSelector("h1");

// Demo-Daten direkt in IndexedDB anlegen
await page.evaluate(() => {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("buch-lernkarten", 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      d.createObjectStore("buecher", { keyPath: "id" });
      d.createObjectStore("karten", { keyPath: "id" }).createIndex(
        "nach-buch",
        "buch_id",
      );
      d.createObjectStore("fotos", { keyPath: "id" }).createIndex(
        "nach-karte",
        "karte_id",
      );
      d.createObjectStore("einstellungen");
    };
    req.onsuccess = () => {
      const d = req.result;
      const tx = d.transaction(["buecher", "karten"], "readwrite");
      const buchId = "demo-buch";
      tx.objectStore("buecher").put({
        id: buchId,
        titel: "Schafkopf für Gewinner",
        autor: "Max Muster",
        erstellt_am: new Date().toISOString(),
      });
      const karten = [
        ["Das Reizen richtig einschätzen", "Reizen", 5, "12-14", "lernend"],
        ["Solo spielen: Wann lohnt es sich?", "Solo", 4, "22-25", "neu"],
        ["Schmieren für Fortgeschrittene", "Zusammenspiel", 3, "31-33", "gefestigt"],
      ];
      karten.forEach(([titel, kategorie, wichtigkeit, seiten, status], i) => {
        tx.objectStore("karten").put({
          id: "demo-" + i,
          buch_id: buchId,
          titel,
          kernaussage:
            "Vor dem Reizen die eigenen Trümpfe zählen und die Sitzposition berücksichtigen.",
          stichpunkte: [
            "Mindestens 5 Trümpfe für ein Solo",
            "Position hinter dem Geber ist am stärksten",
            "Bei Unsicherheit: lieber zurückhaltend reizen",
          ],
          quelle_seiten: seiten,
          kategorie,
          tags: ["Taktik"],
          wichtigkeit,
          lernstatus: status,
          naechste_wiederholung_am: null,
          wiederholungs_intervall: 0,
          foto_ids: [],
          verarbeitet: true,
          erstellt_am: new Date().toISOString(),
          zuletzt_bearbeitet_am: new Date().toISOString(),
        });
      });
      tx.oncomplete = () => resolve(null);
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
});

await page.reload();
await page.waitForSelector("text=Schafkopf für Gewinner");
await page.screenshot({ path: `${ziel}/01-buecher.png` });

await page.click("text=Schafkopf für Gewinner");
await page.waitForSelector("text=Seiten scannen");
await page.screenshot({ path: `${ziel}/02-buchansicht.png` });

await page.click("text=🎓 Lernen");
await page.waitForSelector("text=Aufdecken");
await page.click('button:has-text("Aufdecken")');
await page.waitForSelector("text=Wusste ich sofort");
await page.screenshot({ path: `${ziel}/03-lernmodus.png` });

await browser.close();
console.log("Screenshots gespeichert in", ziel);
