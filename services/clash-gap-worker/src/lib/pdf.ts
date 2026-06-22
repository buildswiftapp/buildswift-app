import { createCanvas, type Canvas } from '@napi-rs/canvas'
import { getDocument, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { config } from '../config.js'

declare global {
  interface Map<K, V> {
    getOrInsertComputed?(key: K, cb: () => V): V
  }
}

const mapProto = Map.prototype as Map<unknown, unknown> & {
  getOrInsertComputed?: (key: unknown, cb: () => unknown) => unknown
}
if (!mapProto.getOrInsertComputed) {
  mapProto.getOrInsertComputed = function (key: unknown, cb: () => unknown) {
    if (this.has(key)) return this.get(key)
    const v = cb()
    this.set(key, v)
    return v
  }
}

export async function openPdfDocument(buffer: Buffer): Promise<PDFDocumentProxy> {
  return getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise
}

function viewportForPage(
  page: Awaited<ReturnType<PDFDocumentProxy['getPage']>>,
  dpi: number,
  maxWidth = config.chunkMaxImageWidth,
) {
  let scale = dpi / 72
  let viewport = page.getViewport({ scale })
  if (maxWidth > 0 && viewport.width > maxWidth) {
    scale *= maxWidth / viewport.width
    viewport = page.getViewport({ scale })
  }
  return viewport
}

function canvasToJpeg(canvas: Canvas, qualityPercent = config.chunkJpegQuality): Buffer {
  const quality = Math.min(1, Math.max(0.5, qualityPercent / 100))
  return canvas.toBuffer('image/jpeg', quality)
}

async function renderPage(
  doc: PDFDocumentProxy,
  pageIndex: number,
  dpi: number,
  options?: { maxWidth?: number },
): Promise<Canvas> {
  const page = await doc.getPage(pageIndex + 1)
  try {
    const viewport = viewportForPage(page, dpi, options?.maxWidth)
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
    const ctx = canvas.getContext('2d')
    await page.render({
      canvas: canvas as never,
      canvasContext: ctx as never,
      viewport,
    }).promise
    return canvas
  } finally {
    await page.cleanup()
  }
}

export async function renderPageToJpeg(
  doc: PDFDocumentProxy,
  pageIndex: number,
  dpi: number,
  options?: { maxWidth?: number; jpegQuality?: number },
): Promise<Buffer> {
  const canvas = await renderPage(doc, pageIndex, dpi, options)
  return canvasToJpeg(canvas, options?.jpegQuality)
}

export async function renderPageToPng(
  doc: PDFDocumentProxy,
  pageIndex: number,
  dpi: number,
  options?: { maxWidth?: number },
): Promise<Buffer> {
  const canvas = await renderPage(doc, pageIndex, dpi, options)
  return canvas.toBuffer('image/png')
}
