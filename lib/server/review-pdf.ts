import { readFileSync } from 'fs'
import { createHash } from 'crypto'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { extractH3Block, strongField } from '@/lib/document-html'
import { brandingAccentFromPrimary, parseBrandingPrimaryColor } from '@/lib/branding-utils'
import { ReviewPdfDocument, type ReviewPdfViewModel } from '@/lib/server/review-pdf-document'

type ReviewPdfInput = {
  title: string
  projectName: string
  docType: string
  descriptionHtml: string
  contactAddress?: string | null
  contactPhone?: string | null
  contactEmail?: string | null
  projectNo?: string | null
  reportDate?: string | null
  /** ISO or stored date; shown on RFI PDF as “Contract Date” when set. */
  contractDate?: string | null
  actionNeededBy?: string | null
  submittedBy?: string | null
  rfiNo?: string | null
  specSection?: string | null
  priority?: string | null
  attachments?: string[]
  linkedDocuments?: string[]
  approvalRows?: Array<{
    title: string
    role: string
    signature: 'approved' | 'pending' | 'rejected'
    signatureName?: string | null
    signatureUrl?: string | null
    date: string
    notes: string
  }>
  reviewStatus?: 'PENDING' | 'APPROVED' | 'REJECTED'
  /** When true, use account branding / neutral export styling instead of default BuildSwift theme. */
  applyAccountBranding?: boolean
  brandingCompanyName?: string | null
  brandingPrimaryColor?: string | null
  /** Resolved data URI for React-PDF Image (empty to skip). */
  brandingLogoDataUri?: string | null
  metadata?: Record<string, unknown>
}

type ReviewDocumentJson = {
  header: {
    brand: string
    title: string
    documentType: string
    project: string
    generatedAt: string
  }
  facts: Array<{ label: string; value: string }>
  sections: Array<{ heading: string; body: string }>
  fullText: string
}

type ApprovalRow = {
  title: string
  role: string
  signature: 'approved' | 'pending' | 'rejected'
  signatureName?: string | null
  signatureUrl?: string | null
  date: string
  notes: string
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function addDaysLabel(source: string, days: number) {
  const parsed = Date.parse(source)
  if (Number.isNaN(parsed)) return '—'
  const out = new Date(parsed + days * 86_400_000)
  return out.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function extractSectionList(
  sections: Array<{ heading: string; body: string }>,
  keywords: string[]
) {
  const target = sections.find((section) => {
    const heading = section.heading.toLowerCase()
    return keywords.some((keyword) => heading.includes(keyword))
  })
  if (!target?.body) return []
  return target.body
    .split('\n')
    .map((line) => normalizeWhitespace(line.replace(/^[-*•]\s*/, '')))
    .filter(Boolean)
}

function firstSectionBodyByKeywords(
  sections: Array<{ heading: string; body: string }>,
  keywords: string[]
) {
  const match = sections.find((section) => {
    const h = section.heading.toLowerCase()
    return keywords.some((kw) => h.includes(kw))
  })
  return match?.body?.trim() || ''
}

const DOC_TITLE_HEADING = /^(request for information|change order request|product submittal)$/i

function isListOrLogSectionHeading(heading: string) {
  const h = heading.trim().toLowerCase()
  if (!h) return true
  if (/\battachment(s)?\b/.test(h)) return true
  if (/\blinked\b/.test(h) && /\bdoc/.test(h)) return true
  if (/\bapproval\b/.test(h) && /\blog\b/.test(h)) return true
  return false
}

type PdfNarrativeSection = { label: string; body: string }

function canonicalNarrativeLabel(rawHeading: string, docType: string): string {
  const heading = rawHeading.trim().toLowerCase()
  if (!heading) return ''
  if (heading === 'reason for change') return 'REASON FOR CHANGE ORDER'
  if (heading === 'description of change') return 'QUESTION / ISSUE'
  if (
    heading === 'question' ||
    heading === 'questions / descriptions' ||
    heading === 'questions/descriptions' ||
    heading === 'description / context' ||
    heading === 'question / issue'
  ) {
    return 'QUESTION / ISSUE'
  }
  if (
    heading === "contractor's proposed interpretation" ||
    heading === 'contractor proposed interpretation'
  ) {
    return "CONTRACTOR'S PROPOSED INTERPRETATION"
  }
  // For change orders, treat generic notes as the proposed interpretation block.
  if (docType === 'change_order' && heading === 'notes') {
    return "CONTRACTOR'S PROPOSED INTERPRETATION"
  }
  return rawHeading.replace(/\s+/g, ' ').toUpperCase()
}

/** One card per <h3> block (and similar), excluding title/list/approval sections. */
function narrativeSectionsFromParsed(
  sections: Array<{ heading: string; body: string }>,
  docType: string
): PdfNarrativeSection[] {
  const merged = new Map<string, string>()
  for (const s of sections) {
    const heading = s.heading.trim()
    if (!heading || DOC_TITLE_HEADING.test(heading)) continue
    if (isListOrLogSectionHeading(heading)) continue
    if (
      docType === 'change_order' &&
      /^(cost impact|schedule impact|scope impact)$/i.test(heading)
    ) {
      continue
    }
    const body = (s.body || '').trim()
    if (!body || body === '-') continue
    const label = canonicalNarrativeLabel(heading, docType)
    if (!label) continue
    const existing = merged.get(label)
    merged.set(label, existing ? `${existing}\n\n${body}` : body)
  }
  return Array.from(merged.entries()).map(([label, body]) => ({ label, body }))
}

function formatDisplayDate(raw: string | null | undefined) {
  const v = (raw ?? '').trim()
  if (!v) return ''
  const t = Date.parse(v)
  if (!Number.isNaN(t)) {
    return new Date(t).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }
  return v
}

function buildChangeOrderImpactRows(html: string): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = []
  const sched = extractH3Block(html, 'Schedule Impact').trim()
  const cost = extractH3Block(html, 'Cost Impact').trim()
  const scope = extractH3Block(html, 'Scope Impact').trim()
  if (sched) rows.push({ label: 'Schedule Impact', value: sched })
  if (cost) rows.push({ label: 'Cost Impact', value: cost })
  if (scope) rows.push({ label: 'Scope Impact', value: scope })
  return rows
}

function buildGenericImpactRows(html: string): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = []
  const schedule = extractH3Block(html, 'Schedule Impact').trim()
  const cost = extractH3Block(html, 'Cost Impact').trim()
  const scope = extractH3Block(html, 'Scope Impact').trim()
  if (schedule) rows.push({ label: 'Schedule Impact', value: schedule })
  if (cost) rows.push({ label: 'Cost Impact', value: cost })
  if (scope) rows.push({ label: 'Scope Impact', value: scope })
  return rows
}

function normalizeRfiNarrativeSections(
  sections: PdfNarrativeSection[],
  title: string
): PdfNarrativeSection[] {
  const byLabel = new Map<string, string>()
  for (const section of sections) {
    const existing = byLabel.get(section.label)
    byLabel.set(section.label, existing ? `${existing}\n\n${section.body}` : section.body)
  }

  const reasonFromSections =
    byLabel.get('REASON FOR CHANGE') || byLabel.get('REASON FOR CHANGE ORDER') || ''
  const question =
    byLabel.get('QUESTION / ISSUE') ||
    byLabel.get('QUESTIONS / DESCRIPTIONS') ||
    byLabel.get('DESCRIPTION / CONTEXT') ||
    ''
  const proposed =
    byLabel.get("CONTRACTOR'S PROPOSED INTERPRETATION") ||
    byLabel.get('NOTES') ||
    ''

  const out: PdfNarrativeSection[] = []
  // Keep non-change-order PDFs free from change-order-only headings.
  if (reasonFromSections) out.push({ label: 'REASON FOR CHANGE', body: reasonFromSections })
  if (question) out.push({ label: 'QUESTION / ISSUE', body: question })
  if (proposed) {
    out.push({
      label: "CONTRACTOR'S PROPOSED INTERPRETATION",
      body: proposed,
    })
  }

  if (out.length === 0 && title.trim()) {
    out.push({
      label: 'DESCRIPTION',
      body: title.trim(),
    })
  }
  if (out.length === 0) return sections
  return out
}

const DEFAULT_LOGO_PATHS = [
  process.env.REVIEW_PDF_LOGO_PATH,
  '/home/dev/.cursor/projects/home-dev-Videos-buildswift-app/assets/image-e6c1473e-0b20-42b1-8660-849caf77b75d.png',
].filter((value): value is string => Boolean(value))

let cachedLogoDataUri: string | null = null

function resolveLogoDataUri() {
  if (cachedLogoDataUri) return cachedLogoDataUri
  for (const candidatePath of DEFAULT_LOGO_PATHS) {
    try {
      const bytes = readFileSync(candidatePath)
      cachedLogoDataUri = `data:image/png;base64,${bytes.toString('base64')}`
      return cachedLogoDataUri
    } catch {
      // Try next candidate path.
    }
  }
  return ''
}

function stripHtml(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function fmtDate(raw: string) {
  const t = Date.parse(raw)
  if (Number.isNaN(t)) return raw || '-'
  return new Date(t).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function normalizeLabel(label: string) {
  return label
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (s) => s.toUpperCase())
}

function extractSections(descriptionHtml: string) {
  const sectionRegex = /<h[23][^>]*>(.*?)<\/h[23]>\s*([\s\S]*?)(?=<h[23][^>]*>|$)/gi
  const sections: Array<{ heading: string; body: string }> = []
  let match: RegExpExecArray | null
  while ((match = sectionRegex.exec(descriptionHtml)) !== null) {
    const heading = stripHtml(match[1] || '').trim()
    const body = stripHtml(match[2] || '').trim()
    if (heading || body) {
      sections.push({
        heading: heading || 'Details',
        body: body || '-',
      })
    }
  }
  if (sections.length === 0) {
    sections.push({
      heading: 'Document Details',
      body: stripHtml(descriptionHtml) || '-',
    })
  }
  return sections
}

function extractFacts(input: ReviewPdfInput) {
  const facts: Array<{ label: string; value: string }> = []
  const pushFact = (label: string, value: string) => {
    const v = value.trim()
    if (!v) return
    facts.push({ label: normalizeLabel(label), value: v })
  }

  if (input.docType === 'rfi') {
    pushFact('RFI Number', strongField(input.descriptionHtml, 'RFI Number'))
    pushFact('Date', strongField(input.descriptionHtml, 'Date'))
    pushFact('Project', strongField(input.descriptionHtml, 'Project') || input.projectName)
  } else if (input.docType === 'submittal') {
    pushFact('Submittal Number', strongField(input.descriptionHtml, 'Submittal Number'))
    pushFact('Date', strongField(input.descriptionHtml, 'Date'))
    pushFact('Specification Section', strongField(input.descriptionHtml, 'Specification Section'))
    pushFact('Project', strongField(input.descriptionHtml, 'Project') || input.projectName)
  } else {
    pushFact('Change Order Number', strongField(input.descriptionHtml, 'Change Order Number'))
    pushFact('Date', strongField(input.descriptionHtml, 'Date'))
    pushFact('Project', strongField(input.descriptionHtml, 'Project') || input.projectName)
    pushFact('Reason for Change', extractH3Block(input.descriptionHtml, 'Reason for Change'))
    pushFact('Cost Impact', extractH3Block(input.descriptionHtml, 'Cost Impact'))
    pushFact('Schedule Impact', extractH3Block(input.descriptionHtml, 'Schedule Impact'))
  }

  if (!facts.some((f) => f.label === 'Project')) {
    facts.push({ label: 'Project', value: input.projectName })
  }
  return facts.slice(0, 8)
}

export function documentHtmlToJsonContent(input: ReviewPdfInput): ReviewDocumentJson {
  const docType = input.docType.replaceAll('_', ' ').replace(/^./, (s) => s.toUpperCase())
  const sections = extractSections(input.descriptionHtml)
  return {
    header: {
      brand: 'BuildSwift',
      title: input.title,
      documentType: docType,
      project: input.projectName,
      generatedAt: new Date().toISOString(),
    },
    facts: extractFacts(input),
    sections,
    fullText: stripHtml(input.descriptionHtml),
  }
}

function reviewHeaderTitleForDocType(docType: string) {
  if (docType === 'rfi') return 'REQUEST FOR INFORMATION (RFI)'
  if (docType === 'submittal') return 'SUBMITTAL'
  return 'CHANGE ORDER'
}

function reviewHeaderNumber(input: ReviewPdfInput) {
  if (input.docType === 'rfi') return strongField(input.descriptionHtml, 'RFI Number') || 'RFI'
  if (input.docType === 'submittal') return strongField(input.descriptionHtml, 'Submittal Number') || 'SUB'
  return strongField(input.descriptionHtml, 'Change Order Number') || 'CO'
}

function extractApprovalRows(input: ReviewPdfInput) {
  const lines = extractH3Block(input.descriptionHtml, 'Approval Log')
    .split('\n')
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
  const rows: ApprovalRow[] = []
  for (const line of lines) {
    const pieces = line
      .split('|')
      .map((part) => normalizeWhitespace(part))
      .filter(Boolean)
    if (pieces.length < 2) continue
    rows.push({
      title: pieces[0] || '-',
      role: pieces[1] || '-',
      signature: /reject/i.test(pieces[2] ?? '') ? 'rejected' : /approve/i.test(pieces[2] ?? '') ? 'approved' : 'pending',
      signatureName: null,
      signatureUrl: null,
      date: pieces[3] || '—',
      notes: pieces[4] || '—',
    })
  }
  return rows
}

function formatPriorityLabel(raw: string | null | undefined) {
  const t = (raw ?? '').trim().toLowerCase()
  if (!t) return ''
  if (t === 'low' || t === 'normal' || t === 'medium' || t === 'high' || t === 'urgent') {
    return t.charAt(0).toUpperCase() + t.slice(1)
  }
  return raw?.trim() ?? ''
}

export async function generateReviewPdfBuffer(input: ReviewPdfInput): Promise<Buffer> {
  const docJson = documentHtmlToJsonContent(input)
  const specSection =
    input.specSection ||
    strongField(input.descriptionHtml, 'Specification Section') ||
    strongField(input.descriptionHtml, 'Spec Section')
  const primaryDate = input.reportDate || strongField(input.descriptionHtml, 'Date')
  const rfiNo =
    input.rfiNo ||
    strongField(input.descriptionHtml, 'RFI Number') ||
    strongField(input.descriptionHtml, 'Submittal Number') ||
    strongField(input.descriptionHtml, 'Change Order Number') ||
    '—'
  const submittedBy =
    input.submittedBy || strongField(input.descriptionHtml, 'Submitted By') || strongField(input.descriptionHtml, 'Submitted by')
  const attachments =
    input.attachments !== undefined && input.attachments !== null
      ? input.attachments
      : extractSectionList(docJson.sections, ['attachment'])
  const linkedDocuments =
    input.linkedDocuments !== undefined && input.linkedDocuments !== null
      ? input.linkedDocuments
      : extractSectionList(docJson.sections, ['linked'])
  const approvalRows =
    input.approvalRows !== undefined && input.approvalRows !== null
      ? input.approvalRows
      : extractApprovalRows(input)

  const actionNeededByResolved =
    input.actionNeededBy ||
    strongField(input.descriptionHtml, 'Action Needed By') ||
    strongField(input.descriptionHtml, 'Due Date') ||
    addDaysLabel(primaryDate || docJson.header.generatedAt, 2)

  const contractDateDisplay =
    input.docType === 'rfi' ? formatDisplayDate(input.contractDate) : ''

  const parsedSections = narrativeSectionsFromParsed(docJson.sections, input.docType)
  const contentSections =
    input.docType === 'rfi' ? normalizeRfiNarrativeSections(parsedSections, input.title) : parsedSections
  const impactRows =
    input.docType === 'change_order'
      ? buildChangeOrderImpactRows(input.descriptionHtml)
      : buildGenericImpactRows(input.descriptionHtml)

  const metadataAssumptions = (() => {
    const raw = (input as any).metadata?.assumptions
    if (Array.isArray(raw)) return raw.map((v) => String(v).trim()).filter(Boolean)
    if (typeof raw === 'string') return raw.split('\n').map((v) => v.trim()).filter(Boolean)
    return [] as string[]
  })()

  const metadataCostItems = (() => {
    const fmtUsd = (n: number) =>
      `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

    // New format: saved by the Cost Breakdown section ({description, quantity, unitPrice, total})
    const newRaw = (input as any).metadata?.costBreakdownItems
    if (Array.isArray(newRaw) && newRaw.length) {
      return newRaw
        .map((row) => {
          const desc = String((row as any)?.description ?? '').trim()
          const qty = Number((row as any)?.quantity ?? 0)
          const unit = Number((row as any)?.unitPrice ?? 0)
          const total = Number.isFinite(Number((row as any)?.total)) ? Number((row as any)?.total) : qty * unit
          return {
            item: qty !== 1 ? `${desc} (×${qty})` : desc,
            amount: Number.isFinite(total) && total ? fmtUsd(total) : '',
          }
        })
        .filter((row) => row.item && row.amount)
    }

    // Legacy format: {item, amount}
    const raw = (input as any).metadata?.costBreakdown
    if (Array.isArray(raw)) {
      return raw
        .map((row) => ({
          item: String((row as any)?.item ?? '').trim(),
          amount: String((row as any)?.amount ?? '').trim(),
        }))
        .filter((row) => row.item && row.amount)
    }
    return [] as Array<{ item: string; amount: string }>
  })()

  const defaultThemePrimary = '#1f3768'
  const defaultThemeAccent = '#c37a29'
  const defaultBadgeBg = '#d58a2f'

  let brand = docJson.header.brand
  let brandSub = 'CONSTRUCTION'
  let logoDataUri = resolveLogoDataUri()
  let themePrimary = defaultThemePrimary
  let themeAccent = defaultThemeAccent
  let badgeBackground = defaultBadgeBg
  let footerLine = 'Generated by BuildSwift - AI-Assisted Construction Documentation'

  if (input.applyAccountBranding) {
    const company = (input.brandingCompanyName ?? '').trim()
    const color = parseBrandingPrimaryColor(input.brandingPrimaryColor ?? '')
    const logo = (input.brandingLogoDataUri ?? '').trim()
    const hasAnything = Boolean(company || color || logo)
    if (hasAnything) {
      if (company) brand = company
      if (logo) logoDataUri = logo
      themePrimary = color || defaultThemePrimary
      themeAccent = color ? brandingAccentFromPrimary(color) : defaultThemeAccent
      // badgeBackground intentionally stays as defaultBadgeBg (amber) regardless of primary colour —
      // the number badge always uses the warm accent as shown in the standard form.
      footerLine = company
        ? `Generated by ${company} — BuildSwift`
        : 'Generated by BuildSwift - AI-Assisted Construction Documentation'
    }
    // When no branding is configured at all, keep the BuildSwift defaults unchanged.
  }

  const submittedByDisplay = (submittedBy || '').trim() || '—'

  const viewModel: ReviewPdfViewModel = {
    docType: input.docType,
    brand,
    brandSub,
    logoDataUri,
    themePrimary,
    themeAccent,
    badgeBackground,
    footerLine,
    reviewTitle: reviewHeaderTitleForDocType(input.docType),
    reviewNumber: reviewHeaderNumber(input),
    reviewStatus: input.reviewStatus ?? 'PENDING',
    docTypeLine: `${docJson.header.documentType} - REVIEW DOCUMENT`,
    generatedAt: `Generated: ${fmtDate(docJson.header.generatedAt)}`,
    contactAddress:
      input.contactAddress ||
      process.env.REVIEW_PDF_CONTACT_ADDRESS ||
      '123 Main Street\nAnytown, USA 12345',
    contactPhone: input.contactPhone || process.env.REVIEW_PDF_CONTACT_PHONE || '(555) 123-4567',
    contactEmail: input.contactEmail || process.env.REVIEW_PDF_CONTACT_EMAIL || 'info@buildswift.com',
    title: docJson.header.title,
    project: docJson.header.project,
    projectNo: input.projectNo || strongField(input.descriptionHtml, 'Project No') || '—',
    reportDate: primaryDate || fmtDate(docJson.header.generatedAt),
    actionNeededBy: actionNeededByResolved,
    contractDateDisplay,
    submittedBy: submittedByDisplay,
    rfiNo,
    specSection: specSection || '—',
    priority: formatPriorityLabel(input.priority) || '—',
    submittalTitle: docJson.header.title,
    questionIssue:
      firstSectionBodyByKeywords(docJson.sections, ['question', 'issue', 'description']) ||
      docJson.sections[0]?.body ||
      '-',
    contentSections,
    impactRows,
    attachments,
    linkedDocuments,
    costItems: metadataCostItems.length ? metadataCostItems : undefined,
    assumptions: metadataAssumptions.length ? metadataAssumptions : undefined,
    contractorName: ((input as any).metadata?.contractorName as string) || undefined,
    contractorRole: ((input as any).metadata?.contractorRole as string) || undefined,
    contractorPhone: ((input as any).metadata?.contractorPhone as string) || undefined,
    contractorEmail: ((input as any).metadata?.contractorEmail as string) || undefined,
    architectName: ((input as any).metadata?.architectName as string) || undefined,
    architectRole: ((input as any).metadata?.architectRole as string) || undefined,
    architectPhone: ((input as any).metadata?.architectPhone as string) || undefined,
    architectEmail: ((input as any).metadata?.architectEmail as string) || undefined,
    scheduleExtension: ((input as any).metadata?.scheduleExtension as string) || undefined,
    newCompletionDate: ((input as any).metadata?.newCompletionDate as string) || undefined,
    approvalRows,
    facts: docJson.facts,
    sections: docJson.sections,
    rawContent: docJson.fullText || '-',
  }

  const debugFingerprintInput = JSON.stringify({
    docType: viewModel.docType,
    reviewNumber: viewModel.reviewNumber,
    reviewStatus: viewModel.reviewStatus,
    project: viewModel.project,
    reportDate: viewModel.reportDate,
    contractDateDisplay: viewModel.contractDateDisplay,
    sectionLabels: viewModel.contentSections.map((s) => s.label),
    impactLabels: viewModel.impactRows.map((r) => r.label),
    approvalCount: viewModel.approvalRows.length,
  })
  const debugHash = createHash('sha256').update(debugFingerprintInput).digest('hex').slice(0, 12)
  const debugTime = new Date().toISOString()
  viewModel.debugInfo = `debug render=${debugTime} hash=${debugHash}`

  return await renderToBuffer(React.createElement(ReviewPdfDocument, { data: viewModel }) as any)
}

