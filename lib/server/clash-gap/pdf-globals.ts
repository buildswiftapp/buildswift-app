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
