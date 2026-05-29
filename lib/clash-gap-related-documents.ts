import type { ClashGapIssue, DocumentUploadRow, IssueSourceReference } from '@/lib/clash-gap-types'

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

function isSpecSource(label: string): boolean {
  return /spec|section|addendum/i.test(label)
}

function isDrawingSource(label: string): boolean {
  return /draw|plan|sheet/i.test(label)
}

function planRows(rows: DocumentUploadRow[]): DocumentUploadRow[] {
  return rows.filter((r) => r.type === 'plans')
}

function specRows(rows: DocumentUploadRow[]): DocumentUploadRow[] {
  return rows.filter((r) => r.type === 'specs' || r.type === 'addenda')
}

function matchPlanFile(
  plans: DocumentUploadRow[],
  sheetRef: string,
): DocumentUploadRow | undefined {
  const ref = sheetRef.trim()
  if (!ref) return plans.length === 1 ? plans[0] : undefined
  const compact = ref.toLowerCase().replace(/\s/g, '')
  return (
    plans.find((r) => {
      const fn = r.filename.toLowerCase().replace(/\s/g, '')
      return fn.includes(compact) || compact.includes(fn.replace(/\.pdf$/, ''))
    }) ?? (plans.length === 1 ? plans[0] : undefined)
  )
}

function shortenPageRef(page: string, max = 48): string {
  const p = page.trim()
  if (p.length <= max) return p
  return `${p.slice(0, max - 1)}…`
}

function formatChip(filename: string, pageRef: string): string {
  const page = pageRef.trim()
  if (!page) return filename
  if (normalizeKey(page) === normalizeKey(filename)) return filename
  return `${filename} — p. ${page}`
}

function labelFromSource(
  src: IssueSourceReference,
  issue: ClashGapIssue,
  plans: DocumentUploadRow[],
  specs: DocumentUploadRow[],
): string {
  const pageStr = String(src.page ?? '').trim()
  const label = src.documentLabel.trim()

  if (isSpecSource(label)) {
    const specFile =
      specs.length === 1
        ? specs[0]
        : specs.find((f) => {
            const needle = pageStr.slice(0, 12).toLowerCase()
            return needle.length > 0 && f.filename.toLowerCase().includes(needle)
          })
    if (specFile) {
      const section =
        pageStr.match(/\d{2}\s+\d{2}\s+\d{2}/)?.[0] ??
        (pageStr.length > 0 ? shortenPageRef(pageStr, 40) : 'spec')
      return formatChip(specFile.filename, section)
    }
    return pageStr
      ? `${label} — p. ${shortenPageRef(pageStr)}`
      : label
  }

  if (isDrawingSource(label)) {
    const sheetRef = pageStr || issue.sheetReference?.trim() || ''
    const planFile = matchPlanFile(plans, sheetRef)
    if (planFile) {
      const page =
        sheetRef ||
        planFile.filename.match(/\b[A-Z]\d{1,3}(?:\.\d{1,2})?\b/i)?.[0] ||
        ''
      return formatChip(planFile.filename, page)
    }
    return sheetRef ? `${label} — p. ${sheetRef}` : label
  }

  return pageStr ? `${label} — p. ${shortenPageRef(pageStr)}` : label
}

export function buildRelatedDocumentLabels(
  issue: ClashGapIssue,
  uploadRows: DocumentUploadRow[],
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const add = (entry: string) => {
    const trimmed = entry.trim()
    const key = normalizeKey(trimmed)
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push(trimmed)
  }

  const plans = planRows(uploadRows)
  const specs = specRows(uploadRows)

  for (const src of issue.sources) {
    add(labelFromSource(src, issue, plans, specs))
  }

  if (issue.sheetReference?.trim()) {
    const planFile = matchPlanFile(plans, issue.sheetReference)
    if (planFile) {
      add(formatChip(planFile.filename, issue.sheetReference.trim()))
    }
  }

  return out.slice(0, 16)
}

export function relatedDocumentsFromLabels(labels: string[]): string {
  return labels.join('\n')
}

export function labelsFromRelatedDocuments(relatedDocuments: string): string[] {
  return relatedDocuments
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}
