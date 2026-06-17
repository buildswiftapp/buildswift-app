import { ImageAnnotatorClient } from '@google-cloud/vision'
import { normalizeOcrText } from './text-normalize.js'

type Vertex = { x?: number | null; y?: number | null }
type BoundingPoly = { vertices?: Vertex[] | null }
type Symbol = { text?: string | null }
type Word = { symbols?: Symbol[] | null; boundingBox?: BoundingPoly | null }
type Paragraph = { words?: Word[] | null; boundingBox?: BoundingPoly | null }
type Block = { paragraphs?: Paragraph[] | null; boundingBox?: BoundingPoly | null }
type Page = { blocks?: Block[] | null }
type FullTextAnnotation = {
  text?: string | null
  pages?: Page[] | null
}

export type VisionTextBlock = {
  label: string
  text: string
  y: number
  x: number
}

export type VisionOcrResult = {
  text: string
  blocks: VisionTextBlock[]
}

let client: ImageAnnotatorClient | null = null

function getClient(): ImageAnnotatorClient {
  if (!client) client = new ImageAnnotatorClient()
  return client
}

function boxTopLeft(box?: BoundingPoly | null): { y: number; x: number } {
  const v = box?.vertices?.[0]
  return { y: v?.y ?? 0, x: v?.x ?? 0 }
}

function paragraphText(paragraph: Paragraph): string {
  const words: string[] = []
  for (const word of paragraph.words ?? []) {
    const symbols = word.symbols ?? []
    const wordText = symbols.map((s) => s.text ?? '').join('')
    if (wordText) words.push(wordText)
  }
  return words.join(' ')
}

function blocksFromAnnotation(annotation: FullTextAnnotation): VisionTextBlock[] {
  const blocks: VisionTextBlock[] = []
  let index = 0

  for (const page of annotation.pages ?? []) {
    for (const block of page.blocks ?? []) {
      const lines: string[] = []
      for (const paragraph of block.paragraphs ?? []) {
        const line = paragraphText(paragraph).trim()
        if (line) lines.push(line)
      }
      if (!lines.length) continue
      const pos = boxTopLeft(block.boundingBox)
      index += 1
      blocks.push({
        label: `block_${index}`,
        text: lines.join('\n'),
        y: pos.y,
        x: pos.x,
      })
    }
  }

  blocks.sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))
  return blocks
}

function textFromBlocks(blocks: VisionTextBlock[]): string {
  return blocks.map((b) => b.text).join('\n\n')
}

function parseAnnotation(annotation: FullTextAnnotation | null | undefined): VisionOcrResult {
  if (!annotation) return { text: '', blocks: [] }

  const visionBlocks = blocksFromAnnotation(annotation)
  if (visionBlocks.length) {
    return {
      text: normalizeOcrText(textFromBlocks(visionBlocks)),
      blocks: visionBlocks,
    }
  }

  const flat = normalizeOcrText(annotation.text ?? '')
  if (!flat) return { text: '', blocks: [] }

  return {
    text: flat,
    blocks: [{ label: 'full_page', text: flat, y: 0, x: 0 }],
  }
}

export async function ocrImageWithVisionDetailed(imageBuffer: Buffer): Promise<VisionOcrResult> {
  const [result] = await getClient().documentTextDetection({
    image: { content: imageBuffer },
    imageContext: { languageHints: ['en'] },
  })

  const parsed = parseAnnotation(result.fullTextAnnotation as FullTextAnnotation | undefined)
  if (parsed.text) return parsed

  const fallback = (result.textAnnotations?.[0]?.description ?? '').trim()
  if (!fallback) return { text: '', blocks: [] }

  const text = normalizeOcrText(fallback)
  return { text, blocks: [{ label: 'full_page', text, y: 0, x: 0 }] }
}

export async function ocrImageWithVision(imageBuffer: Buffer): Promise<string> {
  const result = await ocrImageWithVisionDetailed(imageBuffer)
  return result.text
}

export function visionOcrStatus(): { configured: boolean; engine: string } {
  return {
    configured: true,
    engine: 'google-cloud-vision-document-text',
  }
}
