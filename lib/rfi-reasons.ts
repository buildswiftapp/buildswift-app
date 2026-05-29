export type RfiReasonOption = { value: string; label: string }

export const RFI_REASON_OPTIONS: ReadonlyArray<RfiReasonOption> = [
  { value: 'drawing_conflict', label: 'Drawing Conflict' },
  { value: 'specification_clarification', label: 'Specification Clarification' },
  { value: 'missing_information', label: 'Missing Information' },
  { value: 'constructability_issue', label: 'Constructability Issue' },
  { value: 'design_change', label: 'Design Change' },
  { value: 'code_compliance', label: 'Code Compliance' },
  { value: 'field_conflict', label: 'Field Conflict' },
  { value: 'material_substitution', label: 'Material Substitution' },
  { value: 'owner_request', label: 'Owner Request' },
]

export const RFI_REASON_OTHER_VALUE = 'other'
export const RFI_REASON_OTHER_LABEL = 'Other (specify)'

const LABEL_BY_NORMALIZED = new Map<string, string>(
  RFI_REASON_OPTIONS.map((o) => [normalize(o.label), o.label])
)

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function joinReasons(selected: ReadonlyArray<string>, other: string | null | undefined): string {
  const labels: string[] = []
  for (const label of selected) {
    const t = (label ?? '').trim()
    if (t) labels.push(t)
  }
  const otherText = (other ?? '').trim()
  if (otherText) labels.push(otherText)
  return labels.join(', ')
}

export function parseLegacyReasons(raw: unknown): { selected: string[]; other: string } {
  if (raw == null) return { selected: [], other: '' }
  const text = typeof raw === 'string' ? raw : String(raw)
  const tokens = text
    .split(/\s*,\s*/g)
    .map((t) => t.trim())
    .filter(Boolean)
  const selected: string[] = []
  const otherBits: string[] = []
  const seen = new Set<string>()
  for (const token of tokens) {
    const canonical = LABEL_BY_NORMALIZED.get(normalize(token))
    if (canonical) {
      if (!seen.has(canonical)) {
        seen.add(canonical)
        selected.push(canonical)
      }
    } else {
      otherBits.push(token)
    }
  }
  return { selected, other: otherBits.join(', ') }
}

export function readReasonsFromMetadata(metadata: Record<string, unknown> | null | undefined): {
  selected: string[]
  other: string
} {
  if (!metadata) return { selected: [], other: '' }
  const arr = metadata.reasonsForRequest
  if (Array.isArray(arr)) {
    const selected: string[] = []
    const seen = new Set<string>()
    for (const v of arr) {
      const s = typeof v === 'string' ? v.trim() : ''
      if (!s) continue
      const canonical = LABEL_BY_NORMALIZED.get(normalize(s)) ?? s
      if (!seen.has(canonical)) {
        seen.add(canonical)
        selected.push(canonical)
      }
    }
    const other =
      typeof metadata.reasonForRequestOther === 'string'
        ? metadata.reasonForRequestOther.trim()
        : ''
    return { selected, other }
  }
  return parseLegacyReasons(metadata.reasonForRequest)
}
