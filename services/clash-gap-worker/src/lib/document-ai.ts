import { DocumentProcessorServiceClient } from '@google-cloud/documentai'
import { config, isDocumentAiConfigured } from '../config.js'

type TextSegment = { startIndex?: number | string | null; endIndex?: number | string | null }
type TextAnchor = { textSegments?: TextSegment[] | null }
type Layout = { textAnchor?: TextAnchor | null }
type TableCell = { layout?: Layout | null }
type TableRow = { cells?: TableCell[] | null }
type Table = { headerRows?: TableRow[] | null; bodyRows?: TableRow[] | null }
type Block = { layout?: Layout | null }
type Paragraph = { layout?: Layout | null }
type Page = {
  blocks?: Block[] | null
  paragraphs?: Paragraph[] | null
  lines?: { layout?: Layout | null }[] | null
  tables?: Table[] | null
}
type Document = {
  text?: string | null
  pages?: Page[] | null
}

let client: DocumentProcessorServiceClient | null = null

function getClient(): DocumentProcessorServiceClient {
  if (!client) client = new DocumentProcessorServiceClient()
  return client
}

function processorName(): string {
  return `projects/${config.documentAiProjectId}/locations/${config.documentAiLocation}/processors/${config.documentAiProcessorId}`
}

function textFromAnchor(fullText: string, anchor?: TextAnchor | null): string {
  if (!anchor?.textSegments?.length) return ''
  return anchor.textSegments
    .map((seg) => {
      const start = Number(seg.startIndex ?? 0)
      const end = Number(seg.endIndex ?? fullText.length)
      return fullText.slice(start, end)
    })
    .join('')
}

function extractTablesFromPage(fullText: string, page?: Page | null): string {
  if (!page?.tables?.length) return ''
  const sections: string[] = []

  for (const table of page.tables) {
    const rows: string[] = []
    const allRows = [...(table.headerRows ?? []), ...(table.bodyRows ?? [])]
    for (const row of allRows) {
      const cells =
        row.cells?.map((cell) => textFromAnchor(fullText, cell.layout?.textAnchor).trim()) ?? []
      if (cells.some((c) => c.length > 0)) rows.push(cells.join(' | '))
    }
    if (rows.length) sections.push(`[TABLE]\n${rows.join('\n')}`)
  }

  return sections.join('\n\n')
}

function extractPageText(document: Document, pageIndex: number): string {
  const fullText = document.text ?? ''
  const page = document.pages?.[pageIndex]
  if (!page) return fullText.trim()

  const parts: string[] = []

  for (const block of page.blocks ?? []) {
    const text = textFromAnchor(fullText, block.layout?.textAnchor).trim()
    if (text) parts.push(text)
  }

  if (!parts.length) {
    for (const paragraph of page.paragraphs ?? []) {
      const text = textFromAnchor(fullText, paragraph.layout?.textAnchor).trim()
      if (text) parts.push(text)
    }
  }

  if (!parts.length) {
    for (const line of page.lines ?? []) {
      const text = textFromAnchor(fullText, line.layout?.textAnchor).trim()
      if (text) parts.push(text)
    }
  }

  const tables = extractTablesFromPage(fullText, page)
  if (tables) parts.push(tables)

  const joined = parts.join('\n\n').trim()
  if (joined) return joined

  // Single-page image OCR sometimes only populates document.text
  if ((document.pages?.length ?? 0) <= 1 && fullText.trim()) {
    return fullText.trim()
  }

  return ''
}

function pageTextsFromDocument(document: Document): Map<number, string> {
  const out = new Map<number, string>()
  const pageCount = document.pages?.length ?? 0
  for (let i = 0; i < pageCount; i++) {
    const text = extractPageText(document, i)
    if (text) out.set(i, text)
  }
  return out
}

async function processRawDocument(content: Buffer, mimeType: string): Promise<Document> {
  if (!isDocumentAiConfigured()) {
    throw new Error('Document AI is not configured')
  }

  const [result] = await getClient().processDocument({
    name: processorName(),
    rawDocument: { content, mimeType },
  })

  if (!result.document) throw new Error('Document AI returned no document')
  return result.document as Document
}

export async function processPdfWithDocumentAi(pdfBuffer: Buffer): Promise<Map<number, string>> {
  const document = await processRawDocument(pdfBuffer, 'application/pdf')
  return pageTextsFromDocument(document)
}

export async function processImageWithDocumentAi(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<string> {
  const document = await processRawDocument(imageBuffer, mimeType)
  const pages = pageTextsFromDocument(document)
  if (pages.has(0)) return pages.get(0)!
  return (document.text ?? '').trim()
}

export function documentAiStatus(): { configured: boolean; processor?: string } {
  if (!isDocumentAiConfigured()) return { configured: false }
  return { configured: true, processor: processorName() }
}
