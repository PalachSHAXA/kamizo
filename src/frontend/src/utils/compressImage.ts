// Client-side image compression for request/agenda photos.
//
// Photos are stored as base64 `data:` URLs (requests.photos, agenda
// attachments). The backend rejects any single photo whose data-URL string
// exceeds ~350 KB (see routes/requests/crud.ts). A raw phone photo is several
// MB, so without compression every attached photo was SILENTLY dropped
// server-side (stored as NULL) — the user attached a photo and it never
// appeared. This resizes to a max dimension and re-encodes as JPEG, stepping
// quality (and, if needed, dimension) down until the result fits under a safe
// byte budget below the server cap.

const DEFAULT_MAX_DIM = 1280;
// Stay under BOTH server caps: 350 KB per photo AND 1.5 MB total for 5
// photos (1.5 MB / 5 ≈ 300 KB) — target 280 KB to leave margin.
const DEFAULT_MAX_BYTES = 280 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode failed'));
    img.src = src;
  });
}

function encodeAtDim(img: HTMLImageElement, maxDim: number, quality: number): string | null {
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
  if (w > maxDim || h > maxDim) {
    if (w >= h) { h = Math.round((h * maxDim) / w); w = maxDim; }
    else { w = Math.round((w * maxDim) / h); h = maxDim; }
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Compress an image File to a JPEG data-URL under `maxBytes`. Falls back to
 * the raw data-URL only if canvas isn't available (very old WebView).
 */
export async function compressImage(
  file: File,
  opts?: { maxDim?: number; maxBytes?: number },
): Promise<string> {
  const maxDim = opts?.maxDim ?? DEFAULT_MAX_DIM;
  const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES;

  const rawDataUrl = await readAsDataUrl(file);
  let img: HTMLImageElement;
  try {
    img = await loadImage(rawDataUrl);
  } catch {
    return rawDataUrl; // can't decode (e.g. SVG/HEIC) — let the caller/server validate
  }

  // Try progressively smaller dimensions × qualities; return the first that
  // fits, otherwise the smallest produced.
  let smallest: string | null = null;
  for (const dim of [maxDim, 1024, 800, 640]) {
    for (const q of [0.8, 0.7, 0.6, 0.5]) {
      const out = encodeAtDim(img, dim, q);
      if (!out) continue;
      if (out.length <= maxBytes) return out;
      if (!smallest || out.length < smallest.length) smallest = out;
    }
  }
  return smallest ?? rawDataUrl;
}
