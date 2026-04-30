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
  type ChangeOrderApprovalPdfRow,
  type ChangeOrderAttachmentRow,
  type ChangeOrderCostBreakdownPdfRow,
  type ChangeOrderPdfViewModel,
} from '@/lib/server/change-order-pdf-document'

export type ChangeOrderPdfInput = {
  documentId?: string | null
  title: string
  projectName: string
  descriptionHtml: string
  /** Visual status for summary + authorization blocks */
  status: 'PENDING' | 'APPROVED' | 'REJECTED'

  coNumber?: string | null
  /** ISO or display — issued date */
  dateIssued?: string | null
  /** Physical project address (multiline ok) */
  projectAddress?: string | null
  fromContractor?: string | null
  submittedBy?: string | null
  /** Review-by / response due date (shown like Submittal "Required review date"). */
  requiredReviewDate?: string | null
  actionNeededBy?: string | null
  /** Line quantity for summary (distinct from unit quantities in breakdown). */
  quantity?: string | number | null
  /** Kept for cost rollups — not shown in the header grid anymore */
  primeContractValue?: number | string | null
  /** Owner Request | Design Change | … */
  changeType?: string | null
  priority?: string | null
  /** Reason category key or long label (metadata.reason) */
  reason?: string | null
  /** Scope gap | Design conflict | … */
  reasonCategory?: string | null
  scheduleImpact?: string | null
  newCompletionDate?: string | null
  scheduleDays?: string | number | null
  totalCost?: number | null
  /** Legacy line-item table from the change-order form */
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

  drawingSheetNumbers?: string | null
  specificationSections?: string | null
  detailReferences?: string | null
  relatedRfiNumbers?: string | null
  relatedSubmittalNumbers?: string | null

  reviewerComments?: string | null
  reviewedBy?: string | null
  reviewDate?: string | null

  attachments?: Array<{ fileName?: string | null; fileType?: string | null; notes?: string | null }> | string[] | null

  approvalRows?: Array<{
    title: string
    reviewerEmail?: string | null
    role: string
    signature: 'approved' | 'rejected' | 'pending'
    signatureName: string | null
    signatureUrl?: string | null
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
  if (!raw) return '—'
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

function reasonLabelFromStored(raw: string | null | undefined): string {
  const t = (raw ?? '').trim()
  if (!t) return 'Other'
  const byVal = CO_REASON_OPTIONS.find((o) => o.value === t)
  if (byVal) return byVal.label
  const byLabel = CO_REASON_OPTIONS.find((o) => o.label.toLowerCase() === t.toLowerCase())
  if (byLabel) return byLabel.label
  return t
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
  return 'N/A'
}

/** Single line for Schedule Impact PDF block (choice + days; optional completion). */
function buildScheduleImpactSummary(
  choice: 'none' | 'adds' | 'reduces',
  daysStr: string,
  completionFmt: string
): string {
  const dRaw = (daysStr || '').trim()
  const asInt = /^-?\d+$/.test(dRaw) ? Number(dRaw) : NaN
  let core: string
  if (choice === 'none') {
    core = 'No schedule impact'
  } else if (choice === 'adds') {
    if (dRaw.toLowerCase() === 'none' || dRaw === '' || dRaw === 'N/A')
      core = 'Adds time'
    else if (Number.isFinite(asInt))
      core = `+${Math.abs(asInt)} calendar day${Math.abs(asInt) === 1 ? '' : 's'}`
    else core = `Adds time (${dRaw})`
  } else {
    if (dRaw.toLowerCase() === 'none' || dRaw === '' || dRaw === 'N/A')
      core = 'Reduces time'
    else if (Number.isFinite(asInt))
      core = `-${Math.abs(asInt)} calendar day${Math.abs(asInt) === 1 ? '' : 's'}`
    else core = `Reduces time (${dRaw})`
  }
  const c = (completionFmt || '').trim()
  const hasCompletion = Boolean(c && c !== '—' && c !== 'N/A')
  return hasCompletion ? `${core} · Updated completion ${c}` : core
}

function mapApprovalAction(sig: 'approved' | 'rejected' | 'pending'): string {
  if (sig === 'approved') return 'Approved'
  if (sig === 'rejected') return 'Rejected'
  return 'Pending'
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

function buildCostBreakdownRowsPdf(
  input: ChangeOrderPdfInput,
  legacyTotal: number,
  totalChangeDisplay: string
): ChangeOrderCostBreakdownPdfRow[] {
  const items = input.costBreakdownItems ?? null
  if (items?.length) {
    return items.map((r) => {
      const qtyN = typeof r.quantity === 'number' ? r.quantity : Number.parseFloat(String(r.quantity))
      const upN = typeof r.unitPrice === 'number' ? r.unitPrice : Number.parseFloat(String(r.unitPrice))
      const totalN = typeof r.total === 'number' ? r.total : Number.parseFloat(String(r.total))
      const qtyOk = Number.isFinite(qtyN)
      const upOk = Number.isFinite(upN)
      const totOk = Number.isFinite(totalN)
      const qtyDisp = qtyOk ? String(qtyN) : '—'
      const upDisp = upOk ? fmtUsd(upN) : '—'
      const calcDisp = qtyOk && upOk ? `${qtyDisp} × ${fmtUsd(upN)}` : '—'
      const amt = totOk ? fmtUsd(totalN) : 'N/A'
      return {
        description: (r.description || '').trim() || '—',
        qty: qtyDisp,
        unitPrice: upDisp,
        calculation: calcDisp,
        amount: amt,
      }
    })
  }

  type CatTuple = readonly [label: string, raw: ChangeOrderPdfInput['laborCost']]
  const catDefs: CatTuple[] = [
    ['Labor cost', input.laborCost],
    ['Material cost', input.materialCost],
    ['Equipment cost', input.equipmentCost],
    ['Subcontractor cost', input.subcontractorCost],
    ['Overhead & profit', input.overheadProfit],
  ]
  const fromCategories: ChangeOrderCostBreakdownPdfRow[] = []
  for (const [label, raw] of catDefs) {
    if (!isProvidedCostFlag(raw)) continue
    const disp =
      typeof raw === 'number' && Number.isFinite(raw)
        ? fmtUsd(raw)
        : fmtUsdish(raw)
    fromCategories.push({
      description: label,
      qty: '—',
      unitPrice: '—',
      calculation: '—',
      amount: disp,
    })
  }
  if (fromCategories.length) return fromCategories

  if (legacyTotal > 0) {
    const amt = fmtUsd(legacyTotal)
    return [
      {
        description: 'Change order total',
        qty: '—',
        unitPrice: '—',
        calculation: '—',
        amount: amt,
      },
    ]
  }

  const amt = totalChangeDisplay !== 'N/A' ? totalChangeDisplay : 'N/A'
  return [
    {
      description: 'Cost breakdown not specified',
      qty: '—',
      unitPrice: '—',
      calculation: '—',
      amount: amt,
    },
  ]
}

export async function generateChangeOrderPdfBuffer(input: ChangeOrderPdfInput): Promise<Buffer> {
  // Change Order PDFs intentionally do not apply account/project branding.
  const companyName = 'BuildSwift Construction'
  const logoDataUri = resolveFallbackLogoDataUri()

  const rawAddress = (input.contactAddress || '123 Main Street\nAnytown, USA 12345')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')

  const phone = input.contactPhone || '(555) 123-4567'
  const email = input.contactEmail || 'info@buildswift.com'

  const brand = companyName.split(/\s+/)[0]?.toUpperCase() || 'BUILDSWIFT'
  const brandSub = companyName.replace(new RegExp(`^${brand}\\s*`, 'i'), '').trim() || 'CONSTRUCTION'
  const themePrimary = '#1f3768'

  const coNumber =
    (input.coNumber || '').trim() ||
    (input.documentId ? `CO-${String(input.documentId).replace(/-/g, '').slice(0, 12).toUpperCase()}` : 'N/A')

  const dateIssued = fmtLongDate(input.dateIssued)
  const requiredReviewDisplay = fmtLongDate(input.requiredReviewDate ?? input.actionNeededBy)

  const projectAddress = defNa(input.projectAddress)
  const fromContractor = defNp(input.fromContractor || input.submittedBy)

  const descHtml = input.descriptionHtml || ''
  const reasonBlock =
    (input.reason && input.reason.trim()) ||
    extractH3Block(descHtml, 'Reason for Change') ||
    extractH3Block(descHtml, 'Reason for Change Order') ||
    strongField(descHtml, 'Reason for Change') ||
    'N/A'

  const detailBlock =
    extractH3Block(descHtml, 'Description of Change') ||
    extractH3Block(descHtml, 'Description of Changes') ||
    input.title ||
    'N/A'

  const reasonCategoryDisplay =
    (input.reasonCategory && input.reasonCategory.trim()) || reasonLabelFromStored(input.reason) || 'Other'

  const priorityDisplay = mapPriorityLabel(input.priority)

  const schedRaw = (input.scheduleImpact || '').trim()
  const schedChoice = inferScheduleChoice(schedRaw)
  const scheduleDays =
    schedChoice === 'none'
      ? 'None'
      : (input.scheduleDays !== null && input.scheduleDays !== undefined && String(input.scheduleDays).trim()
          ? String(input.scheduleDays)
          : extractDaysFromText(schedRaw)) || 'N/A'

  const newComp = fmtLongDate(input.newCompletionDate || undefined)

  const lineTotal = sumCostItems(input.costBreakdownItems ?? null)
  const legacyTotal =
    typeof input.totalCost === 'number' && Number.isFinite(input.totalCost) ? input.totalCost : lineTotal || 0

  const hasCategory = [
    input.laborCost,
    input.materialCost,
    input.equipmentCost,
    input.subcontractorCost,
    input.overheadProfit,
  ].some(isProvidedCostFlag)

  let totalChange = 'N/A'
  if (hasCategory) {
    const nums = [input.laborCost, input.materialCost, input.equipmentCost, input.subcontractorCost, input.overheadProfit]
      .map((x) => {
        if (x === null || x === undefined) return 0
        if (typeof x === 'number') return x
        const n = Number.parseFloat(String(x).replace(/[^0-9.-]/g, ''))
        return Number.isFinite(n) ? n : 0
      })
      .reduce((a, b) => a + b, 0)
    totalChange = nums > 0 ? fmtUsd(nums) : 'N/A'
  } else if (legacyTotal > 0) {
    totalChange = fmtUsd(legacyTotal)
  }

  const costBreakdownRows = buildCostBreakdownRowsPdf(input, legacyTotal, totalChange)

  const summaryStatus = normalizeStatus(input.status)
  const finalAuth = summaryStatus

  const drawing = defNa(input.drawingSheetNumbers)
  const specSec = defNa(input.specificationSections)
  const detailRef = defNa(input.detailReferences)
  const rfiN = defNa(input.relatedRfiNumbers)
  const subN = defNa(input.relatedSubmittalNumbers)

  let attachmentsList: ChangeOrderAttachmentRow[] = []
  const rawAtt = input.attachments
  if (Array.isArray(rawAtt)) {
    if (rawAtt.length && typeof rawAtt[0] === 'string') {
      attachmentsList = (rawAtt as string[]).map((name) => ({
        fileName: name,
        fileType: name.includes('.') ? (name.split('.').pop() || '').toUpperCase() : 'FILE',
        notes: 'N/A',
      }))
    } else {
      attachmentsList = (rawAtt as Array<Record<string, unknown>>).map((row) => {
        const fileName =
          (typeof row.name === 'string' && row.name) ||
          (typeof row.file_name === 'string' && row.file_name) ||
          ''
        const fileType =
          (typeof row.type === 'string' && row.type) ||
          (fileName.includes('.') ? (fileName.split('.').pop() || '').toUpperCase() : 'FILE')
        const notes = (typeof row.notes === 'string' && row.notes) || 'N/A'
        return { fileName: fileName || 'N/A', fileType: fileType || 'N/A', notes }
      })
    }
  }

  const approvalRowsPdf: ChangeOrderApprovalPdfRow[] = (input.approvalRows ?? []).map((r) => ({
    name: (r.signatureName || r.title || '').trim() || 'Not Provided',
    reviewerEmail: ((r.reviewerEmail || '').trim() || (r.title || '').trim() || 'Not Provided').toLowerCase(),
    action: mapApprovalAction(r.signature),
    date: (r.date || '').trim() || '—',
    signatureName: (r.signatureName || '').trim() || null,
    signatureUrl: r.signatureUrl ?? null,
  }))

  const reviewerComments = defNa(input.reviewerComments)
  const reviewedBy = defNp(input.reviewedBy)
  const reviewDate = (input.reviewDate && input.reviewDate.trim()) || '—'

  const scheduleImpactDisplay = buildScheduleImpactSummary(schedChoice, scheduleDays, newComp)

  const viewModel: ChangeOrderPdfViewModel = {
    logoDataUri,
    brand,
    brandSub,
    themePrimary,
    contactAddress: rawAddress,
    contactPhone: phone,
    contactEmail: email,

    projectName: input.projectName || 'N/A',
    projectAddress,
    changeOrderNumber: coNumber,
    dateIssuedDisplay: dateIssued,
    requiredReviewDateDisplay: requiredReviewDisplay,
    fromContractor,

    changeTitle: input.title || 'N/A',
    summaryStatus,
    priorityDisplay,

    detailedDescription: detailBlock,
    reasonForChangeDisplay: reasonBlock,
    reasonCategoryDisplay,

    drawingSheetNumbers: drawing,
    specificationSections: specSec,
    detailReferences: detailRef,
    relatedRfiNumbers: rfiN,
    relatedSubmittalNumbers: subN,

    costBreakdownRows,
    totalChangeAmount: totalChange,

    scheduleImpactDisplay,

    attachments: attachmentsList,

    reviewerComments,
    reviewedBy,
    reviewDate,

    finalAuthorizationStatus: finalAuth,
    approvalRows: approvalRowsPdf,
  }

  return renderToBuffer(React.createElement(ChangeOrderPdfDocument, { data: viewModel }) as any)
}
