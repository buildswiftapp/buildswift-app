import '@/lib/server/clash-gap/pdf-globals'
import { createHash } from 'crypto'
import { getOpenAIClient } from '@/lib/server/openai'
import { downloadClashGapFile } from '@/lib/server/clash-gap/storage'
import { getPdfPageCount, renderPdfPageToPng } from '@/lib/server/clash-gap/render-pdf-page'
import { isRetryableNetworkError } from '@/lib/server/clash-gap/errors'

const SHEET_ID_RE = /\b([ASMEPC])[\s-]?(\d{1,3}(?:\.\d{1,2})?)\b/gi

export function sha256Buffer(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

function detectSheetId(text: string): string | null {
  const head = text.slice(0, 1200)
  const matches = [...head.matchAll(SHEET_ID_RE)]
  if (!matches.length) return null
  const m = matches[0]
  return `${m[1].toUpperCase()}${m[2]}`
}

function ocrModel(): string {
  return process.env.OPENAI_OCR_MODEL || process.env.OPENAI_MODEL || 'gpt-4o'
}

/**
 * Send a rendered PNG page to OpenAI vision and return the transcribed plain text.
 */
async function ocrPageWithOpenAI(
  pngBuffer: Buffer,
  fileName: string,
  pageIndex: number,
): Promise<string> {
  const openai = getOpenAIClient()
  if (!openai) return ''

  const base64 = pngBuffer.toString('base64')
  const dataUrl = `data:image/png;base64,${base64}`
  const model = ocrModel()

  const maxAttempts = 3
  let lastError: unknown

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              'You are a precise OCR engine for technical construction drawings and specifications. ' +
              'Transcribe all visible text verbatim. Preserve sheet numbers, callouts, dimensions, ' +
              'notes, and legend entries. Separate logical blocks with a blank line. ' +
              'Output plain text only. Do not describe the drawing. ' +
              'If text is illegible, output [ILLEGIBLE].',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Transcribe all visible text on page ${pageIndex + 1} of "${fileName}".`,
              },
              {
                type: 'image_url',
                image_url: { url: dataUrl, detail: 'high' },
              },
            ],
          },
        ],
      })
      return completion.choices[0]?.message?.content?.trim() || ''
    } catch (error) {
      lastError = error
      if (attempt < maxAttempts - 1 && isRetryableNetworkError(error)) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)))
        continue
      }
      break
    }
  }

  console.error('[ocrPageWithOpenAI] failed after retries:', lastError)
  return ''
}

export type ExtractedPage = {
  pageIndex: number
  rawText: string
  sheetId: string | null
}

export async function extractPdfFromStorage(params: {
  storagePath: string
  fileName: string
  maxPages: number
}): Promise<{ sha256: string; pages: ExtractedPage[] }> {
  const buffer = await downloadClashGapFile(params.storagePath)
  const sha256 = sha256Buffer(buffer)

  const totalPages = await getPdfPageCount(buffer)
  const pagesToProcess = Math.min(totalPages, params.maxPages)

  const pages: ExtractedPage[] = []

  for (let i = 0; i < pagesToProcess; i++) {
    const png = await renderPdfPageToPng(buffer, i)
    const rawText = await ocrPageWithOpenAI(png, params.fileName, i)
    pages.push({
      pageIndex: i,
      rawText,
      sheetId: detectSheetId(rawText) || `Page-${i + 1}`,
    })
  }

  if (!pages.length) {
    pages.push({ pageIndex: 0, rawText: '', sheetId: 'Page-1' })
  }

  return { sha256, pages }
}
