import '@/lib/server/clash-gap/pdf-globals'
import { PDFDocument } from 'pdf-lib'

export type PdfPageChunk = {
  pageIndex: number
  bytes: Buffer
}

export async function chunkPdfByPage(buffer: Buffer): Promise<PdfPageChunk[]> {
  const srcDoc = await PDFDocument.load(new Uint8Array(buffer), {
    ignoreEncryption: true,
    updateMetadata: false,
  })
  const total = srcDoc.getPageCount()
  const chunks: PdfPageChunk[] = []

  for (let i = 0; i < total; i++) {
    const chunkDoc = await PDFDocument.create()
    const [page] = await chunkDoc.copyPages(srcDoc, [i])
    chunkDoc.addPage(page)
    const out = await chunkDoc.save({ useObjectStreams: true })
    chunks.push({ pageIndex: i, bytes: Buffer.from(out) })
  }

  return chunks
}

export async function chunkPdfRange(
  buffer: Buffer,
  startIndex: number,
  count: number,
): Promise<PdfPageChunk[]> {
  const srcDoc = await PDFDocument.load(new Uint8Array(buffer), {
    ignoreEncryption: true,
    updateMetadata: false,
  })
  const total = srcDoc.getPageCount()
  const end = Math.min(total, startIndex + count)
  const chunks: PdfPageChunk[] = []

  for (let i = startIndex; i < end; i++) {
    const chunkDoc = await PDFDocument.create()
    const [page] = await chunkDoc.copyPages(srcDoc, [i])
    chunkDoc.addPage(page)
    const out = await chunkDoc.save({ useObjectStreams: true })
    chunks.push({ pageIndex: i, bytes: Buffer.from(out) })
  }

  return chunks
}
