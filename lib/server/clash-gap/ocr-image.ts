async function loadCanvas() {
  return import('@napi-rs/canvas')
}

function ocrMaxDim(): number {
  const n = Number(process.env.CLASH_GAP_OCR_MAX_DIM || 1024)
  return Number.isFinite(n) && n >= 256 ? Math.floor(n) : 1024
}

function ocrJpegQuality(): number {
  const n = Number(process.env.CLASH_GAP_OCR_JPEG_QUALITY || 80)
  return Number.isFinite(n) && n >= 1 && n <= 100 ? Math.floor(n) : 80
}

// Hard ceiling for the bytes we are willing to hand to the vision model. Base64
// inflates payloads ~33%, and OpenAI rejects very large images outright, so we
// never forward anything bigger than this — we shrink it first or fail loudly.
function ocrMaxBytes(): number {
  const n = Number(process.env.CLASH_GAP_OCR_MAX_BYTES || 5 * 1024 * 1024)
  return Number.isFinite(n) && n >= 64 * 1024 ? Math.floor(n) : 5 * 1024 * 1024
}

/**
 * Prepare a page image for OCR: cap its longest edge and re-encode as JPEG so the
 * payload sent to the vision model stays small. A scale-2 render of a large sheet
 * can be tens of MB as PNG; downscaling + JPEG typically brings that under ~300KB
 * with no meaningful loss of legibility for text transcription.
 *
 * Never returns an image larger than {@link ocrMaxBytes}. If the source can't be
 * decoded and is already over that ceiling, it throws so the caller can record a
 * clear per-page failure instead of sending an oversized request that OpenAI rejects.
 */
export async function downscaleImageForOcr(
  bytes: Buffer,
  fallbackMime: string,
): Promise<{ bytes: Buffer; mime: string }> {
  const maxBytes = ocrMaxBytes()
  try {
    const { createCanvas, loadImage } = await loadCanvas()
    const img = await loadImage(bytes)
    const longest = Math.max(img.width, img.height)
    const maxDim = ocrMaxDim()
    const quality = ocrJpegQuality()

    const needsResize = Number.isFinite(longest) && longest > maxDim
    const tooHeavy = bytes.length > maxBytes

    // Small enough already and within the byte budget — send as-is.
    if (!needsResize && !tooHeavy) {
      return { bytes, mime: fallbackMime }
    }

    const scale = needsResize ? maxDim / longest : 1
    const width = Math.max(1, Math.round(img.width * scale))
    const height = Math.max(1, Math.round(img.height * scale))
    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, width, height)
    return { bytes: canvas.toBuffer('image/jpeg', quality) as Buffer, mime: 'image/jpeg' }
  } catch (e) {
    // Could not decode the image. Only forward the original if it is safely small;
    // otherwise fail loudly rather than push an oversized payload to the model.
    if (bytes.length <= maxBytes) return { bytes, mime: fallbackMime }
    throw new Error(
      `Page image is too large to OCR (${Math.round(bytes.length / 1024)}KB) and could not be downscaled`,
      { cause: e instanceof Error ? e : undefined },
    )
  }
}
