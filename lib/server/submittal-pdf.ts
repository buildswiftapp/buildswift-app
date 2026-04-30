import { readFileSync } from 'fs'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { extractH3Block, strongField } from '@/lib/document-html'
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
  impactDescription: z.string(),
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
  impactDescription: string
  submittalType: string
}): Promise<z.infer<typeof aiSubmittalShape> | null> {
  const openai = getOpenAIClient()
  if (!openai) return null

  const model = process.env.OPENAI_MODEL || 'gpt-4o'
  const system = `You are a construction project engineer preparing a formal Submittal PDF. Normalize and improve the provided data.
- Return JSON only.
- Keep content concise for a single-page PDF.
- Use "N/A" for missing unknown technical values.
- Use clear, professional construction language.
- Keep spec sections and drawings in compact comma-separated form (e.g., "08 44 13"; "A-501, A-502").`

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
  const companyName = input.brandingCompanyName?.trim() || 'BuildSwift Construction'

  const contactAddress =
    input.contactAddress?.trim() || '123 Main Street\nAnytown, USA 12345'
  const contactPhone = input.contactPhone?.trim() || '(555) 123-4567'
  const contactEmail = input.contactEmail?.trim() || 'info@buildswift.com'

  const logoDataUri = resolveLogoDataUri()

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
    impactDescription: input.impactDescription?.trim() || NA,
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

  const toImpactFlag = (raw?: string | null) => {
    const v = (raw || '').toLowerCase()
    if (v.includes('yes')) return 'Yes'
    if (v.includes('potential') || v.includes('possible') || v.includes('maybe')) return 'Potential'
    if (v === NA.toLowerCase() || v === NOT_PROVIDED.toLowerCase()) return 'None'
    return v ? 'Potential' : 'None'
  }

  const subNum =
    input.submittalNo?.trim() ||
    `SUB-${Buffer.from((input.title || 'submittal').toLowerCase()).toString('hex').slice(0, 8).toUpperCase()}`

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

  const fromDisplay = input.from?.trim() || input.contactAddress?.trim() || NOT_PROVIDED
  const toDisplay = input.to?.trim() || NOT_PROVIDED

  /** Approval / review log: reviewer activity only (omit submitter / submission row). */
  const ensuredApprovalRows = approvalRows.filter(
    (row) => (row.role || '').trim().toLowerCase() === 'reviewer'
  )

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
    status: normalizeStatus(input.reviewStatus),
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
    reviewStatus: normalizeStatus(input.reviewStatus),
    reviewerComments: aiComposed?.reviewerComments || input.reviewerComments?.trim() || NA,
    reviewedBy: input.reviewedBy?.trim() || NOT_PROVIDED,
    reviewDate: fmtLongDate(input.reviewDate),
    costImpact: toImpactFlag(input.costImpact),
    scheduleImpact: toImpactFlag(input.scheduleImpact),
    impactDescription:
      (() => {
        const v = (aiComposed?.impactDescription || input.impactDescription?.trim() || '').trim()
        if (!v || v === NA) return 'No impact anticipated at this time.'
        return v
      })(),
    finalStatus: normalizeStatus(input.reviewStatus),
    approvalRows: ensuredApprovalRows,
    footerNote,
  }

  return renderToBuffer(
    React.createElement(SubmittalPdfDocument, { data: viewModel }) as React.ReactElement
  )
}
