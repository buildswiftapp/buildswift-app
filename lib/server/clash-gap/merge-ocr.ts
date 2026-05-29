import type { EmbeddedTextBlock } from '@/lib/server/clash-gap/embedded-text'

export type OcrTextResult = {
  text: string
  confidence?: number
}

export type MergedPageText = {
  pageIndex: number
  rawText: string
  embeddedTextLength: number
  ocrTextLength: number
  hasEmbedded: boolean
  hasOcr: boolean
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

function tokenize(text: string): Set<string> {
  const tokens = new Set<string>()
  const lower = text.toLowerCase()
  const re = /[a-z0-9][a-z0-9\-./]{2,}/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(lower)) !== null) {
    tokens.add(match[0])
  }
  return tokens
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const token of a) {
    if (b.has(token)) intersection++
  }
  const union = a.size + b.size - intersection
  return union > 0 ? intersection / union : 0
}

export function mergePageText(params: {
  pageIndex: number
  embedded: { blocks: EmbeddedTextBlock[]; fullText: string }
  ocr: OcrTextResult
}): MergedPageText {
  const embeddedText = normalizeWhitespace(params.embedded.fullText)
  const ocrText = normalizeWhitespace(params.ocr.text)

  const hasEmbedded = embeddedText.length > 0
  const hasOcr = ocrText.length > 0

  let rawText = ''

  if (hasEmbedded && hasOcr) {
    const embeddedTokens = tokenize(embeddedText)
    const ocrTokens = tokenize(ocrText)
    const similarity = jaccardSimilarity(embeddedTokens, ocrTokens)

    if (similarity > 0.7) {
      rawText = embeddedText.length >= ocrText.length ? embeddedText : ocrText
    } else {
      const ocrOnlyTokens: string[] = []
      for (const token of ocrTokens) {
        if (!embeddedTokens.has(token)) ocrOnlyTokens.push(token)
      }
      const ocrAddsNewContent = ocrOnlyTokens.length / Math.max(1, ocrTokens.size) > 0.2

      rawText = ocrAddsNewContent
        ? `${embeddedText}\n\n--- OCR-only content ---\n${ocrText}`
        : embeddedText
    }
  } else if (hasEmbedded) {
    rawText = embeddedText
  } else if (hasOcr) {
    rawText = ocrText
  }

  return {
    pageIndex: params.pageIndex,
    rawText,
    embeddedTextLength: embeddedText.length,
    ocrTextLength: ocrText.length,
    hasEmbedded,
    hasOcr,
  }
}
