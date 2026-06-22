import { downloadClashGapFile } from '@/lib/server/clash-gap/storage'
import { isRetryableNetworkError } from '@/lib/server/clash-gap/errors'
import { getOpenAIClient } from '@/lib/server/openai'

export type PlanSheetForVision = {
  id: string
  sheet_id: string | null
  page_index: number
  file_name?: string
  raw_text: string | null
  structured: Record<string, unknown> | null
  image_path: string | null
}

function visionEnrichModel(): string {
  return process.env.CLASH_GAP_VISION_MODEL || process.env.OPENAI_MODEL || 'gpt-4o'
}

function visionDetail(): 'low' | 'auto' | 'high' {
  const v = (process.env.CLASH_GAP_DETECT_VISION_DETAIL || 'high') as 'low' | 'auto' | 'high'
  return v === 'low' || v === 'auto' || v === 'high' ? v : 'high'
}

function planMinTextLength(): number {
  const n = Number(process.env.CLASH_GAP_PLAN_MIN_LEN || 400)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 400
}

function visionEnrichTimeoutMs(): number {
  const n = Number(process.env.CLASH_GAP_VISION_TIMEOUT_MS || 120_000)
  return Number.isFinite(n) && n >= 10_000 ? Math.floor(n) : 120_000
}

function visionEnrichMode(): 'weak_only' | 'all' | 'off' {
  const v = (process.env.CLASH_GAP_DETECT_VISION || 'weak_only').toLowerCase()
  if (v === '0' || v === 'false' || v === 'off') return 'off'
  if (v === 'all' || v === '1' || v === 'true') return 'all'
  return 'weak_only'
}

function imageMimeType(path: string, buffer: Buffer): string {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg'
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png'
  if (/\.png$/i.test(path)) return 'image/png'
  return 'image/jpeg'
}

export function needsVisionEnrichment(sheet: PlanSheetForVision): boolean {
  if (!sheet.image_path) return false
  const mode = visionEnrichMode()
  if (mode === 'off') return false
  if (mode === 'all') return true

  const text = (sheet.raw_text || '').trim()
  const structured = sheet.structured as {
    title_block?: string | null
    legend_notes?: string | null
    ocr_engine?: string
  } | null

  if (text.length < planMinTextLength()) return true
  if (!structured?.title_block?.trim()) return true
  if (!structured?.legend_notes?.trim() && text.length < planMinTextLength() * 1.5) return true
  return false
}

const VISION_ENRICH_SYSTEM = `You are an expert construction drawing vision analyst supporting a General Contractor document review.

You receive a drawing sheet image plus OCR text (which may be incomplete). Extract visible information the OCR likely missed.

Return valid JSON only:
{
  "sheet_metadata": {
    "drawing_number": "string or null",
    "sheet_title": "string or null",
    "project_name": "string or null",
    "discipline": "string or null",
    "scale": "string or null",
    "revision": "string or null"
  },
  "title_block_text": "verbatim title block text or null",
  "legends": ["legend entries verbatim"],
  "general_notes": ["numbered notes verbatim"],
  "rooms": [{ "tag": "string", "name": "string", "location_hint": "string" }],
  "doors": [{ "tag": "string", "size": "string", "location_hint": "string" }],
  "dimensions": [{ "value": "string", "location_hint": "string" }],
  "symbols_and_tags": [{ "label": "string", "count": "number or null", "location_hint": "string" }],
  "spec_callouts_on_drawing": ["verbatim keyed notes / material callouts"],
  "ocr_gaps_filled": ["items visible in image but absent from OCR text"]
}

Rules:
- Do not invent values. Use null or omit when unclear.
- Prefer verbatim transcription from the image.
- Focus on title block, legends, notes, room tags, door/window tags, dimensions, and keynote labels.
- Compare against provided OCR text and populate ocr_gaps_filled when the image shows text not in OCR.`

export async function enrichPlanSheetWithVision(
  sheet: PlanSheetForVision,
): Promise<Record<string, unknown> | null> {
  if (!sheet.image_path) return null

  const openai = getOpenAIClient()
  if (!openai) return null

  let buffer: Buffer
  try {
    buffer = await downloadClashGapFile(sheet.image_path)
  } catch (e) {
    console.warn('[clash-gap detect] vision enrich download failed', sheet.id, e)
    return null
  }

  const mime = imageMimeType(sheet.image_path, buffer)
  const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`
  const ocrContext = (sheet.raw_text || '').slice(0, 6000)
  const structuredContext = sheet.structured ? JSON.stringify(sheet.structured).slice(0, 4000) : ''

  const maxAttempts = 2
  let lastError: unknown

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), visionEnrichTimeoutMs())
    try {
      const stream = await openai.chat.completions.create(
        {
          model: visionEnrichModel(),
          temperature: 0,
          response_format: { type: 'json_object' },
          stream: true,
          messages: [
            { role: 'system', content: VISION_ENRICH_SYSTEM },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    task: 'enrich_drawing_sheet_for_clash_gap_detect',
                    sheet_id: sheet.sheet_id,
                    file_name: sheet.file_name,
                    page: sheet.page_index + 1,
                    ocr_text: ocrContext,
                    ocr_structured: structuredContext || null,
                    instruction:
                      'Read the image carefully. Fill gaps in OCR. Return JSON only.',
                  }),
                },
                {
                  type: 'image_url',
                  image_url: { url: dataUrl, detail: visionDetail() },
                },
              ],
            },
          ],
        },
        { signal: controller.signal, maxRetries: 0 },
      )

      let raw = ''
      for await (const chunk of stream) {
        raw += chunk.choices[0]?.delta?.content ?? ''
      }
      if (!raw.trim()) return null
      try {
        return JSON.parse(raw) as Record<string, unknown>
      } catch {
        console.error('[clash-gap detect] vision enrich invalid JSON', raw.slice(0, 300))
        return null
      }
    } catch (error) {
      lastError = error
      const retryable =
        controller.signal.aborted ||
        isRetryableNetworkError(error) ||
        (error as { status?: number }).status === 429
      if (attempt < maxAttempts - 1 && retryable) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
        continue
      }
      console.warn('[clash-gap detect] vision enrich failed', sheet.id, lastError)
      return null
    } finally {
      clearTimeout(timer)
    }
  }

  return null
}

export function mergeVisionEnrichment(
  existing: Record<string, unknown> | null,
  enrichment: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...(existing ?? {}),
    vision_enrichment: enrichment,
    vision_enriched_at: new Date().toISOString(),
  }
}

export function visionEnrichmentSummary(enrichment: Record<string, unknown>): string {
  const parts: string[] = []
  const title = enrichment.title_block_text
  if (typeof title === 'string' && title.trim()) parts.push(`[TITLE BLOCK]\n${title.trim()}`)

  const legends = enrichment.legends
  if (Array.isArray(legends) && legends.length) {
    parts.push(`[LEGENDS]\n${legends.map(String).join('\n')}`)
  }

  const notes = enrichment.general_notes
  if (Array.isArray(notes) && notes.length) {
    parts.push(`[GENERAL NOTES]\n${notes.map(String).join('\n')}`)
  }

  const gaps = enrichment.ocr_gaps_filled
  if (Array.isArray(gaps) && gaps.length) {
    parts.push(`[VISION FILLED GAPS]\n${gaps.map(String).join('\n')}`)
  }

  const callouts = enrichment.spec_callouts_on_drawing
  if (Array.isArray(callouts) && callouts.length) {
    parts.push(`[CALLOUTS]\n${callouts.map(String).join('\n')}`)
  }

  return parts.join('\n\n')
}
