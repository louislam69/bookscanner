/**
 * Verkleinert ein Foto clientseitig, bevor es gespeichert / an die KI
 * geschickt wird. 2000 px lange Kante reicht, um Buchtext zuverlässig zu
 * lesen, und hält Speicher- und Tokenkosten klein.
 */
export async function verkleinereFoto(
  datei: Blob,
  maxKante = 2000,
  qualitaet = 0.85,
): Promise<Blob> {
  const bitmap = await createImageBitmap(datei);
  try {
    const faktor = Math.min(1, maxKante / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * faktor);
    const h = Math.round(bitmap.height * faktor);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", qualitaet),
    );
    if (!blob) throw new Error("Foto konnte nicht verarbeitet werden");
    return blob;
  } finally {
    bitmap.close();
  }
}

export function blobZuBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function blobZuObjektUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}
