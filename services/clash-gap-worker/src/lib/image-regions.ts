import { createCanvas, loadImage } from '@napi-rs/canvas'
import pLimit from 'p-limit'
import { ocrImageWithVisionDetailed } from './vision-ocr.js'
import { mergePageTexts } from './text-quality.js'
import { normalizeOcrText } from './text-normalize.js'

export type ImageRegion = { x: number; y: number; w: number; h: number; label: string }

export type RegionOcrResult = {
  text: string
  regions: Record<string, string>
}

/** Construction sheet layout: title block, legend/notes strip, 2×2 plan grid. */
export function planSheetRegions(width: number, height: number): ImageRegion[] {
  const titleW = Math.max(1, Math.floor(width * 0.22))
  const mainW = Math.max(1, width - titleW)
  const topH = Math.max(1, Math.floor(height * 0.34))
  const planH = Math.max(1, height - topH)
  const planMidX = Math.max(1, Math.floor(mainW / 2))
  const planHalfH = Math.max(1, Math.floor(planH / 2))
  const titleX = width - titleW

  return [
    { label: 'title_block', x: titleX, y: 0, w: titleW, h: height },
    { label: 'legend_notes', x: 0, y: 0, w: mainW, h: topH },
    { label: 'plan_top_left', x: 0, y: topH, w: planMidX, h: planHalfH },
    { label: 'plan_top_right', x: planMidX, y: topH, w: mainW - planMidX, h: planHalfH },
    {
      label: 'plan_bottom_left',
      x: 0,
      y: topH + planHalfH,
      w: planMidX,
      h: planH - planHalfH,
    },
    {
      label: 'plan_bottom_right',
      x: planMidX,
      y: topH + planHalfH,
      w: mainW - planMidX,
      h: planH - planHalfH,
    },
  ]
}

async function cropRegion(imageBuffer: Buffer, region: ImageRegion): Promise<Buffer> {
  const img = await loadImage(imageBuffer)
  const w = Math.min(region.w, img.width - region.x)
  const h = Math.min(region.h, img.height - region.y)
  if (w <= 0 || h <= 0) throw new Error(`Invalid crop region ${region.label}`)

  const canvas = createCanvas(w, h)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, region.x, region.y, w, h, 0, 0, w, h)
  return canvas.toBuffer('image/png')
}

function regionSection(label: string, text: string): string {
  const header = `[${label.replace(/_/g, ' ').toUpperCase()}]`
  return `${header}\n${text}`
}

export async function ocrImageWithVisionRegions(
  imageBuffer: Buffer,
  concurrency = 6,
  regions?: ImageRegion[],
): Promise<RegionOcrResult> {
  const img = await loadImage(imageBuffer)
  const layout = regions ?? planSheetRegions(img.width, img.height)
  const limit = pLimit(concurrency)

  const entries = await Promise.all(
    layout.map((region) =>
      limit(async (): Promise<[string, string]> => {
        try {
          const tile = await cropRegion(imageBuffer, region)
          const detailed = await ocrImageWithVisionDetailed(tile)
          const text = normalizeOcrText(detailed.text)
          return [region.label, text]
        } catch {
          return [region.label, '']
        }
      }),
    ),
  )

  const regionMap: Record<string, string> = {}
  const sections: string[] = []
  for (const [label, text] of entries) {
    if (text) {
      regionMap[label] = text
      sections.push(regionSection(label, text))
    }
  }

  return {
    text: normalizeOcrText(mergePageTexts(...sections)),
    regions: regionMap,
  }
}
