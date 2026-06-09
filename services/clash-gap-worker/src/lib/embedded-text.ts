import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'

export type EmbeddedTextBlock = {
  text: string
  x: number
  y: number
  width: number
  height: number
  source: 'embedded'
}

export type EmbeddedTextResult = {
  blocks: EmbeddedTextBlock[]
  fullText: string
}

function stitchBlocksToText(blocks: EmbeddedTextBlock[]): string {
  if (!blocks.length) return ''
  const lines: string[] = []
  let currentLine: string[] = []
  let currentY: number | null = null
  const LINE_TOLERANCE = 4

  for (const block of blocks) {
    if (currentY === null || Math.abs(block.y - currentY) <= LINE_TOLERANCE) {
      currentLine.push(block.text)
      currentY = currentY === null ? block.y : currentY
    } else {
      if (currentLine.length) lines.push(currentLine.join(' ').replace(/\s+/g, ' ').trim())
      currentLine = [block.text]
      currentY = block.y
    }
  }
  if (currentLine.length) lines.push(currentLine.join(' ').replace(/\s+/g, ' ').trim())
  return lines.filter((l) => l.length > 0).join('\n')
}

export async function extractEmbeddedTextFromPage(
  doc: PDFDocumentProxy,
  pageIndex: number,
): Promise<EmbeddedTextResult> {
  const pageNumber = pageIndex + 1
  if (pageNumber > doc.numPages) return { blocks: [], fullText: '' }

  const page = await doc.getPage(pageNumber)
  try {
    const content = await page.getTextContent()
    const blocks: EmbeddedTextBlock[] = []

    for (const raw of content.items as Array<Record<string, unknown>>) {
      const text = typeof raw.str === 'string' ? raw.str : ''
      if (!text || text.trim().length < 1) continue

      const transform = Array.isArray(raw.transform) ? (raw.transform as number[]) : null
      const x = transform && typeof transform[4] === 'number' ? transform[4] : 0
      const y = transform && typeof transform[5] === 'number' ? transform[5] : 0
      const width = typeof raw.width === 'number' ? raw.width : 0
      const height = typeof raw.height === 'number' ? raw.height : 0

      blocks.push({ text, x, y, width, height, source: 'embedded' })
    }

    blocks.sort((a, b) => (b.y === a.y ? a.x - b.x : b.y - a.y))
    return { blocks, fullText: stitchBlocksToText(blocks) }
  } finally {
    await page.cleanup()
  }
}
