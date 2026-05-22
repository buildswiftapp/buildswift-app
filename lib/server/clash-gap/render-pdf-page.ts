/**
 * Render a single PDF page to a PNG buffer using pdfjs-dist + @napi-rs/canvas.
 * pdfjs-dist is bundled by Next.js (ESM). @napi-rs/canvas stays in serverExternalPackages.
 *
 * Worker setup: pdfjs-dist uses a "fake worker" (in-process fallback) in Node.js because
 * there is no global `Worker` API. The fake worker internally does `await import(workerSrc)`.
 * When pdfjs is bundled by Turbopack/webpack, that relative import would look for the worker
 * next to the bundle in .next/…/chunks/, where it doesn't exist.
 * Fix: point GlobalWorkerOptions.workerSrc at the real file:// URL in node_modules so the
 * fake worker's import() resolves regardless of where the main bundle lives.
 */

import '@/lib/server/clash-gap/pdf-globals'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

type PdfJsModule = typeof import('pdfjs-dist')

let pdfjsPromise: Promise<PdfJsModule> | null = null

async function loadPdfjs(): Promise<PdfJsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = (import('pdfjs-dist/legacy/build/pdf.mjs') as Promise<PdfJsModule>).then(
      (pdfjs) => {
        const workerPath = resolve(
          process.cwd(),
          'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
        )
        pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href
        return pdfjs
      },
    )
  }
  return pdfjsPromise
}

function loadCanvas() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@napi-rs/canvas') as typeof import('@napi-rs/canvas')
}

function renderScale(): number {
  return Number(process.env.CLASH_GAP_RENDER_SCALE || 2)
}

/**
 * Render one 0-based page index of a PDF buffer to a PNG Buffer.
 * Opens and destroys its own PDFDocumentProxy to keep memory bounded per call.
 */
export async function renderPdfPageToPng(
  buffer: Buffer,
  pageIndex: number,
  scale?: number,
): Promise<Buffer> {
  const pdfjs = await loadPdfjs()
  const { createCanvas } = loadCanvas()

  const effectiveScale = scale ?? renderScale()

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
      throw new Error(
        `Page ${pageNumber} out of range (PDF has ${pdf.numPages} page(s))`,
      )
    }

    const page = await pdf.getPage(pageNumber)
    try {
      const viewport = page.getViewport({ scale: effectiveScale })
      const width = Math.ceil(viewport.width)
      const height = Math.ceil(viewport.height)

      const canvas = createCanvas(width, height)
      const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D

      await page.render({ canvasContext: ctx, viewport }).promise

      return canvas.toBuffer('image/png') as Buffer
    } finally {
      await page.cleanup()
    }
  } finally {
    await pdf.destroy()
  }
}

/**
 * Return the total page count of a PDF without rendering.
 */
export async function getPdfPageCount(buffer: Buffer): Promise<number> {
  const pdfjs = await loadPdfjs()

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
    verbosity: 0,
  })

  const pdf = await loadingTask.promise
  const count = pdf.numPages
  await pdf.destroy()
  return count
}
