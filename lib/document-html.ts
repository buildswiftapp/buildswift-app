/** Shared HTML builders + parsers for RFI / Submittal / Change Order documents. */

export const CO_REASON_OPTIONS = [
  { value: 'owner_request', label: 'Owner Request' },
  { value: 'design_change', label: 'Design Change' },
  { value: 'field_conditions', label: 'Field Conditions' },
  { value: 'code_requirement', label: 'Code Requirement' },
  { value: 'value_engineering', label: 'Value Engineering' },
  { value: 'other', label: 'Other' },
] as const

export const CO_SCHEDULE_OPTIONS = [
  { value: 'none', label: 'No Impact' },
  { value: '+1', label: '+ 1 day' },
  { value: '+2', label: '+ 2 days' },
  { value: '+3', label: '+ 3 days' },
  { value: '+5', label: '+ 5 days' },
  { value: '+7', label: '+ 7 days' },
  { value: '+14', label: '+ 14 days' },
  { value: '+30', label: '+ 30 days' },
  { value: 'tbd', label: 'TBD' },
] as const

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function stripSimpleHtml(s: string) {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export function strongField(html: string, label: string): string {
  const re = new RegExp(`<strong>${escapeRe(label)}:</strong>\\s*([^<]*)`, 'i')
  const m = html.match(re)
  return m?.[1]?.trim() ?? ''
}

export function extractH3Block(html: string, heading: string): string {
  const esc = escapeRe(heading)
  const re = new RegExp(`<h3>\\s*${esc}\\s*</h3>\\s*([\\s\\S]*?)(?=<h3>|$)`, 'i')
  const m = html.match(re)
  if (!m) return ''
  return stripSimpleHtml(m[1])
}

export function parseLongDateToIso(dateLine: string): string {
  if (!dateLine.trim()) return ''
  const t = Date.parse(dateLine.trim())
  if (Number.isNaN(t)) return ''
  return new Date(t).toISOString().slice(0, 10)
}

export function formatUsd(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function parseMoneyInput(raw: string): number {
  const n = parseFloat(String(raw).replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/** Long-form date for RFI / submittal header lines (matches prior HTML exports). */
export function formatLongDateFromIso(dateIso: string): string {
  if (!dateIso.trim()) return ''
  const t = Date.parse(dateIso.trim() + 'T12:00:00')
  if (Number.isNaN(t)) return ''
  return new Date(t).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Header block only (stored in `title` / `doc_number` / metadata separately; composed for PDFs / legacy). */
export function buildRfiHeaderHtml(values: {
  number: string
  title: string
  date: string
  projectName: string
}): string {
  const dateLong = formatLongDateFromIso(values.date)
  return `<h2>Request for Information</h2>
<p><strong>RFI Number:</strong> ${values.number}</p>
<p><strong>Date:</strong> ${dateLong}</p>
<p><strong>Project:</strong> ${values.projectName}</p>
<p><strong>Title:</strong> ${values.title}</p>`
}

/**
 * Body HTML only — stored in `document.description` while `title`, `doc_number`,
 * and `metadata.rfiDate` / `metadata.question` / `metadata.notes` hold the rest.
 */
export function buildRfiDescriptionBody(values: {
  question: string
  description: string
  notes: string
}): string {
  const q = values.question.trim()
  const d = values.description.trim()
  const notes = values.notes.trim()
  let main = ''
  if (q && q !== d) {
    main = `<h3>Question</h3><p>${q}</p><h3>Description / Context</h3><p>${d}</p>`
  } else {
    main = `<h3>Questions / descriptions</h3><p>${q || d}</p>`
  }
  const notesBlock = notes ? `<h3>Notes</h3><p>${notes}</p>` : ''
  return main + notesBlock
}

/** Full printable HTML (header + body) — previews, exports, and legacy rows. */
export function buildRfiHtml(values: {
  number: string
  title: string
  date: string
  projectName: string
  question: string
  description: string
  notes: string
}): string {
  return (
    buildRfiHeaderHtml({
      number: values.number,
      title: values.title,
      date: values.date,
      projectName: values.projectName,
    }) + buildRfiDescriptionBody(values)
  )
}

/**
 * If `description` already contains the legacy header (`RFI Number:`), return as-is.
 * Otherwise prepend a header from document row + metadata (body-only storage).
 */
export function ensureRfiFullDescriptionHtml(
  doc: { title: string; description: string; doc_number: string | null },
  metadata: Record<string, unknown>,
  projectName: string
): string {
  const raw = doc.description || ''
  if (/<strong>\s*RFI Number\s*:/i.test(raw)) return raw
  const dateIso =
    (typeof metadata.rfiDate === 'string' && metadata.rfiDate) ||
    (typeof metadata.documentDate === 'string' && metadata.documentDate) ||
    ''
  const safeDate = dateIso || new Date().toISOString().slice(0, 10)
  const num = (doc.doc_number && doc.doc_number.trim()) || 'RFI-001'
  return (
    buildRfiHeaderHtml({
      number: num,
      title: doc.title,
      date: safeDate,
      projectName,
    }) + raw
  )
}

export function buildSubmittalHeaderHtml(values: {
  number: string
  title: string
  date: string
  projectName: string
  specSection: string
  manufacturer: string
  productName: string
}): string {
  const dateLong = formatLongDateFromIso(values.date)
  return `<h2>Product Submittal</h2>
<p><strong>Submittal Number:</strong> ${values.number}</p>
<p><strong>Date:</strong> ${dateLong}</p>
<p><strong>Project:</strong> ${values.projectName}</p>
<p><strong>Title:</strong> ${values.title}</p>
<p><strong>Specification Section:</strong> ${values.specSection || 'N/A'}</p>
<h3>Product Information</h3>
<p><strong>Manufacturer:</strong> ${values.manufacturer || 'TBD'}</p>
<p><strong>Product:</strong> ${values.productName || 'TBD'}</p>`
}

/** Body HTML for submittal — stored in `document.description` when using structured storage. */
export function buildSubmittalDescriptionBody(values: { description: string; notes: string }): string {
  const d = values.description.trim()
  const notes = values.notes.trim()
  const main = `<h3>Description</h3><p>${d}</p>`
  const notesBlock = notes ? `<h3>Notes</h3><p>${notes}</p>` : ''
  return main + notesBlock
}

export function buildSubmittalHtml(values: {
  number: string
  title: string
  date: string
  projectName: string
  specSection: string
  manufacturer: string
  productName: string
  description: string
  notes: string
}): string {
  return (
    buildSubmittalHeaderHtml({
      number: values.number,
      title: values.title,
      date: values.date,
      projectName: values.projectName,
      specSection: values.specSection,
      manufacturer: values.manufacturer,
      productName: values.productName,
    }) + buildSubmittalDescriptionBody(values)
  )
}

export function ensureSubmittalFullDescriptionHtml(
  doc: { title: string; description: string; doc_number: string | null },
  metadata: Record<string, unknown>,
  projectName: string
): string {
  const raw = doc.description || ''
  if (/<strong>\s*Submittal Number\s*:/i.test(raw)) return raw
  const dateIso =
    (typeof metadata.submittalDate === 'string' && metadata.submittalDate) ||
    (typeof metadata.documentDate === 'string' && metadata.documentDate) ||
    ''
  const safeDate = dateIso || new Date().toISOString().slice(0, 10)
  const num = (doc.doc_number && doc.doc_number.trim()) || 'SUB-001'
  const spec =
    (typeof metadata.specSection === 'string' && metadata.specSection) ||
    (typeof metadata.spec_section === 'string' && metadata.spec_section) ||
    ''
  const manufacturer = (typeof metadata.manufacturer === 'string' && metadata.manufacturer) || ''
  const productName = (typeof metadata.productName === 'string' && metadata.productName) || ''
  return (
    buildSubmittalHeaderHtml({
      number: num,
      title: doc.title,
      date: safeDate,
      projectName,
      specSection: spec,
      manufacturer,
      productName,
    }) + raw
  )
}

export function buildChangeOrderHtml(values: {
  coNumber: string
  date: string
  projectName: string
  title: string
  description: string
  reasonLabel: string
  cost: number
  scheduleLabel: string
  notes: string
}): string {
  const dateLong = values.date
    ? new Date(values.date + 'T12:00:00').toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : ''
  const desc = values.description.split('\n').join('</p><p>')
  return `<h2>Change Order Request</h2>
<p><strong>Change Order Number:</strong> ${values.coNumber}</p>
<p><strong>Date:</strong> ${dateLong}</p>
<p><strong>Project:</strong> ${values.projectName}</p>
<p><strong>Title:</strong> ${values.title}</p>
<h3>Description of Change</h3>
<p>${desc}</p>
<h3>Reason for Change</h3>
<p>${values.reasonLabel}</p>
<h3>Cost Impact</h3>
<p>$${formatUsd(values.cost)}</p>
<h3>Schedule Impact</h3>
<p>${values.scheduleLabel}</p>
${values.notes ? `<h3>Notes</h3><p>${values.notes}</p>` : ''}`
}

export type ApiDocVersion = {
  version_no: number
  title: string
  description: string
  metadata: Record<string, unknown> | null
}

export function getLatestVersion(versions: ApiDocVersion[] | null | undefined): ApiDocVersion | null {
  if (!versions?.length) return null
  return versions.reduce((a, b) => (a.version_no >= b.version_no ? a : b))
}

export function reasonLabelToValue(label: string): string {
  const t = label.trim()
  const byLabel = CO_REASON_OPTIONS.find((o) => o.label === t)
  if (byLabel) return byLabel.value
  const byValue = CO_REASON_OPTIONS.find((o) => o.value === t)
  if (byValue) return byValue.value
  return 'other'
}

const CUSTOM_SCHEDULE_PREFIX = 'custom:'

export function scheduleLabelToValue(label: string): string {
  const t = label.trim()
  if (!t) return 'none'
  const byLabel = CO_SCHEDULE_OPTIONS.find((o) => o.label === t)
  if (byLabel) return byLabel.value
  const byValue = CO_SCHEDULE_OPTIONS.find((o) => o.value === t)
  if (byValue) return byValue.value
  return `${CUSTOM_SCHEDULE_PREFIX}${t}`
}

/** Text for the schedule impact free-text field from a stored `scheduleImpact` value. */
export function scheduleImpactValueToInputText(value: string): string {
  if (value === 'none') return ''
  const opt = CO_SCHEDULE_OPTIONS.find((o) => o.value === value)
  if (opt) return opt.label
  if (value.startsWith(CUSTOM_SCHEDULE_PREFIX)) return value.slice(CUSTOM_SCHEDULE_PREFIX.length)
  return value
}

export function extractCoDescriptionHtml(html: string): string {
  const re = /<h3>\s*Description of Change\s*<\/h3>\s*([\s\S]*?)(?=<h3>\s*Reason for Change)/i
  const m = html.match(re)
  if (!m) return ''
  return m[1]
    .replace(/<\/p>\s*<p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .trim()
}

export function extractCoCostFromHtml(html: string): number {
  const sec = extractH3Block(html, 'Cost Impact')
  const n = parseMoneyInput(sec)
  return n
}

function extractRfiNarrativeFromHtml(html: string): string {
  const qd = extractH3Block(html, 'Questions / descriptions')
  if (qd) return qd
  const qd2 = extractH3Block(html, 'Questions/Descriptions')
  if (qd2) return qd2
  const q = extractH3Block(html, 'Question')
  const d = extractH3Block(html, 'Description / Context')
  if (q && d) return `${q}\n\n${d}`
  if (d) return d
  if (q) return q
  return extractH3Block(html, 'Description') || ''
}

/** Build initial RFI form state from API document + latest version metadata */
export function initialRfiState(args: {
  doc: { title: string; description: string; doc_number: string | null }
  latestMeta: Record<string, unknown>
  html: string
}): {
  number: string
  title: string
  date: string
  question: string
  description: string
  notes: string
} {
  const { doc, latestMeta, html } = args
  const m = latestMeta
  const title = doc.title || strongField(html, 'Title')
  const number = doc.doc_number || strongField(html, 'RFI Number') || 'RFI-001'
  const dateIso =
    (typeof m.rfiDate === 'string' && m.rfiDate) ||
    (typeof m.documentDate === 'string' && m.documentDate) ||
    parseLongDateToIso(strongField(html, 'Date')) ||
    new Date().toISOString().slice(0, 10)
  const question = (typeof m.question === 'string' && m.question) || extractH3Block(html, 'Question') || ''
  let description = extractRfiNarrativeFromHtml(html)
  if (!description) {
    description =
      stripSimpleHtml(html)
        .replace(/^Request for Information\s*/i, '')
        .trim() || ''
  }
  const notes = (typeof m.notes === 'string' && m.notes) || extractH3Block(html, 'Notes') || ''
  return { number, title, date: dateIso, question, description, notes }
}

export function initialSubmittalState(args: {
  doc: { title: string; description: string; doc_number: string | null }
  latestMeta: Record<string, unknown>
  html: string
}): {
  number: string
  title: string
  date: string
  specSection: string
  manufacturer: string
  productName: string
  description: string
  notes: string
} {
  const { doc, latestMeta, html } = args
  const m = latestMeta
  const title = doc.title || strongField(html, 'Title')
  const number = doc.doc_number || strongField(html, 'Submittal Number') || 'SUB-001'
  const dateIso =
    (typeof m.submittalDate === 'string' && m.submittalDate) ||
    (typeof m.documentDate === 'string' && m.documentDate) ||
    parseLongDateToIso(strongField(html, 'Date')) ||
    new Date().toISOString().slice(0, 10)
  const specSection = (typeof m.specSection === 'string' && m.specSection) || strongField(html, 'Specification Section') || ''
  const manufacturer = (typeof m.manufacturer === 'string' && m.manufacturer) || ''
  const productName = (typeof m.productName === 'string' && m.productName) || ''
  let description = extractH3Block(html, 'Description') || ''
  if (!description) {
    description =
      stripSimpleHtml(html)
        .replace(/^Product Submittal\s*/i, '')
        .trim() || ''
  }
  const notes = (typeof m.notes === 'string' && m.notes) || extractH3Block(html, 'Notes') || ''
  return { number, title, date: dateIso, specSection, manufacturer, productName, description, notes }
}

export function initialChangeOrderState(args: {
  doc: { title: string; description: string; doc_number: string | null }
  latestMeta: Record<string, unknown>
  html: string
}): {
  changeOrderNumber: string
  date: string
  title: string
  description: string
  reason: string
  costImpact: string
  scheduleImpact: string
  notes: string
} {
  const { doc, latestMeta, html } = args
  const m = latestMeta
  const reasonLabel =
    (typeof m.reason === 'string' && m.reason) || extractH3Block(html, 'Reason for Change') || 'Other'
  const scheduleLabelFromMeta =
    typeof m.scheduleImpact === 'string' ? m.scheduleImpact : extractH3Block(html, 'Schedule Impact')
  const cost =
    typeof m.proposedAmount === 'number'
      ? m.proposedAmount
      : typeof m.proposedAmount === 'string'
        ? parseMoneyInput(m.proposedAmount)
        : extractCoCostFromHtml(html)
  const dateStr =
    (typeof m.changeOrderDate === 'string' && m.changeOrderDate) ||
    parseLongDateToIso(strongField(html, 'Date')) ||
    new Date().toISOString().slice(0, 10)
  const description =
    extractCoDescriptionHtml(html) || stripSimpleHtml(doc.description).replace(/^Change Order Request.*$/i, '').trim() || doc.description
  return {
    changeOrderNumber:
      (typeof m.changeOrderNumber === 'string' && m.changeOrderNumber) ||
      doc.doc_number ||
      strongField(html, 'Change Order Number') ||
      'CO-001',
    date: dateStr,
    title: doc.title || strongField(html, 'Title'),
    description,
    reason: reasonLabelToValue(reasonLabel),
    costImpact: String(cost ?? 0),
    scheduleImpact: scheduleLabelToValue(scheduleLabelFromMeta),
    notes: (typeof m.notes === 'string' && m.notes) || extractH3Block(html, 'Notes') || '',
  }
}
