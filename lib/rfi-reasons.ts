/**
 * Canonical "Reason for Request" options for RFIs and helpers for serializing
 * them to / from the legacy single-string `metadata.reasonForRequest` shape.
 *
 * Storage strategy
 * ----------------
 * - New: `metadata.reasonsForRequest: string[]` holds the canonical labels and
 *   `metadata.reasonForRequestOther: string` holds any free-text spillover.
 * - Legacy: `metadata.reasonForRequest: string` is still written (joined) so
 *   PDF / HTML / search code that already reads the singular field keeps
 *   working without migration.
 *
 * On read, prefer the array; if only the legacy string exists, parse it back
 * into `{ selected, other }` so existing RFIs are not lost.
 */

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

/** Sentinel value used to represent the "Other (specify)" option. */
export const RFI_REASON_OTHER_VALUE = 'other'
export const RFI_REASON_OTHER_LABEL = 'Other (specify)'

const LABEL_BY_NORMALIZED = new Map<string, string>(
  RFI_REASON_OPTIONS.map((o) => [normalize(o.label), o.label])
)

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Render the user-facing string for the legacy `metadata.reasonForRequest`
 * field by joining canonical labels and the optional "Other" free-text with
 * commas. Empty inputs collapse to an empty string.
 */
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

/**
 * Parse a legacy reason string (or unknown shape) into the new
 * `{ selected, other }` form. Tokens whose normalized form matches a canonical
 * label go into `selected`; everything else is concatenated into `other` so
 * the user's prior wording is never lost.
 */
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

/**
 * Read both shapes from a metadata object and return the canonical
 * `{ selected, other }` pair. Prefers the new array when present.
 */
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
