import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { openPdfDocument } from './pdf.js'
import { sb } from '../supabase.js'
import { config } from '../config.js'

type CachedPdf = {
  doc: PDFDocumentProxy
  buffer: Buffer
}

export class PdfCache {
  private readonly cache = new Map<string, CachedPdf>()
  private readonly loading = new Map<string, Promise<CachedPdf>>()

  async get(fileId: string, storagePath: string): Promise<CachedPdf> {
    const hit = this.cache.get(fileId)
    if (hit) return hit

    const pending = this.loading.get(fileId)
    if (pending) return pending

    const promise = (async () => {
      const { data: blob, error } = await sb()
        .storage.from(config.storageBucket)
        .download(storagePath)
      if (error || !blob) throw new Error(error?.message || `PDF download failed: ${storagePath}`)

      const buffer = Buffer.from(await blob.arrayBuffer())
      const doc = await openPdfDocument(buffer)
      const entry = { doc, buffer }
      this.cache.set(fileId, entry)
      return entry
    })()

    this.loading.set(fileId, promise)
    try {
      return await promise
    } finally {
      this.loading.delete(fileId)
    }
  }

  async destroyAll(): Promise<void> {
    await Promise.all([...this.cache.values()].map(({ doc }) => doc.destroy().catch(() => {})))
    this.cache.clear()
  }
}
