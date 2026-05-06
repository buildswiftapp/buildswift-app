import { createRequire } from 'module'
import path from 'path'
import { Font } from '@react-pdf/renderer'

const require = createRequire(import.meta.url)

let registered = false

/**
 * Registers an Arial-compatible family for React-PDF output (Apache-licensed Arimo TTF sources,
 * distributed via @fontsource/arimo). PDF text uses `fontFamily: 'Arial'` throughout the app.
 */
export function registerPdfArialFonts(): void {
  if (registered) return
  registered = true

  const pkgDir = path.dirname(require.resolve('@fontsource/arimo/package.json'))
  const file = (name: string) => path.join(pkgDir, 'files', name)

  Font.register({
    family: 'Arial',
    fonts: [
      { src: file('arimo-latin-400-normal.woff2'), fontWeight: 400, fontStyle: 'normal' },
      { src: file('arimo-latin-500-normal.woff2'), fontWeight: 500, fontStyle: 'normal' },
      { src: file('arimo-latin-600-normal.woff2'), fontWeight: 600, fontStyle: 'normal' },
      { src: file('arimo-latin-700-normal.woff2'), fontWeight: 700, fontStyle: 'normal' },
      { src: file('arimo-latin-700-normal.woff2'), fontWeight: 800, fontStyle: 'normal' },
      { src: file('arimo-latin-400-italic.woff2'), fontWeight: 400, fontStyle: 'italic' },
      { src: file('arimo-latin-700-italic.woff2'), fontWeight: 700, fontStyle: 'italic' },
    ],
  })
}
