// Erzeugt die PWA-Icons (icon-192.png, icon-512.png) ohne externe Abhängigkeiten.
// Einmalig ausführen: node scripts/gen-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

function crc32(buf) {
  let c,
    crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixelFn) {
  // Rohdaten: pro Zeile 1 Filterbyte + RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelFn(x, y, size);
      const o = row + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const BG = [47, 93, 80]; // dunkles Grün
const PAGE = [246, 243, 236]; // warmes Weiß
const LINE = [200, 190, 170];

function pixel(x, y, size) {
  const u = x / size;
  const v = y / size;
  // abgerundete Ecken
  const r = 0.18;
  const cx = Math.min(Math.max(u, r), 1 - r);
  const cy = Math.min(Math.max(v, r), 1 - r);
  if ((u - cx) ** 2 + (v - cy) ** 2 > r * r) return [0, 0, 0, 0];

  // aufgeschlagenes Buch: zwei Seiten mit Falz in der Mitte
  const inPageY = v > 0.28 && v < 0.74;
  const leftPage = u > 0.16 && u < 0.485 && inPageY;
  const rightPage = u > 0.515 && u < 0.84 && inPageY;
  if (leftPage || rightPage) {
    // Textzeilen andeuten
    const lineIdx = (v - 0.28) / 0.46;
    const bandY = lineIdx * 5 % 1;
    const margin = leftPage ? u > 0.2 && u < 0.45 : u > 0.55 && u < 0.8;
    if (bandY > 0.35 && bandY < 0.6 && margin) return [...LINE, 255];
    return [...PAGE, 255];
  }
  // Karteikarten-Ecke unten rechts
  if (u > 0.55 && u < 0.86 && v > 0.62 && v < 0.86) {
    if (u > 0.57 && u < 0.84 && v > 0.64 && v < 0.84) return [...PAGE, 255];
    return [217, 119, 87, 255]; // Terrakotta-Rahmen
  }
  return [...BG, 255];
}

writeFileSync("public/icon-192.png", png(192, pixel));
writeFileSync("public/icon-512.png", png(512, pixel));
console.log("Icons erzeugt: public/icon-192.png, public/icon-512.png");
