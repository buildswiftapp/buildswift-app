import '@/lib/server/clash-gap/pdf-globals'
import { createHash } from 'crypto'
import type { ClashGapProcessingProgress } from '@/lib/clash-gap-processing-status'
import { getOpenAIClient } from '@/lib/server/openai'
import { downloadClashGapFile } from '@/lib/server/clash-gap/storage'
import { getPdfPageCount, renderPdfPageToPng } from '@/lib/server/clash-gap/render-pdf-page'
import { chunkPdfRange } from '@/lib/server/clash-gap/chunk-pdf'
import { extractEmbeddedTextFromPage } from '@/lib/server/clash-gap/embedded-text'
import { mergePageText } from '@/lib/server/clash-gap/merge-ocr'
import { isRetryableNetworkError } from '@/lib/server/clash-gap/errors'

const SHEET_ID_RE = /\b([ASMEPC])[\s-]?(\d{1,3}(?:\.\d{1,2})?)\b/gi

export function sha256Buffer(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

export function detectSheetId(text: string): string | null {
  const head = text.slice(0, 1200)
  const matches = [...head.matchAll(SHEET_ID_RE)]
  if (!matches.length) return null
  const m = matches[0]
  return `${m[1].toUpperCase()}${m[2]}`
}

function ocrModel(): string {
  return process.env.OPENAI_OCR_MODEL || process.env.OPENAI_MODEL || 'gpt-4o'
}

function looksLikeRefusal(text: string): boolean {
  if (text.length > 600) return false
  return /\b(i['’]?m (sorry|unable)|i (cannot|can['’]?t) (help|assist|view|read|process|transcribe)|unable to (view|read|process|transcribe)|i['’]?m not able to|as an ai)\b/i.test(
    text,
  )
}

function ocrConcurrency(): number {
  const n = Number(process.env.CLASH_GAP_OCR_CONCURRENCY || 3)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 3
}

function chunkBatchSize(): number {
  const n = Number(process.env.CLASH_GAP_CHUNK_BATCH || 5)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 5
}

function embeddedTextMinLength(): number {
  const n = Number(process.env.CLASH_GAP_EMBEDDED_MIN_LEN || 200)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 200
}

export type ExtractProgressContext = Pick<
  ClashGapProcessingProgress,
  'fileName' | 'fileIndex' | 'fileTotal'
>

function imageMimeType(fileName: string, buffer: Buffer): string {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg'
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png'
  if (buffer[0] === 0x47 && buffer[1] === 0x49) return 'image/gif'
  if (buffer.slice(0, 4).toString('ascii') === 'RIFF') return 'image/webp'
  const lower = fileName.toLowerCase()
  if (/\.jpe?g$/.test(lower)) return 'image/jpeg'
  if (/\.png$/.test(lower)) return 'image/png'
  if (/\.gif$/.test(lower)) return 'image/gif'
  if (/\.webp$/.test(lower)) return 'image/webp'
  if (/\.bmp$/.test(lower)) return 'image/bmp'
  if (/\.tiff?$/.test(lower)) return 'image/tiff'
  return 'image/png'
}

function isImageUpload(mimeType: string, fileName: string): boolean {
  const mime = mimeType.toLowerCase()
  if (mime.startsWith('image/')) return true
  return /\.(jpe?g|png|gif|webp|bmp|tiff?)$/i.test(fileName)
}

export async function ocrImageWithOpenAI(
  imageBuffer: Buffer,
  mimeType: string,
  fileName: string,
  pageIndex: number,
): Promise<string> {
  const openai = getOpenAIClient()
  if (!openai) return ''

  const base64 = imageBuffer.toString('base64')
  const dataUrl = `data:${mimeType};base64,${base64}`
  const model = ocrModel()

  const maxAttempts = 2
  const ocrTimeoutMs = Number(process.env.OPENAI_OCR_TIMEOUT_MS || 150_000)
  const imageDetail = (process.env.OPENAI_OCR_DETAIL || 'low') as 'low' | 'auto' | 'high'
  let lastError: unknown

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), ocrTimeoutMs)
    try {
      const stream = await openai.chat.completions.create(
        {
          model,
          temperature: 0,
          stream: true,
          messages: [
            {
              role: 'system',
              content:
                `You are an expert construction-document vision system for architectural, engineering, and specification sheets.

Your task is to inspect the image and perform two steps in sequence:

STEP 1 — CLASSIFY THE SHEET
First, determine whether the image is:
- TEXT_ONLY
- DRAWING_ONLY
- MIXED

Definitions:
- TEXT_ONLY: mostly plain text, specifications, notes, schedules, paragraphs, or tables, with little or no technical drawing geometry.
- DRAWING_ONLY: mostly technical drawing content such as linework, room layouts, symbols, dimensions, grids, walls, doors, windows, and little readable prose.
- MIXED: contains both plain text content and technical drawing content on the same sheet.

Classification rules:
- If the sheet contains a plan, elevation, section, detail, diagram, or layout together with title block, notes, legends, schedules, or specification text, classify it as MIXED.
- If you are uncertain, choose MIXED.
- Do not skip classification.
- Do not explain the classification in a long paragraph.
- Output the classification clearly at the top.

STEP 2 — EXTRACT CONTENT BASED ON CLASSIFICATION
After classification, extract the visible content accordingly:
- If TEXT_ONLY: extract all readable text.
- If DRAWING_ONLY: extract all drawing-related data.
- If MIXED: extract both text and drawing-related data.

Important rules:
- Output ONLY text, not JSON.
- Do not invent anything.
- Do not summarize or interpret beyond what is visible.
- Preserve original spelling, numbers, symbols, casing, and line order as much as possible.
- If a value is unclear, write [ILLEGIBLE] or [UNCLEAR].
- Be exhaustive and include all visible items.
- Keep the same section headers and order every time.
- If a field is missing, leave it blank or write null.
- If the sheet contains both text and drawing data, include both.

Use this exact output format:

[CLASSIFICATION]
Type: TEXT_ONLY / DRAWING_ONLY / MIXED
Reason: short reason only

[SHEET_METADATA]
Drawing Number: ...
Sheet Title: ...
Project Name: ...
Discipline: ...
Scale: ...
Revision: ...
Date: ...
Sheet ID: ...
Additional Fields:
- key: value
- key: value

[PLAIN_TEXT_TITLE_BLOCK]
Transcribe the title block text exactly as shown.

[GENERAL_NOTES]
1. ...
2. ...
3. ...

[LEGENDS]
...

[SCHEDULES]
...

[SPEC_TEXT_ON_SHEET]
Include any specification text, keyed notes, material notes, standards references, product requirements, or requirement statements written on the sheet.

[CALLOUTS]
Include labels, keynotes, tags, and references exactly as shown.

[ROOMS]
Room Number | Room Name | Area | Location Hint | Confidence
...

[DOORS]
Tag | Subtype | Size | Material | Fire Rating | Acoustic Rating | Location Hint | Schedule Ref | Confidence
...

[WINDOWS]
Tag | Subtype | Size | Material | Fire Rating | Acoustic Rating | Location Hint | Schedule Ref | Confidence
...

[WALLS]
ID | Type | Thickness | Material | Fire Rating | Acoustic Rating | Location Hint | Confidence
...

[STAIRS]
ID | Type | Location Hint | Confidence
...

[FIXTURES]
Tag | Type | Location Hint | Quantity | Confidence
...

[GRIDS]
Grid ID | Position Hint
...

[DIMENSIONS]
Value | Unit | Type | Feature Description | Location Hint | Confidence
...

[SYMBOLS]
Symbol Type | Label | Count | Location Hint | Details
...

[LEVELS]
Level | Elevation | Location Hint
...

[HATCHING]
Pattern | Material/Meaning | Location Hint
...

[COMPARISON_FIELDS]
Materials:
- ...
Finishes:
- ...
Fire Ratings:
- ...
Acoustic Ratings:
- ...
Sizes:
- ...
Quantities:
- ...
Performance Values:
- ...
Schedule References:
- ...

[ISSUES_AND_UNCERTAINTIES]
Type | Description | Location Hint | Confidence
- unreadable_text | ... | ... | ...
- ambiguous_symbol | ... | ... | ...
- missing_label | ... | ... | ...
- conflicting_dimension | ... | ... | ...
- overlapping_annotations | ... | ... | ...
- low_confidence_extraction | ... | ... | ...

[RAW_TEXT_BLOCKS]
Block 1:
...
Block 2:
...

Detailed extraction guidance:

1. Sheet metadata
- Capture all title block fields, including drawing number, sheet title, project name, discipline, scale, revision, date, sheet ID, client, architect, engineer, and any other visible title block fields.

2. Plain text regions
- Transcribe all readable text verbatim.
- This includes title block text, general notes, legends, schedules, specification text, keynote notes, code references, general instructions, and any written text on the sheet.

3. Drawing content
- Extract all visible drawing-related information from the plan or diagram area.
- Identify rooms, doors, windows, walls, stairs, fixtures, grids, dimensions, symbols, levels, and hatching.

4. Comparison-ready data
- For each drawing element, include the attributes needed to compare against specifications later:
  - id/tag
  - type
  - subtype
  - location_hint
  - room_number
  - room_name
  - grid_reference
  - floor/level
  - quantity
  - dimensions
  - material
  - finish
  - fire_rating
  - acoustic_rating
  - performance values
  - schedule reference
  - confidence

5. Text vs drawing distinction
- If content is text-only, still keep the same section structure and leave drawing sections blank.
- If content is drawing-only, leave text-heavy sections blank.
- If content is mixed, populate both.

6. Uncertainty handling
- If text is hard to read, mark it [ILLEGIBLE].
- If a symbol is unclear, describe it as ambiguous.
- If dimensions conflict or are unreadable, record that in [ISSUES_AND_UNCERTAINTIES].
- Never guess missing data.

7. Self-check before output
- Confirm the sheet classification is present.
- Confirm all visible text is included.
- Confirm drawing data is included when present.
- Confirm no invented values were added.
- Confirm section order is preserved.

Remember:
- The goal is to support later comparison between drawings and specifications.
- Extract enough detail so mismatches, gaps, and clashes can be detected later.
- Be exhaustive, careful, and consistent.`
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text:
                    pageIndex === 0 && mimeType !== 'image/png'
                      ? `Transcribe all visible text in this image scan "${fileName}".`
                      : `Transcribe all visible text on page ${pageIndex + 1} of "${fileName}".`,
                },
                {
                  type: 'image_url',
                  image_url: { url: dataUrl, detail: imageDetail },
                },
              ],
            },
          ],
        },
        { signal: controller.signal, maxRetries: 0 },
      )
      let acc = ''
      for await (const part of stream) {
        acc += part.choices[0]?.delta?.content ?? ''
      }
      const text = acc.trim()
      if (text && looksLikeRefusal(text)) {
        lastError = new Error('OCR returned a refusal instead of a transcription')
        if (attempt < maxAttempts - 1) continue
        return ''
      }
      return text
    } catch (error) {
      lastError = error
      const retryable = controller.signal.aborted || isRetryableNetworkError(error)
      if (attempt < maxAttempts - 1 && retryable) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)))
        continue
      }
      break
    } finally {
      clearTimeout(timer)
    }
  }

  console.error('[ocrImageWithOpenAI] failed after retries:', lastError)
  return ''
}

export type ExtractedPage = {
  pageIndex: number
  rawText: string
  sheetId: string | null
}

export type ExtractPdfProgress = Omit<ClashGapProcessingProgress, 'phase'> & {
  phase: 'download' | 'chunk' | 'embedded' | 'render' | 'ocr' | 'merge'
}

function pageStageTimeoutMs(): number {
  const n = Number(process.env.CLASH_GAP_PAGE_STAGE_TIMEOUT_MS || 120_000)
  return Number.isFinite(n) && n >= 1000 ? Math.floor(n) : 120_000
}

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const guard = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms)
  })
  try {
    return await Promise.race([promise, guard])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0
  const inFlight: Promise<void>[] = []
  const safeLimit = Math.max(1, Math.min(limit, items.length))

  const launch = (): Promise<void> => {
    const index = next++
    if (index >= items.length) return Promise.resolve()
    const promise = worker(items[index]!, index).then(() => {
      const i = inFlight.indexOf(promise)
      if (i >= 0) inFlight.splice(i, 1)
    })
    inFlight.push(promise)
    return promise
  }

  for (let i = 0; i < safeLimit; i++) {
    launch()
  }

  while (inFlight.length > 0) {
    await Promise.race(inFlight.slice())
    while (inFlight.length < safeLimit && next < items.length) {
      launch()
    }
  }
}

export async function extractPdfFromStorage(params: {
  storagePath: string
  fileName: string
  maxPages: number
  fileContext?: ExtractProgressContext
  onProgress?: (progress: ExtractPdfProgress) => void | Promise<void>
}): Promise<{ sha256: string; totalPages: number; pages: ExtractedPage[] }> {
  const emit = async (progress: ExtractPdfProgress) => {
    await params.onProgress?.({
      ...params.fileContext,
      ...progress,
    })
  }

  await emit({ phase: 'download', fileName: params.fileName })
  const buffer = await downloadClashGapFile(params.storagePath)
  const sha256 = sha256Buffer(buffer)

  const totalPages = await getPdfPageCount(buffer)
  const pagesToProcess = Math.min(totalPages, params.maxPages)
  if (pagesToProcess <= 0) {
    return { sha256, totalPages, pages: [{ pageIndex: 0, rawText: '', sheetId: 'Page-1' }] }
  }

  const batchSize = chunkBatchSize()
  const batchTotal = Math.max(1, Math.ceil(pagesToProcess / batchSize))
  const concurrency = ocrConcurrency()
  const embeddedMin = embeddedTextMinLength()

  const allPages: ExtractedPage[] = []

  for (let batchStart = 0; batchStart < pagesToProcess; batchStart += batchSize) {
    const batchIndex = Math.floor(batchStart / batchSize) + 1
    const remaining = pagesToProcess - batchStart
    const batchCount = Math.min(batchSize, remaining)

    await emit({
      phase: 'chunk',
      fileName: params.fileName,
      pageIndex: batchStart + 1,
      pageTotal: pagesToProcess,
      chunkIndex: batchIndex,
      chunkTotal: batchTotal,
    })

    const chunks = await chunkPdfRange(buffer, batchStart, batchCount)

    const batchResults: ExtractedPage[] = new Array(chunks.length)

    await runWithConcurrency(chunks, concurrency, async (chunk, localIndex) => {
      const pageNumber = chunk.pageIndex + 1
      const baseProgress = {
        fileName: params.fileName,
        pageIndex: pageNumber,
        pageTotal: pagesToProcess,
        chunkIndex: batchIndex,
        chunkTotal: batchTotal,
      }

      const stageTimeout = pageStageTimeoutMs()

      await emit({ phase: 'embedded', ...baseProgress })
      const embedded = await withTimeout(
        extractEmbeddedTextFromPage(chunk.bytes, 0),
        stageTimeout,
        { blocks: [], fullText: '' },
      )

      let ocrText = ''
      const embeddedConfident = embedded.fullText.trim().length >= embeddedMin

      if (!embeddedConfident) {
        await emit({ phase: 'render', ...baseProgress })
        const png = await withTimeout(
          renderPdfPageToPng(chunk.bytes, 0).catch(() => null),
          stageTimeout,
          null,
        )

        if (png) {
          await emit({ phase: 'ocr', ...baseProgress })
          ocrText = await ocrImageWithOpenAI(png, 'image/png', params.fileName, chunk.pageIndex)
        }
      }

      await emit({ phase: 'merge', ...baseProgress })
      const merged = mergePageText({
        pageIndex: chunk.pageIndex,
        embedded,
        ocr: { text: ocrText },
      })

      batchResults[localIndex] = {
        pageIndex: chunk.pageIndex,
        rawText: merged.rawText,
        sheetId: detectSheetId(merged.rawText) || `Page-${pageNumber}`,
      }
    })

    for (const page of batchResults) {
      if (page) allPages.push(page)
    }
  }

  allPages.sort((a, b) => a.pageIndex - b.pageIndex)

  if (!allPages.length) {
    allPages.push({ pageIndex: 0, rawText: '', sheetId: 'Page-1' })
  }

  return { sha256, totalPages, pages: allPages }
}

export async function extractImageFromStorage(params: {
  storagePath: string
  fileName: string
  mimeType?: string | null
  fileContext?: ExtractProgressContext
  onProgress?: (progress: ExtractPdfProgress) => void | Promise<void>
}): Promise<{ sha256: string; totalPages: number; pages: ExtractedPage[] }> {
  const emit = async (progress: ExtractPdfProgress) => {
    await params.onProgress?.({
      ...params.fileContext,
      ...progress,
    })
  }

  await emit({ phase: 'download', fileName: params.fileName })
  const buffer = await downloadClashGapFile(params.storagePath)
  const sha256 = sha256Buffer(buffer)
  const mimeType = params.mimeType || imageMimeType(params.fileName, buffer)

  const base = {
    fileName: params.fileName,
    pageIndex: 1,
    pageTotal: 1,
    chunkIndex: 1,
    chunkTotal: 1,
    ...params.fileContext,
  }

  await emit({ phase: 'ocr', ...base })
  const rawText = await ocrImageWithOpenAI(buffer, mimeType, params.fileName, 0)

  return {
    sha256,
    totalPages: 1,
    pages: [
      {
        pageIndex: 0,
        rawText,
        sheetId: detectSheetId(rawText) || 'Page-1',
      },
    ],
  }
}

export { isImageUpload }
