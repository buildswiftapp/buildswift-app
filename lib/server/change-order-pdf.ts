/**
 * Change Order PDF — view model + render.
 * Structured description / cost categories come from document metadata and HTML (`document-html` extractors).
 * AI assistance for scope refinement: POST `/api/ai/analyze-change-order` (used by the Improve-with-AI UI).
 */
import { readFileSync } from 'fs'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { CO_REASON_OPTIONS, extractH3Block, strongField } from '@/lib/document-html'
import {
  ChangeOrderPdfDocument,
  type ChangeOrderCostBreakdownCardPdf,
  type ChangeOrderCostBreakdownPdf,
  type ChangeOrderCostLinePdfRow,
  type ChangeOrderPdfViewModel,
} from '@/lib/server/change-order-pdf-document'

export type ChangeOrderPdfInput = {
  documentId?: string | null
  title: string
  projectName: string
  descriptionHtml: string
  /**
   * Visual status for the summary block. Accepts any uppercase canonical
   * label string (e.g. 'PENDING', 'APPROVED', 'UNDER REVIEW',
   * 'REVISE & RESUBMIT', 'CLOSED'). Produced by `pdfStatusLabel(...)`.
   */
  status: string

  coNumber?: string | null
  /** ISO or display — issued date */
  dateIssued?: string | null
  /** Physical project address (multiline ok) */
  projectAddress?: string | null
  /** Owner / recipient (TO). */
  toOwner?: string | null
  fromContractor?: string | null
  submittedBy?: string | null
  /** Original / prime contract number for traceability */
  originalContractNumber?: string | null
  /** Review-by / response due date — shown only when provided (optional card line). */
  requiredReviewDate?: string | null
  actionNeededBy?: string | null
  /** Line quantity for legacy forms — not emphasized in newest CO layout */
  quantity?: string | number | null
  /** Prime contract value (original contract amount). */
  primeContractValue?: number | string | null
  /** Owner Request | Design Change | … */
  changeType?: string | null
  priority?: string | null
  /** Reason narrative */
  reason?: string | null
  /** Scope gap | Design conflict | … */
  reasonCategory?: string | null
  scheduleImpact?: string | null
  newCompletionDate?: string | null
  scheduleDays?: string | number | null
  /** Whole calendar days — original project duration before this CO */
  originalProjectDurationDays?: string | number | null
  /** Optional — proposed schedule duration (whole days); when absent, PDF derives proposed impact from schedule days + impact type */
  proposedProjectDurationDays?: string | number | null
  /** Whole calendar days — new total duration after this CO (optional; derived from original ± delta when possible) */
  revisedProjectDurationDays?: string | number | null
  totalCost?: number | null
  /** Line-item table from the change-order form (PDF Cost Breakdown table) */
  costBreakdownItems?: Array<{
    description: string
    quantity: number
    unitPrice: number
    total: number
  }> | null
  laborCost?: number | string | null
  materialCost?: number | string | null
  equipmentCost?: number | string | null
  subcontractorCost?: number | string | null
  overheadProfit?: number | string | null
  updatedContractValue?: number | string | null

  /** Canonical cost impact typing (new model). */
  costImpactType?: 'increase' | 'decrease' | 'none' | null
  markupPercent?: number | string | null
  justificationNote?: string | null

  attachments?: Array<{ fileName?: string | null; fileType?: string | null; notes?: string | null }> | string[] | null

  approvalRows?: Array<{
    title: string
    reviewerEmail?: string | null
    role: string
    signature: 'approved' | 'rejected' | 'pending'
    signatureName: string | null
    signatureUrl?: string | null
    /** When present (submission / workflow), overrides signature mapping. */
    action?: string | null
    date: string
    notes: string
  }>

  brandingCompanyName?: string | null
  brandingLogoDataUri?: string | null
  contactAddress?: string | null
  contactPhone?: string | null
  contactEmail?: string | null
}

const DEFAULT_LOGO_PATHS = [
  process.env.REVIEW_PDF_LOGO_PATH,
  '/home/dev/.cursor/projects/home-dev-Videos-buildswift-app/assets/image-e6c1473e-0b20-42b1-8660-849caf77b75d.png',
].filter((v): v is string => Boolean(v))

let cachedLogoDataUri: string | null = null

function resolveFallbackLogoDataUri(): string {
  if (cachedLogoDataUri !== null) return cachedLogoDataUri
  for (const p of DEFAULT_LOGO_PATHS) {
    try {
      const bytes = readFileSync(p)
      cachedLogoDataUri = `data:image/png;base64,${bytes.toString('base64')}`
      return cachedLogoDataUri
    } catch {
      // try next
    }
  }
  cachedLogoDataUri = ''
  return ''
}

function fmtLongDate(raw: string | null | undefined): string {
  if (!raw) return 'N/A'
  const trimmed = raw.trim()
  const t = Date.parse(trimmed.includes('T') ? trimmed : trimmed + 'T12:00:00')
  if (Number.isNaN(t)) return raw
  return new Date(t).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return 'N/A'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** CO line total as signed currency (+$1,234.56) for the summary strip */
function formatChangeOrderAmountSigned(totalChangeDisplay: string): string {
  if (totalChangeDisplay === 'N/A') return 'N/A'
  const n = Number.parseFloat(totalChangeDisplay.replace(/[^0-9.-]/g, ''))
  if (!Number.isFinite(n)) return totalChangeDisplay
  if (n === 0) return '$0.00'
  const absFmt = fmtUsd(Math.abs(n))
  return n < 0 ? `-${absFmt}` : `+${absFmt}`
}

function fmtUsdish(raw: number | string | null | undefined): string {
  if (raw === null || raw === undefined) return 'N/A'
  if (typeof raw === 'number') return fmtUsd(raw)
  const t = String(raw).trim()
  if (!t) return 'N/A'
  const n = Number.parseFloat(t.replace(/[^0-9.-]/g, ''))
  if (Number.isFinite(n)) return fmtUsd(n)
  return t
}

function defNa(v: string | null | undefined): string {
  const t = (v ?? '').trim()
  return t ? t : 'N/A'
}

function defNp(v: string | null | undefined): string {
  const t = (v ?? '').trim()
  return t ? t : 'Not Provided'
}

function normalizeStatus(s: string): string {
  const u = (s || '').toUpperCase()
  if (u === 'APPROVED') return 'APPROVED'
  if (u === 'REJECTED') return 'REJECTED'
  return 'PENDING'
}

function reasonCategoryPretty(raw: string | null | undefined): string {
  const t = (raw ?? '').trim()
  if (!t) return ''
  const byVal = CO_REASON_OPTIONS.find((o) => o.value === t)
  if (byVal) return byVal.label
  const byLabel = CO_REASON_OPTIONS.find((o) => o.label.toLowerCase() === t.toLowerCase())
  if (byLabel) return byLabel.label
  return t
}

function plainSnippet(s: string): string {
  return (s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildReasonForChangeDisplay(input: ChangeOrderPdfInput, descHtml: string): string {
  const fromHtml =
    extractH3Block(descHtml, 'Reason for Change') ||
    extractH3Block(descHtml, 'Reason for Change Order') ||
    strongField(descHtml, 'Reason for Change')

  const rawReason = (input.reason ?? '').trim()
  const reasonMatchesOption =
    !!rawReason &&
    CO_REASON_OPTIONS.some(
      (o) =>
        o.value === rawReason ||
        o.label.toLowerCase() === rawReason.toLowerCase()
    )

  const narrative = plainSnippet(fromHtml || (rawReason && !reasonMatchesOption ? rawReason : ''))

  const categoryLabel =
    reasonCategoryPretty(input.reasonCategory) ||
    (reasonMatchesOption ? reasonCategoryPretty(rawReason) : '') ||
    ''

  let composed = ''
  if (categoryLabel && narrative) {
    composed = narrative.toLowerCase().includes(categoryLabel.toLowerCase().slice(0, 6))
      ? narrative
      : `${categoryLabel} — ${narrative}`
  } else composed = narrative || categoryLabel

  return defNp(composed)
}

function mapPriorityLabel(raw: string | null | undefined): string {
  const t = (raw ?? '').trim().toLowerCase()
  if (!t) return 'MEDIUM'
  if (t === 'normal' || t === 'medium') return 'MEDIUM'
  if (t === 'urgent' || t === 'high') return 'HIGH'
  if (t === 'low') return 'LOW'
  const o = (raw ?? '').trim()
  return o.charAt(0).toUpperCase() + o.slice(1).toLowerCase()
}

function inferScheduleChoice(raw: string): 'none' | 'adds' | 'reduces' {
  const l = (raw || '').toLowerCase()
  if (!l.trim() || l.includes('no impact') || l === 'none') return 'none'
  if (l.includes('reduce') || l.includes('reduc') || l.includes('deduct') || l.includes('- day')) return 'reduces'
  return 'adds'
}

function extractDaysFromText(raw: string): string {
  const m = (raw || '').match(/(\d+)\s*(?:calendar\s*)?day/i)
  if (m) return m[1]
  const m2 = (raw || '').match(/^\+?\s*(\d+)\s*$/i)
  if (m2) return m2[1]
  return ''
}

function mapApprovalAction(sig: 'approved' | 'rejected' | 'pending'): string {
  if (sig === 'approved') return 'Approved'
  if (sig === 'rejected') return 'Rejected'
  return 'Pending'
}

function isChangeOrderReviewerRole(role: string | null | undefined): boolean {
  return (role ?? '').toLowerCase().includes('reviewer')
}

function sumCostItems(
  items: Array<{ description: string; quantity: number; unitPrice: number; total: number }> | null | undefined
): number {
  if (!items?.length) return 0
  return items.reduce((s, r) => s + (Number.isFinite(r.total) ? r.total : 0), 0)
}

function isProvidedCostFlag(x: unknown): boolean {
  if (x === null || x === undefined) return false
  if (typeof x === 'number') return Number.isFinite(x)
  return String(x).trim() !== ''
}

function parseUsdNumber(raw: number | string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  const n = Number.parseFloat(String(raw).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

function parseWholeDays(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'number')
    return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : null
  const t = String(raw).trim()
  if (!t) return null
  const n = Number.parseInt(t.replace(/[^0-9]/g, ''), 10)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function fmtDurationDaysWords(n: number): string {
  return `${n} Day${n === 1 ? '' : 's'}`
}

function extractDeltaSigned(choice: 'none' | 'adds' | 'reduces', daysRaw: string): number | null {
  if (choice === 'none') return 0
  const trimmed = daysRaw.trim()
  const num = trimmed ? Number.parseInt(trimmed.replace(/[^0-9]/g, ''), 10) : NaN
  if (!Number.isFinite(num)) return null
  const mag = Math.abs(num)
  return choice === 'adds' ? mag : -mag
}

/** Calendar days of schedule impact (add/reduce magnitude); 0 when no impact */
function extractImpactDaysMagnitude(choice: 'none' | 'adds' | 'reduces', daysRaw: string): number | null {
  if (choice === 'none') return 0
  const trimmed = daysRaw.trim()
  const num = trimmed ? Number.parseInt(trimmed.replace(/[^0-9]/g, ''), 10) : NaN
  return Number.isFinite(num) ? Math.abs(num) : null
}

const MAX_CO_COST_CARDS = 8

function formatTotalCostImpactLine(
  costImpactType: 'increase' | 'decrease' | 'none',
  unsignedSum: number
): string {
  const mag = Number.isFinite(unsignedSum) ? Math.abs(unsignedSum) : 0
  if (mag === 0) return fmtUsd(0)
  if (costImpactType === 'decrease') return `(${fmtUsd(mag)} credit)`
  return fmtUsd(mag)
}

function coCostRowToCard(row: ChangeOrderCostLinePdfRow): ChangeOrderCostBreakdownCardPdf {
  const d = (row.lineDescription || '').trim()
  if (/^markup\s*\(/i.test(d)) {
    return { title: 'Overhead & Profit', sublabel: d, amountDisplay: row.subtotalDisplay }
  }
  const titleMap: Record<string, string> = {
    Labor: 'Labor',
    Materials: 'Material',
    Equipment: 'Equipment',
    Subcontractors: 'Subcontractor',
    Other: 'Other',
  }
  return { title: titleMap[d] || d, sublabel: 'Cost', amountDisplay: row.subtotalDisplay }
}

function sumCoCostRowSubtotals(rows: ChangeOrderCostLinePdfRow[]): number {
  return rows.reduce((s, r) => {
    const n = Number.parseFloat(String(r.subtotalDisplay).replace(/[^0-9.-]/g, ''))
    return Number.isFinite(n) ? s + Math.abs(n) : s
  }, 0)
}

export async function generateChangeOrderPdfBuffer(input: ChangeOrderPdfInput): Promise<Buffer> {
  const companyLegalName =
    (input.brandingCompanyName && input.brandingCompanyName.trim()) || 'BuildSwift Construction'
  const logoDataUri =
    typeof input.brandingLogoDataUri === 'string' && input.brandingLogoDataUri.trim().length > 2
      ? input.brandingLogoDataUri.trim()
      : resolveFallbackLogoDataUri()

  const rawAddress =
    (
      input.contactAddress ||
      (input.brandingCompanyName ? 'Not Provided' : '123 Main Street\nAnytown, USA 12345')
    )
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .join('\n') || 'Not Provided'

  const phone = input.contactPhone || (input.brandingCompanyName ? 'Not Provided' : '(555) 123-4567')
  const email = input.contactEmail || (input.brandingCompanyName ? 'Not Provided' : 'info@buildswift.com')

  const tokens = companyLegalName.trim().split(/\s+/).filter(Boolean)
  const brand = tokens[0]?.toUpperCase() || 'BUILDSWIFT'
  const brandSub = tokens.length > 1 ? tokens.slice(1).join(' ').toUpperCase() : 'CONSTRUCTION'

  const themePrimary = '#1f3768'

  const changeOrderNumber =
    (input.coNumber || '').trim() ||
    (input.documentId
      ? `CO-${String(input.documentId).replace(/-/g, '').slice(0, 12).toUpperCase()}`
      : `CO-${Date.now().toString(36).toUpperCase()}`)

  const dateIssued = fmtLongDate(input.dateIssued)
  const requiredReviewDisplayOptional = fmtLongDate(input.requiredReviewDate ?? input.actionNeededBy)

  const projectAddress = defNa(input.projectAddress)
  const toOwner = defNp(input.toOwner)
  const fromContractor = defNp(input.fromContractor || input.submittedBy)

  const descHtml = input.descriptionHtml || ''
  const detailBlock =
    extractH3Block(descHtml, 'Description of Change') ||
    extractH3Block(descHtml, 'Description of Changes') ||
    input.title ||
    'N/A'

  const priorityDisplay = mapPriorityLabel(input.priority)
  const reasonForChangeDisplay = buildReasonForChangeDisplay(input, descHtml)

  const schedRaw = (input.scheduleImpact || '').trim()
  const schedChoice = inferScheduleChoice(schedRaw)
  const scheduleDaysRaw =
    schedChoice === 'none'
      ? ''
      : input.scheduleDays !== null && input.scheduleDays !== undefined && String(input.scheduleDays).trim()
        ? String(input.scheduleDays)
        : extractDaysFromText(schedRaw)

  const lineTotal = sumCostItems(input.costBreakdownItems ?? null)
  const legacyTotalRaw =
    typeof input.totalCost === 'number' && Number.isFinite(input.totalCost) ? input.totalCost : lineTotal || 0

  const hasCategory = [
    input.laborCost,
    input.materialCost,
    input.equipmentCost,
    input.subcontractorCost,
    input.overheadProfit,
  ].some(isProvidedCostFlag)

  const categoryParts = [
    parseUsdNumber(input.laborCost),
    parseUsdNumber(input.materialCost),
    parseUsdNumber(input.equipmentCost),
    parseUsdNumber(input.subcontractorCost),
    parseUsdNumber(input.overheadProfit),
  ].filter((n): n is number => n !== null && Number.isFinite(n))
  const summedCategories = categoryParts.reduce((a, b) => a + b, 0)

  const costImpactType: 'increase' | 'decrease' | 'none' = (() => {
    const t = (input.costImpactType || '').toLowerCase()
    if (t === 'increase' || t === 'decrease' || t === 'none') return t
    if (legacyTotalRaw < 0) return 'decrease'
    if (legacyTotalRaw === 0 && hasCategory && summedCategories === 0) return 'none'
    return 'increase'
  })()

  const unsignedFromCategories = hasCategory ? Math.max(0, summedCategories) : 0
  const unsignedFromLegacy = Math.max(0, Math.abs(legacyTotalRaw))
  const unsignedTotal = costImpactType === 'none'
    ? 0
    : unsignedFromCategories > 0
      ? unsignedFromCategories
      : unsignedFromLegacy

  const signedTotal = costImpactType === 'decrease' ? -unsignedTotal : unsignedTotal
  const totalChange = signedTotal === 0 ? fmtUsd(0) : `${signedTotal < 0 ? '-' : ''}${fmtUsd(Math.abs(signedTotal))}`

  const updatedVcExplicit = fmtUsdish(input.updatedContractValue)
  const primeN = parseUsdNumber(input.primeContractValue)

  let updatedContractValueDisplay = updatedVcExplicit
  if (updatedContractValueDisplay === 'N/A' && primeN !== null) {
    updatedContractValueDisplay = fmtUsd(primeN + signedTotal)
  }

  const originalContractAmountDisplay = fmtUsdish(input.primeContractValue)
  const changeOrderAmountDisplay = formatChangeOrderAmountSigned(totalChange)
  const revisedContractAmountDisplay = updatedContractValueDisplay

  const summaryStatus = normalizeStatus(input.status)
  const finalAuth = summaryStatus

  let attachmentsList: Array<{ fileName: string; fileType: string; notes: string }> = []
  const rawAtt = input.attachments
  if (Array.isArray(rawAtt)) {
    if (rawAtt.length && typeof rawAtt[0] === 'string') {
      attachmentsList = (rawAtt as string[]).map((name) => ({
        fileName: name || 'N/A',
        fileType: name.includes('.') ? (name.split('.').pop() || '').toUpperCase() : 'FILE',
        notes: 'Not Provided',
      }))
    } else {
      attachmentsList = (rawAtt as Array<Record<string, unknown>>).map((row) => {
        const fileName =
          (typeof row.fileName === 'string' && row.fileName) ||
          (typeof row.file_name === 'string' && row.file_name) ||
          (typeof row.name === 'string' && row.name) ||
          ''
        const ft =
          (typeof row.fileType === 'string' && row.fileType) ||
          (typeof row.type === 'string' && row.type) ||
          (typeof row.file_type === 'string' && row.file_type) ||
          (fileName.includes('.') ? (fileName.split('.').pop() || '').toUpperCase() : '')
        const notes =
          (typeof row.notes === 'string' && row.notes) ||
          (typeof row.description === 'string' && row.description) ||
          'Not Provided'
        return {
          fileName: (fileName || '').trim() || 'N/A',
          fileType: (ft || 'N/A').toUpperCase(),
          notes: notes.trim() || 'Not Provided',
        }
      })
    }
  }
  if (!attachmentsList.length) {
    attachmentsList = [{ fileName: 'N/A', fileType: 'N/A', notes: 'Not Provided' }]
  }

  const approvalRowsPdf = (input.approvalRows ?? [])
    .filter((r) => isChangeOrderReviewerRole(r.role ?? undefined))
    .map((r) => {
      const nameCandidate = (r.signatureName || r.title || r.reviewerEmail || '').trim()
      const name = nameCandidate || 'Not Provided'
      const explicitAction = typeof r.action === 'string' ? r.action.trim() : ''
      const action = explicitAction || mapApprovalAction(r.signature)
      return {
        name,
        role: defNp(r.role),
        action,
        date: (r.date || '').trim() || 'N/A',
        notes: (r.notes || '').trim() || 'N/A',
      }
    })

  const originalDaysN = parseWholeDays(input.originalProjectDurationDays)
  const originalDurationDisplay =
    originalDaysN !== null ? fmtDurationDaysWords(originalDaysN) : 'N/A'

  const deltaSigned = extractDeltaSigned(schedChoice, scheduleDaysRaw)

  const proposedDaysExplicit = parseWholeDays(input.proposedProjectDurationDays)
  const impactMag = extractImpactDaysMagnitude(schedChoice, scheduleDaysRaw)
  const proposedDurationDisplay =
    proposedDaysExplicit !== null
      ? fmtDurationDaysWords(proposedDaysExplicit)
      : impactMag !== null
        ? fmtDurationDaysWords(impactMag)
        : 'N/A'

  let newDaysN = parseWholeDays(input.revisedProjectDurationDays)
  if (newDaysN === null && originalDaysN !== null && deltaSigned !== null) {
    const computed = originalDaysN + deltaSigned
    newDaysN = computed >= 0 ? computed : null
  }
  const newDurationDisplay = newDaysN !== null ? fmtDurationDaysWords(newDaysN) : 'N/A'

  const costBreakdown: ChangeOrderCostBreakdownPdf = (() => {
    if (costImpactType === 'none') {
      const just = (input.justificationNote || '').trim()
      return {
        kind: 'justification',
        body: just || 'No Cost Impact',
        totalImpactDisplay: fmtUsd(0),
      }
    }

    const items = input.costBreakdownItems ?? []
    if (items.length) {
      const slice = items.slice(0, MAX_CO_COST_CARDS)
      const cards: ChangeOrderCostBreakdownCardPdf[] = slice.map((row) => ({
        title: (row.description || '').trim() || 'Line item',
        sublabel:
          Number.isFinite(row.quantity) && row.quantity !== 0 && Number.isFinite(row.unitPrice)
            ? `${row.quantity} × ${fmtUsd(row.unitPrice)}`
            : 'Cost',
        amountDisplay: fmtUsd(row.total),
      }))
      const sum = slice.reduce((s, r) => s + (Number.isFinite(r.total) ? r.total : 0), 0)
      return {
        kind: 'cards',
        cards,
        totalImpactDisplay: formatTotalCostImpactLine(costImpactType, sum),
      }
    }

    const categories = [
      { label: 'Labor', value: parseUsdNumber(input.laborCost) ?? 0 },
      { label: 'Materials', value: parseUsdNumber(input.materialCost) ?? 0 },
      { label: 'Equipment', value: parseUsdNumber(input.equipmentCost) ?? 0 },
      { label: 'Subcontractors', value: parseUsdNumber(input.subcontractorCost) ?? 0 },
      { label: 'Other', value: parseUsdNumber(input.overheadProfit) ?? 0 },
    ].filter((r) => r.value > 0)

    const markupPercent = parseUsdNumber(input.markupPercent) ?? 0
    const categorySubtotal = categories.reduce((s, r) => s + r.value, 0)
    const markupDollars = markupPercent > 0 ? categorySubtotal * (markupPercent / 100) : 0

    if (!categories.length && markupDollars <= 0) {
      return {
        kind: 'cards',
        cards: [{ title: '—', sublabel: 'Cost', amountDisplay: 'N/A' }],
        totalImpactDisplay: formatTotalCostImpactLine(costImpactType, 0),
      }
    }

    const rows: ChangeOrderCostLinePdfRow[] = categories.map((r) => ({
      lineDescription: r.label,
      qtyDisplay: '—',
      unitCostDisplay: fmtUsd(r.value),
      subtotalDisplay: fmtUsd(r.value),
    }))

    if (markupDollars > 0) {
      rows.push({
        lineDescription: `Markup (${markupPercent}%)`,
        qtyDisplay: '—',
        unitCostDisplay: fmtUsd(markupDollars),
        subtotalDisplay: fmtUsd(markupDollars),
      })
    }

    const cards = rows.map(coCostRowToCard)
    const sumFromRows = sumCoCostRowSubtotals(rows)
    return {
      kind: 'cards',
      cards,
      totalImpactDisplay: formatTotalCostImpactLine(costImpactType, sumFromRows),
    }
  })()

  const viewModel: ChangeOrderPdfViewModel = {
    logoDataUri,
    brand,
    brandSub,
    themePrimary,
    contactAddress: rawAddress,
    contactPhone: phone,
    contactEmail: email,

    companyLegalName,

    projectName: defNa(input.projectName),
    projectAddress,
    changeOrderNumber,
    dateIssuedDisplay: dateIssued,
    requiredReviewDateDisplayOptional: requiredReviewDisplayOptional,

    toOwner,
    fromContractor,

    changeTitle: defNa(input.title),
    summaryStatus,
    priorityDisplay,
    reasonForChangeDisplay,

    detailedDescription: detailBlock,

    costBreakdown,
    originalContractAmountDisplay,
    changeOrderAmountDisplay,
    revisedContractAmountDisplay,

    originalDurationDisplay,
    proposedDurationDisplay,
    newDurationDisplay,

    attachments: attachmentsList,

    finalAuthorizationStatus: finalAuth,
    approvalRows: approvalRowsPdf,
  }

  return renderToBuffer(React.createElement(ChangeOrderPdfDocument, { data: viewModel }) as any)
}
