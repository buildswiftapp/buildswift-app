function letterRatio(text: string): number {
  const letters = text.match(/[a-zA-Z]/g)?.length ?? 0
  return letters / Math.max(1, text.length)
}

function digitRatio(text: string): number {
  const digits = text.match(/[0-9]/g)?.length ?? 0
  return digits / Math.max(1, text.length)
}

function specialCharRatio(text: string): number {
  const special = text.match(/[^\w\s.,;:'"()\-/&]/g)?.length ?? 0
  return special / Math.max(1, text.length)
}

function wordLikeTokenCount(text: string): number {
  return (text.match(/[a-zA-Z]{3,}/g) ?? []).length
}

function looksLikeGarbledCadText(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false

  if (specialCharRatio(trimmed) > 0.08) return true
  if (letterRatio(trimmed) < 0.45 && trimmed.length > 40) return true
  if (letterRatio(trimmed) < 0.55 && digitRatio(trimmed) > 0.06) return true
  if (wordLikeTokenCount(trimmed) < 5 && trimmed.length > 60) return true

  const tokens = trimmed.split(/\s+/).filter(Boolean)
  if (tokens.length >= 6) {
    const singleChar = tokens.filter((t) => t.length === 1).length
    if (singleChar / tokens.length > 0.25) return true
  }

  const punctHeavy = tokens.filter((t) => /[+()[\]{}|\\/<>@#$%^&*=~`'"!?:;]{1,}/.test(t)).length
  if (punctHeavy >= 2 && punctHeavy / Math.max(1, tokens.length) > 0.12) return true

  if (trimmed.length > 50 && wordLikeTokenCount(trimmed) < 6 && specialCharRatio(trimmed) > 0.05) {
    return true
  }

  return false
}

export function isUsableEmbeddedText(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length < 40) return false
  if (looksLikeGarbledCadText(trimmed)) return false
  if (wordLikeTokenCount(trimmed) < 3) return false
  return true
}

export function textQualityScore(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  if (looksLikeGarbledCadText(trimmed)) return 0

  let score = Math.min(1, trimmed.length / 400)
  score += letterRatio(trimmed) * 0.5
  score += Math.min(0.5, wordLikeTokenCount(trimmed) / 20)
  score -= specialCharRatio(trimmed) * 0.8
  return Math.max(0, score)
}

export function pickBestPageText(embedded: string, imageOcr: string): string {
  return pickBestPageTexts(embedded, '', imageOcr)
}

/** Pick the best text from embedded PDF layer, batch Document AI, and high-DPI image OCR. */
export function pickBestPageTexts(embedded: string, docAi: string, imageOcr: string): string {
  const emb = embedded.trim()
  const doc = docAi.trim()
  const img = imageOcr.trim()

  const candidates: Array<{ text: string; score: number }> = []
  if (emb) {
    const score = isUsableEmbeddedText(emb) ? textQualityScore(emb) : textQualityScore(emb) * 0.35
    if (score > 0) candidates.push({ text: emb, score })
  }
  if (doc) candidates.push({ text: doc, score: textQualityScore(doc) })
  if (img) candidates.push({ text: img, score: textQualityScore(img) })

  if (!candidates.length) return ''

  candidates.sort((a, b) => b.score - a.score || b.text.length - a.text.length)
  const best = candidates[0]!
  if (best.score >= 0.2) return best.text

  const longest = [emb, doc, img].sort((a, b) => b.length - a.length)[0]
  return longest ?? best.text
}

/** True when batch/page OCR is too weak and we should render a high-DPI image for Document AI. */
export function needsHighDpiImageOcr(docAiText: string, embeddedText: string): boolean {
  const doc = docAiText.trim()
  const emb = embeddedText.trim()
  const docScore = textQualityScore(doc)

  if (!doc || doc.length < 25) return true
  if (docScore < 0.22) return true
  if (!isUsableEmbeddedText(emb) && docScore < 0.42) return true
  if (looksLikeGarbledCadText(doc)) return true
  return false
}
