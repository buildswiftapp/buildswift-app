async function loadCanvas() {
  return import('@napi-rs/canvas')
}

function ocrMaxDim(): number {
  const n = Number(process.env.CLASH_GAP_OCR_MAX_DIM || 1024)
  return Number.isFinite(n) && n >= 256 ? Math.floor(n) : 1024
}

export async function downscaleImageForOcr(
  bytes: Buffer,
  fallbackMime: string,
): Promise<{ bytes: Buffer; mime: string }> {
  try {
    const { createCanvas, loadImage } = await loadCanvas()
    const img = await loadImage(bytes)
    const longest = Math.max(img.width, img.height)
    const maxDim = ocrMaxDim()
    if (!Number.isFinite(longest) || longest <= maxDim) {
      return { bytes, mime: fallbackMime }
    }
    const scale = maxDim / longest
    const width = Math.max(1, Math.round(img.width * scale))
    const height = Math.max(1, Math.round(img.height * scale))
    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, width, height)
    return { bytes: canvas.toBuffer('image/png') as Buffer, mime: 'image/png' }
  } catch {
    return { bytes, mime: fallbackMime }
  }
}
