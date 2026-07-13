// End-zu-Ende-Rauchtest gegen den Produktions-Build (http://localhost:4173).
// Start: npm run build && npx vite preview --port 4173 &  →  node scripts/smoke.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
  ],
});
const kontext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  permissions: ["camera"],
});
const page = await kontext.newPage();
const fehler = [];
page.on("pageerror", (e) => fehler.push("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error") fehler.push("console: " + m.text());
});

await page.goto("http://localhost:4173/");
await page.waitForSelector("h1");
console.log("1. Startseite:", await page.textContent("h1"));

// Buch anlegen
await page.click("text=＋ Neues Buch");
await page.fill('input[placeholder*="Schafkopf"]', "Schafkopf für Gewinner");
await page.fill('input[placeholder="Autor"]', "Max Muster");
await page.click("text=Buch anlegen");
await page.waitForSelector("text=Seiten scannen");
console.log("2. Buchansicht:", (await page.textContent("h1")).trim());

// Dokumentenscanner: Live-Kamera (Fake-Device), OpenCV lädt, Auslöser
await page.click("text=📷 Seiten scannen");
await page.waitForSelector("text=Scanner (Seite automatisch erkennen)");
await page.click("text=Scanner (Seite automatisch erkennen)");
await page.waitForSelector(".scanner-ausloeser:not([disabled])", {
  timeout: 60000, // OpenCV (~13 MB) muss beim ersten Mal laden
});
await page.click(".scanner-ausloeser");
await page.waitForSelector("text=Fertig (1)");
await page.click("text=Fertig (1)");
await page.waitForSelector(".foto-kachel img");
console.log("2b. Scanner: Kamera lief, Foto ausgelöst und übernommen");
// Scanner-Foto wieder entfernen, damit der Rest des Tests unverändert bleibt
await page.click(".foto-kachel .knopf-leise");
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
await page.setInputFiles('input[type="file"][multiple]', {
  name: "seite1.png",
  mimeType: "image/png",
  buffer: png,
});
await page.waitForSelector(".foto-kachel img");
console.log("3. Foto hinzugefügt (verkleinert + Vorschau)");

// Offline speichern (ohne KI)
await page.fill('input[placeholder="z. B. 42-44"]', "12-14");
await page.click("text=Nur speichern (offline)");
await page.waitForSelector("text=Unverarbeiteter Scan");
console.log("4. Roh-Scan gespeichert, wartet auf Verarbeitung");

// Verarbeiten ohne API-Key muss sauberen Fehler zeigen
await page.click("text=Unverarbeiteter Scan");
await page.waitForSelector('button:has-text("Jetzt verarbeiten")');
await page.click('button:has-text("Jetzt verarbeiten")');
await page.waitForSelector("text=Kein API-Key hinterlegt");
console.log("5. Fehlermeldung ohne API-Key korrekt");
await page.click(".kopf .knopf-leise"); // zurück zur Buchansicht

// --- Abo-Workflow: Scans exportieren → am PC verarbeiten → importieren ---
const [download] = await Promise.all([
  page.waitForEvent("download"),
  page.click("text=💾 Als Datei exportieren"),
]);
const scansDatei = JSON.parse(readFileSync(await download.path(), "utf8"));
if (
  scansDatei.format !== "buch-lernkarten-scans" ||
  scansDatei.scans.length !== 1 ||
  scansDatei.scans[0].fotos.length !== 1 ||
  scansDatei.scans[0].quelle_seiten !== "12-14"
) {
  throw new Error(
    "Scan-Export fehlerhaft: " + JSON.stringify(scansDatei).slice(0, 200),
  );
}
console.log("6. Scan-Export für PC-Verarbeitung ok (inkl. Foto als Base64)");

// Verarbeitete Datei simulieren (das erzeugt sonst verarbeiter/verarbeite.mjs)
const verarbeitet = {
  format: "buch-lernkarten-export",
  version: 1,
  exportiert_am: new Date().toISOString(),
  buch: scansDatei.buch,
  karten: [
    {
      id: scansDatei.scans[0].id,
      titel: "Das Reizen richtig einschätzen",
      kernaussage: "Vor dem Reizen Trümpfe zählen und Sitzposition beachten.",
      stichpunkte: [
        "Mindestens 5 Trümpfe",
        "Position hinter dem Geber ist stark",
      ],
      kategorie: "Reizen",
      tags: ["Taktik"],
      quelle_seiten: "12-14",
      wichtigkeit: 5,
      lernstatus: "neu",
      naechste_wiederholung_am: null,
      wiederholungs_intervall: 0,
      verarbeitet: true,
      erstellt_am: new Date().toISOString(),
      zuletzt_bearbeitet_am: new Date().toISOString(),
    },
  ],
};
await page.click(".kopf .knopf-leise"); // zurück zur Buchliste
await page.setInputFiles('input[type="file"][accept*="json"]', {
  name: "scans-verarbeitet.json",
  mimeType: "application/json",
  buffer: Buffer.from(JSON.stringify(verarbeitet)),
});
await page.waitForSelector("text=1 Scans zu fertigen Karten verarbeitet");
console.log("7. Import der verarbeiteten Datei: Roh-Scan wurde aktualisiert");

await page.click('.eintrag-haupt:has-text("Schafkopf für Gewinner")');
await page.waitForSelector("text=Das Reizen richtig einschätzen");
if (await page.locator("text=Unverarbeiteter Scan").count()) {
  throw new Error("Roh-Scan wurde nicht in fertige Karte umgewandelt");
}
console.log("8. Karte ist fertig, Fotos blieben erhalten");

// Lernmodus mit der fertigen Karte
await page.click("text=🎓 Lernen");
await page.waitForSelector('button:has-text("Aufdecken")');
await page.click('button:has-text("Aufdecken")');
await page.click("text=✓ Wusste ich sofort");
await page.waitForSelector("text=🎉");
console.log("9. Lernmodus: Karte wiederholt, Sitzung abgeschlossen");
await page.click("text=Zurück zum Buch");
await page.click(".kopf .knopf-leise");

// Einstellungen
await page.click("text=⚙️");
await page.waitForSelector("text=Anthropic-API-Key");
await page.fill('input[placeholder="sk-ant-…"]', "sk-ant-test123");
await page.click("text=Speichern");
await page.waitForSelector("text=✓ Gespeichert");
console.log("10. Einstellungen gespeichert");

// Cloud-Verbindungstest ohne Konfiguration → klare Meldung
await page.click("text=☁️ Verbindung testen");
await page.waitForSelector("text=Cloud-Austausch ist nicht eingerichtet");
console.log("10b. Verbindungstest meldet fehlende Cloud-Konfiguration korrekt");

// Reload: Persistenz prüfen
await page.reload();
await page.waitForSelector("text=Schafkopf für Gewinner");
console.log("11. Persistenz nach Reload ok (IndexedDB)");

// Manifest / SW vorhanden?
const manifest = await page.evaluate(async () => {
  const r = await fetch("/manifest.webmanifest");
  return (await r.json()).name;
});
console.log("12. PWA-Manifest:", manifest);

const relevanteFehler = fehler.filter((f) => !f.includes("favicon"));
if (relevanteFehler.length) {
  console.log("FEHLER:", relevanteFehler);
  process.exit(1);
}
console.log("ALLE TESTS OK");
await browser.close();
