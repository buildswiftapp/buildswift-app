import '@/lib/server/clash-gap/pdf-globals'
import { loadPdfjs } from '@/lib/server/clash-gap/render-pdf-page'

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

const MIN_BLOCK_LENGTH = 1

export async function extractEmbeddedTextFromPage(
  buffer: Buffer,
  pageIndex: number,
): Promise<EmbeddedTextResult> {
  const pdfjs = await loadPdfjs()

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
    verbosity: 0,
  })

  const pdf = await loadingTask.promise
  try {
    const pageNumber = pageIndex + 1
    if (pageNumber > pdf.numPages) {
      return { blocks: [], fullText: '' }
    }

    const page = await pdf.getPage(pageNumber)
    try {
      const content = await page.getTextContent()
      const blocks: EmbeddedTextBlock[] = []

      for (const raw of content.items as Array<Record<string, unknown>>) {
        const text = typeof raw.str === 'string' ? raw.str : ''
        if (!text || text.trim().length < MIN_BLOCK_LENGTH) continue

        const transform = Array.isArray(raw.transform) ? (raw.transform as number[]) : null
        const x = transform && typeof transform[4] === 'number' ? transform[4] : 0
        const y = transform && typeof transform[5] === 'number' ? transform[5] : 0
        const width = typeof raw.width === 'number' ? (raw.width as number) : 0
        const height = typeof raw.height === 'number' ? (raw.height as number) : 0

        blocks.push({ text, x, y, width, height, source: 'embedded' })
      }

      blocks.sort((a, b) => (b.y === a.y ? a.x - b.x : b.y - a.y))

      const fullText = stitchBlocksToText(blocks)
      return { blocks, fullText }
    } finally {
      await page.cleanup()
    }
  } finally {
    await pdf.destroy()
  }
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
