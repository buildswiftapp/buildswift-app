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

function ocrMaxBytes(): number {
  const n = Number(process.env.CLASH_GAP_OCR_MAX_BYTES || 5 * 1024 * 1024)
  return Number.isFinite(n) && n >= 64 * 1024 ? Math.floor(n) : 5 * 1024 * 1024
}

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
    if (bytes.length <= maxBytes) return { bytes, mime: fallbackMime }
    throw new Error(
      `Page image is too large to OCR (${Math.round(bytes.length / 1024)}KB) and could not be downscaled`,
      { cause: e instanceof Error ? e : undefined },
    )
  }
}
