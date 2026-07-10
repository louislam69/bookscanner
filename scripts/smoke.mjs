import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
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

// Scan-Ansicht öffnen und zurück
await page.click("text=📷 Seiten scannen");
await page.waitForSelector("text=Foto aufnehmen");
console.log("3. Scan-Ansicht ok");
await page.click(".kopf .knopf-leise");
await page.waitForSelector("text=Seiten scannen");

// Foto-Upload simulieren: 1x1-PNG über den Datei-Input
await page.click("text=📷 Seiten scannen");
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
console.log("4. Foto hinzugefügt (verkleinert + Vorschau)");

// Offline speichern (ohne KI)
await page.fill('input[placeholder="z. B. 42-44"]', "12-14");
await page.click("text=Nur speichern (offline)");
await page.waitForSelector("text=Unverarbeiteter Scan");
console.log("5. Roh-Scan gespeichert, wartet auf Verarbeitung");

// Karte öffnen — Verarbeiten ohne API-Key muss sauberen Fehler zeigen
await page.click("text=Unverarbeiteter Scan");
await page.waitForSelector("text=Jetzt verarbeiten");
await page.click("text=Jetzt verarbeiten");
await page.waitForSelector("text=Kein API-Key hinterlegt");
console.log("6. Fehlermeldung ohne API-Key korrekt");

// Karte manuell ausfüllen und speichern
await page.fill('.formular label:has-text("Titel") input', "Das Reizen");
await page.fill(
  '.formular label:has-text("Kernaussage") textarea',
  "Beim Reizen zählt die Kartenstärke.",
);
await page.click("text=Speichern");
await page.waitForSelector("text=✓ Gespeichert");
console.log("7. Karte manuell bearbeitet und gespeichert");

// Einstellungen
await page.click(".kopf .knopf-leise"); // zurück zum Buch
await page.click(".kopf .knopf-leise"); // zurück zur Liste
await page.click("text=⚙️");
await page.waitForSelector("text=Anthropic-API-Key");
await page.fill('input[type="password"]', "sk-ant-test123");
await page.click("text=Speichern");
await page.waitForSelector("text=✓ Gespeichert");
console.log("8. Einstellungen gespeichert");

// Reload: Persistenz prüfen
await page.reload();
await page.waitForSelector("text=Schafkopf für Gewinner");
console.log("9. Persistenz nach Reload ok (IndexedDB)");

// Manifest / SW vorhanden?
const manifest = await page.evaluate(async () => {
  const r = await fetch("/manifest.webmanifest");
  return (await r.json()).name;
});
console.log("10. PWA-Manifest:", manifest);

const relevanteFehler = fehler.filter((f) => !f.includes("favicon"));
if (relevanteFehler.length) {
  console.log("FEHLER:", relevanteFehler);
  process.exit(1);
}
console.log("ALLE TESTS OK");
await browser.close();
