import { ImageAnnotatorClient } from '@google-cloud/vision'

let client: ImageAnnotatorClient | null = null

function getClient(): ImageAnnotatorClient {
  if (!client) client = new ImageAnnotatorClient()
  return client
}

function textFromFullAnnotation(fullText: string | null | undefined): string {
  return (fullText ?? '').trim()
}

export async function ocrImageWithVision(imageBuffer: Buffer): Promise<string> {
  const [result] = await getClient().documentTextDetection({
    image: { content: imageBuffer },
  })

  const docText = textFromFullAnnotation(result.fullTextAnnotation?.text)
  if (docText) return docText

  const annotations = result.textAnnotations
  if (annotations?.length) {
    return textFromFullAnnotation(annotations[0]?.description)
  }

  return ''
}

export function visionOcrStatus(): { configured: boolean; engine: string } {
  return {
    configured: true,
    engine: 'google-cloud-vision-document-text',
  }
}
