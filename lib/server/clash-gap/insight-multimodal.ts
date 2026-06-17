import { downloadClashGapFile } from '@/lib/server/clash-gap/storage'
import type { InsightDocumentSheet } from '@/lib/server/clash-gap/prompts/insight-review-engine'

export type InsightPlanImage = {
  sheetId: string
  fileName: string
  pageIndex: number
  mimeType: string
  dataUrl: string
}

function insightImagesMode(): 'auto' | 'on' | 'off' {
  const v = (process.env.CLASH_GAP_INSIGHT_IMAGES || 'auto').toLowerCase()
  if (v === '0' || v === 'false' || v === 'off') return 'off'
  if (v === '1' || v === 'true' || v === 'on') return 'on'
  return 'auto'
}

export function insightMaxImages(): number {
  const n = Number(process.env.CLASH_GAP_INSIGHT_MAX_IMAGES || 4)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 4
}

export function insightImageDetail(): 'low' | 'auto' | 'high' {
  const v = (process.env.CLASH_GAP_INSIGHT_IMAGE_DETAIL || 'low') as 'low' | 'auto' | 'high'
  return v === 'low' || v === 'auto' || v === 'high' ? v : 'low'
}

function imageMimeType(path: string, buffer: Buffer): string {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg'
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png'
  if (/\.png$/i.test(path)) return 'image/png'
  return 'image/jpeg'
}

function planNeedsInsightImage(sheet: InsightDocumentSheet): boolean {
  const structured = sheet.structured as { vision_enrichment?: unknown } | null | undefined
  if (structured?.vision_enrichment) return false
  const textLen = (sheet.text || '').trim().length
  const minLen = Number(process.env.CLASH_GAP_PLAN_MIN_LEN || 400)
  return textLen < (Number.isFinite(minLen) ? minLen : 400)
}

export function shouldUseInsightImages(sheets: InsightDocumentSheet[]): boolean {
  const mode = insightImagesMode()
  if (mode === 'off') return false

  const plansWithImages = sheets.filter((s) => s.fileRole === 'plans' && s.imagePath)
  if (!plansWithImages.length) return false
  if (plansWithImages.length > insightMaxImages()) return false

  if (mode === 'on') return true
  return plansWithImages.some(planNeedsInsightImage)
}

export async function loadInsightPlanImages(
  sheets: InsightDocumentSheet[],
): Promise<InsightPlanImage[]> {
  const plans = sheets
    .filter((s) => s.fileRole === 'plans' && s.imagePath)
    .slice(0, insightMaxImages())

  const images: InsightPlanImage[] = []
  for (const sheet of plans) {
    if (!sheet.imagePath) continue
    try {
      const buffer = await downloadClashGapFile(sheet.imagePath)
      const mime = imageMimeType(sheet.imagePath, buffer)
      images.push({
        sheetId: sheet.sheetId,
        fileName: sheet.fileName,
        pageIndex: sheet.pageIndex,
        mimeType: mime,
        dataUrl: `data:${mime};base64,${buffer.toString('base64')}`,
      })
    } catch (e) {
      console.warn('[clash-gap detect] insight image download failed', sheet.sheetId, e)
    }
  }
  return images
}

export function buildInsightImageCaption(images: InsightPlanImage[]): string {
  if (!images.length) return ''
  const lines = images.map(
    (img) =>
      `- ${img.sheetId} (${img.fileName}, page ${img.pageIndex + 1}): attached drawing image follows`,
  )
  return `[DRAWING IMAGES ATTACHED]\nThe following plan sheet images are included for visual review:\n${lines.join('\n')}\nUse images together with OCR text and structured data.`
}
