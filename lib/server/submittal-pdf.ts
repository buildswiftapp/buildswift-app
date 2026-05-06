import { readFileSync } from 'fs'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { extractH3Block, strongField } from '@/lib/document-html'
import { registerPdfArialFonts } from '@/lib/server/register-pdf-arial-fonts'
import { getOpenAIClient } from '@/lib/server/openai'
import { z } from 'zod'
import {
  SubmittalPdfDocument,
  type SubmittalApprovalRow,
  type SubmittalAttachmentRow,
  type SubmittalPdfViewModel,
} from '@/lib/server/submittal-pdf-document'

// ── Types ─────────────────────────────────────────────────────────────────────

export type SubmittalPdfInput = {
  title: string
  projectName: string
  descriptionHtml: string
  /** Stable id for default submittal # when `submittalNo` is absent */
  documentId?: string | null
  /** Account logo data URI; falls back to env/default asset */
  brandingLogoDataUri?: string | null
  // Metadata
  submittalNo?: string | null
  projectAddress?: string | null
  dateIssued?: string | null
  requiredReviewDate?: string | null
  to?: string | null
  from?: string | null
  submittalType?: string | null
  priority?: string | null
  // Details
  detailedDescription?: string | null
  manufacturerVendor?: string | null
  materialProductName?: string | null
  modelNumber?: string | null
  quantity?: string | null
  // Reference info
  specificationSections?: string | null
  drawingSheetNumbers?: string | null
  detailReferences?: string | null
  relatedRfiNumbers?: string | null
  // Attachments
  attachments?: Array<{
    fileName?: string | null
    fileType?: string | null
    notes?: string | null
  }> | string[] | null
  // Review / response
  reviewStatus?: string | null
  reviewerComments?: string | null
  reviewedBy?: string | null
  reviewDate?: string | null
  // Impact
  costImpact?: string | null
  scheduleImpact?: string | null
  impactDescription?: string | null
  // Approval
  approvalRows?: Array<{
    title: string // legacy "name"
    role: string
    action?: string
    signature: 'approved' | 'rejected' | 'pending'
    signatureName: string | null
    date: string
    notes: string
    signatureUrl?: string | null
  }>
  // Branding
  brandingCompanyName?: string | null
  contactAddress?: string | null
  contactPhone?: string | null
  contactEmail?: string | null
  // legacy (used by old routes)
  projectNo?: string | null
  date?: string | null
  actionNeededBy?: string | null
  specSection?: string | null
  manufacturer?: string | null
  productName?: string | null
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

function isBlankSubmittalReviewDisplay(v: string | null | undefined): boolean {
  const t = (v ?? '').trim()
  return !t || t === NOT_PROVIDED || t === NA || t === 'N/A' || t === '—'
}

function pickSubmittalReviewerActivityRow(rows: SubmittalApprovalRow[]): SubmittalApprovalRow | null {
  if (!rows.length) return null
  const decided = rows.filter((r) => r.action === 'Approved' || r.action === 'Rejected')
  const pool = decided.length ? decided : rows
  return pool[pool.length - 1] ?? null
}

const aiSubmittalShape = z.object({
  submittalTitle: z.string(),
  detailedDescription: z.string(),
  manufacturerVendor: z.string(),
  materialProductName: z.string(),
  modelNumber: z.string(),
  quantity: z.string(),
  specificationSections: z.string(),
  drawingSheetNumbers: z.string(),
  detailReferences: z.string(),
  relatedRfiNumbers: z.string(),
  reviewerComments: z.string(),
  submittalType: z.string(),
})

async function composeSubmittalWithAi(input: {
  title: string
  descriptionText: string
  manufacturerVendor: string
  materialProductName: string
  modelNumber: string
  quantity: string
  specificationSections: string
  drawingSheetNumbers: string
  detailReferences: string
  relatedRfiNumbers: string
  reviewerComments: string
  submittalType: string
}): Promise<z.infer<typeof aiSubmittalShape> | null> {
  const openai = getOpenAIClient()
  if (!openai) return null

  const model = process.env.OPENAI_MODEL || 'gpt-4o'
  const system = `You are a construction project engineer preparing a formal Submittal PDF. Normalize and professionalize the provided data.
Return JSON only. Rules:
- Improve the detailed description for clarity and formality while staying accurate to facts given.
- Ensure manufacturer/vendor, material/product, model, and quantity are complete and coherent; use "N/A" only where truly unknown.
- Align specification sections and drawing references with conventional CSI / sheet notation (comma-separated lists, e.g. "08 44 13"; "A-501, A-502").
- Enhance reviewer-comments text where provided so they read complete and actionable; otherwise "N/A" is acceptable.
- submittalType must be one of: Shop Drawing, Product Data, Samples, Mockups, Other (prefer the closest match).
- Keep each string reasonably concise but do not omit important technical detail present in the input.`

  try {
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: JSON.stringify(input),
        },
      ],
    })

    const content =
      typeof completion.choices[0]?.message?.content === 'string'
        ? completion.choices[0].message.content.trim()
        : ''
    if (!content) return null
    const parsed = aiSubmittalShape.safeParse(JSON.parse(content))
    if (!parsed.success) return null
    return parsed.data
  } catch {
    return null
  }
}

// ── Main function ──────────────────────────────────────────────────────────────

export async function generateSubmittalPdfBuffer(
  input: SubmittalPdfInput
): Promise<Buffer> {
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
  const themePrimary = '#1d4d3f'

  const html = input.descriptionHtml || ''

  // Back-compat: map legacy keys to new
  const dateIssuedRaw = input.dateIssued ?? input.date ?? null
  const requiredReviewRaw = input.requiredReviewDate ?? input.actionNeededBy ?? null
  const projectAddressRaw = input.projectAddress ?? input.projectNo ?? null
  const manufacturerVendorRaw = input.manufacturerVendor ?? input.manufacturer ?? null
  const materialProductRaw = input.materialProductName ?? input.productName ?? null
  const specSectionsRaw = input.specificationSections ?? input.specSection ?? null

  const descriptionText = stripHtmlToText(html)
  const detailedDescriptionBase =
    input.detailedDescription?.trim() ||
    extractH3Block(html, 'Detailed Description') ||
    extractH3Block(html, 'Description') ||
    extractH3Block(html, 'Question / Issue') ||
    strongField(html, 'Description') ||
    descriptionText ||
    NOT_PROVIDED

  const submittalTitleBase = (input.title || '').trim() || NOT_PROVIDED

  const aiComposed = await composeSubmittalWithAi({
    title: submittalTitleBase,
    descriptionText: detailedDescriptionBase,
    manufacturerVendor: manufacturerVendorRaw?.trim() || NA,
    materialProductName: materialProductRaw?.trim() || NA,
    modelNumber: input.modelNumber?.trim() || NA,
    quantity: input.quantity?.trim() || NA,
    specificationSections: specSectionsRaw?.trim() || NA,
    drawingSheetNumbers: input.drawingSheetNumbers?.trim() || NA,
    detailReferences: input.detailReferences?.trim() || NA,
    relatedRfiNumbers: input.relatedRfiNumbers?.trim() || NA,
    reviewerComments: input.reviewerComments?.trim() || NA,
    submittalType: input.submittalType?.trim() || 'Other',
  })

  const normalizeStatus = (raw: string | null | undefined) => {
    const s = (raw || '').toLowerCase()
    if (s.includes('reject')) return 'REJECTED'
    if (s.includes('revise') || s.includes('resubmit')) return 'REVISE & RESUBMIT'
    if (s.includes('noted') || s.includes('approved as noted')) return 'APPROVED AS NOTED'
    if (s.includes('approve')) return 'APPROVED'
    if (s.includes('pending')) return 'PENDING REVIEW'
    return raw?.trim() ? raw.trim().toUpperCase() : 'PENDING REVIEW'
  }

  const normalizePriority = (raw?: string | null) => {
    const p = (raw || '').toLowerCase()
    if (p.includes('high') || p.includes('urgent')) return 'High'
    if (p.includes('low')) return 'Low'
    if (p.includes('medium') || p.includes('normal')) return 'Medium'
    return raw?.trim() ? raw.trim() : 'Medium'
  }

  const docIdCompact = (input.documentId ?? '').replace(/-/g, '')
  const subNum =
    input.submittalNo?.trim() ||
    (docIdCompact.length >= 6
      ? `SUB-${docIdCompact.slice(0, 12).toUpperCase()}`
      : `SUB-${Buffer.from((input.title || 'submittal').toLowerCase()).toString('hex').slice(0, 8).toUpperCase()}`)

  const attachments: SubmittalAttachmentRow[] = Array.isArray(input.attachments)
    ? (typeof input.attachments[0] === 'string'
        ? (input.attachments as string[]).filter(Boolean).map((name) => {
            const ext = (name.split('.').pop() || '').toUpperCase()
            return { fileName: name, fileType: ext || NA, notes: '' }
          })
        : (input.attachments as Array<{ fileName?: string | null; fileType?: string | null; notes?: string | null }>).map((a) => ({
            fileName: a.fileName?.trim() || '',
            fileType: a.fileType?.trim() || '',
            notes: a.notes?.trim() || '',
          })))
    : []

  const approvalRows: SubmittalApprovalRow[] = (input.approvalRows ?? []).map((r) => ({
    name: r.title || NOT_PROVIDED,
    role: r.role || 'Reviewer',
    action:
      r.action ||
      (r.signature === 'approved' ? 'Approved' : r.signature === 'rejected' ? 'Rejected' : 'Pending review'),
    date: r.date || NOT_PROVIDED,
    notes: r.notes || NA,
    signatureName: r.signatureName || null,
    signatureUrl: r.signatureUrl || null,
  }))

  function isReviewActivityRole(role: string | null | undefined): boolean {
    const t = (role ?? '').trim().toLowerCase()
    if (!t) return true
    // Exclude obvious non-review activity rows.
    if (t.includes('contractor') || t.includes('submitter')) return false
    return true
  }

  const reviewActivityRows = approvalRows.filter((r) => isReviewActivityRole(r.role))
  const reviewerActivityRow = pickSubmittalReviewerActivityRow(reviewActivityRows)

  const fromDisplay = input.from?.trim() || input.contactAddress?.trim() || NOT_PROVIDED
  const toDisplay = (() => {
    const explicit = input.to?.trim() || ''
    if (!isBlankSubmittalReviewDisplay(explicit) && explicit !== NOT_PROVIDED) return explicit
    const inferred = (reviewerActivityRow?.name ?? '').trim()
    if (!isBlankSubmittalReviewDisplay(inferred) && inferred !== NOT_PROVIDED) return inferred
    return NOT_PROVIDED
  })()

  /** Full workflow log on PDF (submitters + reviewers) per product spec */
  const ensuredApprovalRows = approvalRows

  /** Signature line for Review / Response block — prefer reviewer-role rows */
  const pickReviewerSignature = () => {
    const rows = ensuredApprovalRows
    const reviewerMatch = [...rows]
      .reverse()
      .find(
        (r) =>
          isReviewActivityRole(r.role) &&
          ((r.signatureUrl || '').trim().length > 0 || !!(r.signatureName || '').trim().length),
      )
    if (reviewerMatch) {
      return {
        url: (reviewerMatch.signatureUrl || '').trim(),
        name: reviewerMatch.signatureName ?? null,
      }
    }
    const anySig = [...rows]
      .reverse()
      .find((r) => (r.signatureUrl || '').trim().length > 0 || !!(r.signatureName || '').trim().length)
    if (anySig) return { url: (anySig.signatureUrl || '').trim(), name: anySig.signatureName ?? null }
    return { url: '', name: null as string | null }
  }

  const { url: reviewerSignatureUrl, name: reviewerSignatureName } = pickReviewerSignature()

  const commentsPrimary = (aiComposed?.reviewerComments ?? '').trim() || (input.reviewerComments ?? '').trim()
  const reviewerCommentsResolved =
    !isBlankSubmittalReviewDisplay(commentsPrimary) && commentsPrimary !== NA
      ? commentsPrimary
      : reviewerActivityRow &&
          !isBlankSubmittalReviewDisplay(reviewerActivityRow.notes) &&
          reviewerActivityRow.notes !== NA
        ? reviewerActivityRow.notes.trim()
        : NA

  const trimmedReviewedBy = input.reviewedBy?.trim() ?? ''
  const reviewedByResolved = !isBlankSubmittalReviewDisplay(trimmedReviewedBy)
    ? trimmedReviewedBy
    : reviewerActivityRow &&
        !isBlankSubmittalReviewDisplay(reviewerActivityRow.name) &&
        reviewerActivityRow.name !== NOT_PROVIDED
      ? reviewerActivityRow.name
      : NOT_PROVIDED

  const reviewDateResolved = (() => {
    if (input.reviewDate?.trim()) {
      const fd = fmtLongDate(input.reviewDate)
      if (!isBlankSubmittalReviewDisplay(fd) && fd !== '—') return fd
    }
    if (
      reviewerActivityRow?.date &&
      !isBlankSubmittalReviewDisplay(reviewerActivityRow.date) &&
      reviewerActivityRow.date !== NOT_PROVIDED
    ) {
      return reviewerActivityRow.date
    }
    return '—'
  })()

  const footerNote = `${subNum} — ${companyName}`

  const viewModel: SubmittalPdfViewModel = {
    logoDataUri,
    brand,
    brandSub,
    themePrimary,
    contactAddress,
    contactPhone,
    contactEmail,
    projectName: input.projectName || NOT_PROVIDED,
    projectAddress: projectAddressRaw?.trim() || NOT_PROVIDED,
    submittalNumber: subNum,
    status: normalizeStatus(input.reviewStatus || 'PENDING REVIEW'),
    dateIssued: fmtLongDate(dateIssuedRaw),
    requiredReviewDate: fmtLongDate(requiredReviewRaw),
    to: toDisplay,
    from: fromDisplay,
    submittalTitle: aiComposed?.submittalTitle || submittalTitleBase,
    submittalType: aiComposed?.submittalType || input.submittalType?.trim() || 'Other',
    priority: normalizePriority(input.priority),
    detailedDescription: aiComposed?.detailedDescription || detailedDescriptionBase,
    manufacturerVendor: aiComposed?.manufacturerVendor || manufacturerVendorRaw?.trim() || NA,
    materialProductName: aiComposed?.materialProductName || materialProductRaw?.trim() || NA,
    modelNumber: aiComposed?.modelNumber || input.modelNumber?.trim() || NA,
    quantity: aiComposed?.quantity || input.quantity?.trim() || NA,
    specificationSections: aiComposed?.specificationSections || specSectionsRaw?.trim() || NA,
    drawingSheetNumbers: aiComposed?.drawingSheetNumbers || input.drawingSheetNumbers?.trim() || NA,
    detailReferences: aiComposed?.detailReferences || input.detailReferences?.trim() || NA,
    relatedRfiNumbers: aiComposed?.relatedRfiNumbers || input.relatedRfiNumbers?.trim() || NA,
    attachments,
    reviewerComments: reviewerCommentsResolved,
    reviewedBy: reviewedByResolved,
    reviewDate: reviewDateResolved,
    reviewerSignatureUrl,
    reviewerSignatureName,
    footerNote,
  }

  return renderToBuffer(
    React.createElement(SubmittalPdfDocument, { data: viewModel }) as unknown as React.ReactElement<any>
  )
}
