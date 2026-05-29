import '@/lib/server/clash-gap/pdf-globals'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

type PdfJsModule = typeof import('pdfjs-dist')

let pdfjsPromise: Promise<PdfJsModule> | null = null

export async function loadPdfjs(): Promise<PdfJsModule> {
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

async function loadCanvas() {
  return import('@napi-rs/canvas')
}

function renderScale(): number {
  return Number(process.env.CLASH_GAP_RENDER_SCALE || 2)
}

type PdfDocument = Awaited<ReturnType<PdfJsModule['getDocument']>['promise']>

export async function withPdfDocument<T>(
  buffer: Buffer,
  fn: (pdf: PdfDocument) => Promise<T>,
): Promise<T> {
  const pdfjs = await loadPdfjs()
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
    verbosity: 0,
  })
  const pdf = await loadingTask.promise
  try {
    return await fn(pdf)
  } finally {
    await pdf.destroy()
  }
}

export async function renderPdfPageFromDoc(
  pdf: PdfDocument,
  pageIndex: number,
  scale?: number,
): Promise<Buffer> {
  const { createCanvas } = await loadCanvas()
  const effectiveScale = scale ?? renderScale()

  const pageNumber = pageIndex + 1
  if (pageNumber > pdf.numPages) {
    throw new Error(`Page ${pageNumber} out of range (PDF has ${pdf.numPages} page(s))`)
  }

  const page = await pdf.getPage(pageNumber)
  try {
    const viewport = page.getViewport({ scale: effectiveScale })
    const width = Math.ceil(viewport.width)
    const height = Math.ceil(viewport.height)

    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D

    await page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: ctx,
      viewport,
    }).promise

    return canvas.toBuffer('image/png') as Buffer
  } finally {
    await page.cleanup()
  }
}

export async function renderPdfPageToPng(
  buffer: Buffer,
  pageIndex: number,
  scale?: number,
): Promise<Buffer> {
  return withPdfDocument(buffer, (pdf) => renderPdfPageFromDoc(pdf, pageIndex, scale))
}

export async function getPdfPageCount(buffer: Buffer): Promise<number> {
  return withPdfDocument(buffer, async (pdf) => pdf.numPages)
}
