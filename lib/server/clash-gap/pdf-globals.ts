/**
 * pdfjs (via pdf-parse) expects browser geometry APIs. In Next.js the native
 * @napi-rs/canvas binding may not resolve; the pure-JS geometry polyfill is enough
 * for text extraction.
 */
function installPdfGlobals() {
  if (typeof globalThis.DOMMatrix !== 'undefined') return

  const { DOMMatrix, DOMPoint, DOMRect } = require('@napi-rs/canvas/geometry.js') as {
    DOMMatrix: typeof globalThis.DOMMatrix
    DOMPoint: typeof globalThis.DOMPoint
    DOMRect: typeof globalThis.DOMRect
  }

  globalThis.DOMMatrix = DOMMatrix
  globalThis.DOMPoint = DOMPoint
  globalThis.DOMRect = DOMRect
}

installPdfGlobals()
