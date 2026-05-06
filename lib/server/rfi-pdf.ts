import { readFileSync } from 'fs'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { extractH3Block, strongField } from '@/lib/document-html'
import { registerPdfArialFonts } from '@/lib/server/register-pdf-arial-fonts'
import { getOpenAIClient } from '@/lib/server/openai'
import { z } from 'zod'
import {
  RfiPdfDocument,
  type RfiApprovalRow,
  type RfiPdfViewModel,
} from '@/lib/server/rfi-pdf-document'

// ── Types ─────────────────────────────────────────────────────────────────────

export type RfiPdfInput = {
  title: string
  projectName: string
  descriptionHtml: string
  // Metadata fields
  rfiNo?: string | null
  projectNo?: string | null
  date?: string | null
  contractDate?: string | null
  submittedBy?: string | null
  priority?: string | null
  scheduleImpact?: string | null
  costImpact?: string | null
  scopeImpact?: string | null
  impactDescription?: string | null
  recipient?: string | null
  sender?: string | null
  reasonForRequest?: string | null
  conflictIdentification?: string | null
  missingInformation?: string | null
  clarificationRequired?: string | null
  drawingNumber?: string | null
  specificationSection?: string | null
  specificReference?: string | null
  location?: string | null
  responseContent?: string | null
  responder?: string | null
  responseDate?: string | null
  attachments?: Array<{
    fileName?: string | null
    fileType?: string | null
    notes?: string | null
  }> | null
  // Approval
  approvalRows?: Array<{
    title: string
    reviewerEmail?: string | null
    role: string
    action?: string
    signature: 'approved' | 'rejected' | 'pending'
    signatureName: string | null
    reference?: string | null
    signatureUrl?: string | null
    date: string
    notes: string
  }>
  // Branding
  /** Account logo data URI; falls back to default BuildSwift asset when absent */
  brandingLogoDataUri?: string | null
  brandingCompanyName?: string | null
  contactAddress?: string | null
  contactPhone?: string | null
  contactEmail?: string | null
  reviewStatus?: string
}

// ── Logo resolution ────────────────────────────────────────────────────────────

const DEFAULT_LOGO_PATHS = [
  process.env.REVIEW_PDF_LOGO_PATH,
  '/home/dev/.cursor/projects/home-dev-Videos-buildswift-app/assets/image-e6c1473e-0b20-42b1-8660-849caf77b75d.png',
].filter((v): v is string => Boolean(v))

let cachedLogoDataUri: string | null = null

function resolveLogoDataUri(): string {
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

// ── Helpers ────────────────────────────────────────────────────────────────────

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

function stripHtmlToText(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

const NA = 'N/A'
const NOT_PROVIDED = 'Not Provided'

function isBlankRfiResponseField(v: string | null | undefined): boolean {
  const t = (v ?? '').trim()
  return !t || t === NOT_PROVIDED || t === NA || t === '—'
}

function pickSourceApprovalRowForResponse(rows: RfiApprovalRow[]): RfiApprovalRow | null {
  if (!rows.length) return null
  // Response box should reflect an actual reviewer response, not "pending review".
  const decided = rows.filter((r) => r.reviewDecision === 'approved' || r.reviewDecision === 'rejected')
  return decided[decided.length - 1] ?? null
}

const aiRfiShape = z.object({
  summaryTitle: z.string(),
  questionDetails: z.object({
    detailedQuestion: z.string(),
    reasonForRequest: z.string(),
    conflictIdentification: z.string(),
    missingInformation: z.string(),
    clarificationRequired: z.string(),
  }),
  reference: z.object({
    drawingSheetNumber: z.string(),
    specificationSection: z.string(),
    specificReference: z.string(),
    location: z.string(),
  }),
  impacts: z.object({
    costImpact: z.string(),
    scheduleImpact: z.string(),
    description: z.string(),
  }),
})

async function composeRfiWithAi(input: {
  title: string
  descriptionText: string
  reasonForRequest: string
  conflictIdentification: string
  missingInformation: string
  clarificationRequired: string
  drawingSheetNumber: string
  specificationSection: string
  specificReference: string
  location: string
  costImpact: string
  scheduleImpact: string
  impactDescription: string
}): Promise<z.infer<typeof aiRfiShape> | null> {
  const openai = getOpenAIClient()
  if (!openai) return null
  const model = process.env.OPENAI_MODEL || 'gpt-4o'
  try {
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: `You are a construction document specialist. Return only valid JSON (no markdown). The JSON shape must match the Improve RFI "structured" output: summaryTitle; questionDetails { detailedQuestion, reasonForRequest, conflictIdentification, missingInformation, clarificationRequired }; reference { drawingSheetNumber, specificationSection, specificReference, location }; impacts { costImpact, scheduleImpact, description }. Use "None" | "Potential" | "Yes" for costImpact and scheduleImpact when appropriate. Use "${NA}" or "${NOT_PROVIDED}" for missing categorical or narrative fields. Never invent project facts not present in the input.`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            task: 'Polish RFI report sections for PDF',
            rules: [
              'Return JSON only',
              `If missing use "${NA}" or "${NOT_PROVIDED}"`,
              'Keep wording concise and professional',
              'Do not add facts not present in input',
            ],
            input,
          }),
        },
      ],
    })
    const raw = completion.choices[0]?.message?.content?.trim()
    if (!raw) return null
    const parsed = aiRfiShape.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

// ── Main function ──────────────────────────────────────────────────────────────

export async function generateRfiPdfBuffer(input: RfiPdfInput): Promise<Buffer> {
  registerPdfArialFonts()
  const companyName = input.brandingCompanyName?.trim() || 'BuildSwift Construction'

  const contactAddress =
    input.contactAddress?.trim() || '123 Main Street\nAnytown, USA 12345'
  const contactPhone = input.contactPhone?.trim() || '(555) 123-4567'
  const contactEmail = input.contactEmail?.trim() || 'info@buildswift.com'
  const logoDataUri =
    typeof input.brandingLogoDataUri === 'string' && input.brandingLogoDataUri.trim().length > 0
      ? input.brandingLogoDataUri.trim()
      : resolveLogoDataUri()
  const brand = companyName
  const brandSub = 'CONSTRUCTION'

  const html = input.descriptionHtml || ''

  const baseDescription =
    extractH3Block(html, 'Question / Issue') ||
    extractH3Block(html, 'Question') ||
    extractH3Block(html, 'Issue') ||
    extractH3Block(html, 'Questions / descriptions') ||
    extractH3Block(html, 'Description / Context') ||
    stripHtmlToText(html) ||
    strongField(html, 'Description') ||
    input.title ||
    NOT_PROVIDED

  const aiComposed =
    process.env.RFI_PDF_SKIP_AI === '1'
      ? null
      : await composeRfiWithAi({
          title: input.title?.trim() || NOT_PROVIDED,
          descriptionText: baseDescription,
          reasonForRequest: input.reasonForRequest?.trim() || NA,
          conflictIdentification: input.conflictIdentification?.trim() || NA,
          missingInformation: input.missingInformation?.trim() || NA,
          clarificationRequired: input.clarificationRequired?.trim() || NA,
          drawingSheetNumber: input.drawingNumber?.trim() || NA,
          specificationSection: input.specificationSection?.trim() || NA,
          specificReference: input.specificReference?.trim() || NA,
          location: input.location?.trim() || NA,
          costImpact: input.costImpact?.trim() || NA,
          scheduleImpact: input.scheduleImpact?.trim() || NA,
          impactDescription: input.impactDescription?.trim() || NA,
        })

  const attachments = (input.attachments ?? []).map((a) => ({
    fileName: a.fileName?.trim() || NOT_PROVIDED,
    fileType: a.fileType?.trim() || NOT_PROVIDED,
    notes: a.notes?.trim() || NA,
  }))

  // ── Approval rows (reviewers only; name prefers signature / non-email title) ─

  function looksLikeEmail(value: string): boolean {
    const t = (value || '').trim()
    return Boolean(t) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)
  }

  const approvalRowsMapped: RfiApprovalRow[] = (input.approvalRows ?? []).map((r) => {
    const title = (r.title || '').trim()
    const email = (r.reviewerEmail || '').trim()
    const sig = (r.signatureName || '').trim()
    const displayName =
      sig || (title && !looksLikeEmail(title) ? title : '') || email || NOT_PROVIDED
    const notesRaw = (r.notes || '').trim() || (r.reference || '').trim() || NA
    const sigRaw = typeof r.signatureUrl === 'string' ? r.signatureUrl.trim() : ''
    const signatureImageUri =
      sigRaw && (sigRaw.startsWith('data:') || /^https?:\/\//i.test(sigRaw)) ? sigRaw : null
    const actionLabel =
      r.action ||
      (r.signature === 'approved' ? 'Approved' : r.signature === 'rejected' ? 'Rejected' : 'Pending review')
    const typedSig = (r.signatureName || '').trim()
    const signatureTextFallback =
      signatureImageUri
        ? ''
        : typedSig
          ? typedSig
          : r.signature === 'pending'
            ? ''
            : actionLabel
    return {
      name: displayName,
      role: (r.role || 'Reviewer').trim() || 'Reviewer',
      signatureImageUri,
      signatureTextFallback,
      reviewDecision: r.signature,
      notes: notesRaw,
      date: r.date || NOT_PROVIDED,
    }
  })

  function isReviewActivityRole(role: string | null | undefined): boolean {
    const t = (role ?? '').trim().toLowerCase()
    if (!t) return true
    // Exclude obvious submitter rows; everything else counts as reviewer activity.
    if (t.includes('contractor') || t.includes('submitter')) return false
    return true
  }

  // Include reviewer activity rows even when role is "Engineer", "Owner", etc.
  const approvalRows = approvalRowsMapped.filter((row) => isReviewActivityRole(row.role))

  const rawReviewerRows = (input.approvalRows ?? []).filter((r) => isReviewActivityRole(r.role))
  const lastDecidedReviewerRaw = [...rawReviewerRows]
    .reverse()
    .find((r) => r.signature === 'approved' || r.signature === 'rejected')
  const reviewedByDisplay = (() => {
    if (!lastDecidedReviewerRaw) return '—'
    const fromSig = (lastDecidedReviewerRaw.signatureName || '').trim()
    if (fromSig) return fromSig
    const t = (lastDecidedReviewerRaw.title || '').trim()
    if (t && !looksLikeEmail(t)) return t
    return '—'
  })()

  // ── Footer ──────────────────────────────────────────────────────────────────

  const rfiNum =
    input.rfiNo?.trim() ||
    `RFI-${Buffer.from((input.title || 'rfi').toLowerCase()).toString('hex').slice(0, 8).toUpperCase()}`
  const normalizeStatus = (raw: string | undefined) => {
    const s = (raw || '').toLowerCase()
    if (s.includes('approved') || s.includes('answer')) return 'ANSWERED'
    if (s.includes('rejected') || s.includes('closed')) return 'CLOSED'
    return 'PENDING'
  }
  const normalizePriority = (raw?: string | null) => {
    const p = (raw || '').toLowerCase()
    if (p.includes('high') || p.includes('urgent')) return 'High'
    if (p.includes('low')) return 'Low'
    return 'Medium'
  }
  const toImpactFlag = (raw?: string | null) => {
    const v = (raw || '').toLowerCase()
    if (v.includes('yes')) return 'Yes'
    if (v.includes('potential') || v.includes('possible') || v.includes('maybe')) return 'Potential'
    if (v === NA.toLowerCase() || v === NOT_PROVIDED.toLowerCase()) return 'None'
    return v ? 'Potential' : 'None'
  }

  const responseSourceRow = pickSourceApprovalRowForResponse(approvalRows)

  const trimmedResponseContent = input.responseContent?.trim() ?? ''
  const responseContentResolved = !isBlankRfiResponseField(trimmedResponseContent)
    ? trimmedResponseContent
    : responseSourceRow && !isBlankRfiResponseField(responseSourceRow.notes)
      ? responseSourceRow.notes
      : NOT_PROVIDED

  const trimmedResponder = input.responder?.trim() ?? ''
  const responderResolved = !isBlankRfiResponseField(trimmedResponder)
    ? trimmedResponder
    : responseSourceRow && !isBlankRfiResponseField(responseSourceRow.name)
      ? responseSourceRow.name
      : NOT_PROVIDED

  const responseDateResolved = (() => {
    if (input.responseDate?.trim()) {
      const formatted = fmtLongDate(input.responseDate)
      if (!isBlankRfiResponseField(formatted)) return formatted
    }
    if (responseSourceRow?.date && !isBlankRfiResponseField(responseSourceRow.date)) {
      return responseSourceRow.date
    }
    return '—'
  })()

  const trimmedRecipient = input.recipient?.trim() ?? ''
  const recipientResolved = !isBlankRfiResponseField(trimmedRecipient)
    ? trimmedRecipient
    : !isBlankRfiResponseField(reviewedByDisplay)
      ? reviewedByDisplay
      : NOT_PROVIDED

  const reviewerEmailFromRow = (lastDecidedReviewerRaw?.reviewerEmail ?? '').trim()
  const recipientWithReviewerEmail = (() => {
    const email = reviewerEmailFromRow
    const b = recipientResolved.trim()
    if (!email) return b || NOT_PROVIDED
    if (!b || isBlankRfiResponseField(b)) return email
    if (b.toLowerCase().includes(email.toLowerCase())) return b
    return `${b}\n${email}`
  })()

  const viewModel: RfiPdfViewModel = {
    logoDataUri,
    brand,
    brandSub,
    contactAddress,
    contactPhone,
    contactEmail,
    rfiNumber: rfiNum,
    status: normalizeStatus(input.reviewStatus),
    projectName: input.projectName || NOT_PROVIDED,
    projectAddress: input.projectNo || NOT_PROVIDED,
    issueDate: fmtLongDate(input.date),
    requiredResponseDate: fmtLongDate(input.contractDate),
    recipient: recipientWithReviewerEmail,
    sender: input.sender?.trim() || input.submittedBy?.trim() || NOT_PROVIDED,
    summaryTitle: aiComposed?.summaryTitle || input.title || NOT_PROVIDED,
    priority: normalizePriority(input.priority),
    detailedQuestion: aiComposed?.questionDetails.detailedQuestion || baseDescription || NOT_PROVIDED,
    reasonForRequest: aiComposed?.questionDetails.reasonForRequest || input.reasonForRequest || NA,
    conflictIdentification:
      aiComposed?.questionDetails.conflictIdentification || input.conflictIdentification || NA,
    missingInformation: aiComposed?.questionDetails.missingInformation || input.missingInformation || NA,
    clarificationRequired:
      aiComposed?.questionDetails.clarificationRequired || input.clarificationRequired || NA,
    drawingSheetNumber: aiComposed?.reference.drawingSheetNumber || input.drawingNumber || NA,
    specificationSection:
      aiComposed?.reference.specificationSection || input.specificationSection || NA,
    specificReference: aiComposed?.reference.specificReference || input.specificReference || NA,
    location: aiComposed?.reference.location || input.location || NA,
    attachments,
    responseContent: responseContentResolved,
    responder: responderResolved,
    responseDate: responseDateResolved,
    costImpact: toImpactFlag(aiComposed?.impacts.costImpact || input.costImpact || input.scopeImpact || ''),
    scheduleImpact: toImpactFlag(aiComposed?.impacts.scheduleImpact || input.scheduleImpact || ''),
    impactDescription:
      aiComposed?.impacts.description || input.impactDescription || input.scopeImpact || NA,
    finalStatus: normalizeStatus(input.reviewStatus),
    reviewedBy: reviewedByDisplay,
    approvalRows,
    footerNote: `${rfiNum} — ${companyName}`,
  }

  return renderToBuffer(
    React.createElement(RfiPdfDocument, { data: viewModel }) as unknown as React.ReactElement<any>
  )
}
