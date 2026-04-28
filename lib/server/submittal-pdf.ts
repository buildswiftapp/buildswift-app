import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { extractH3Block, strongField } from '@/lib/document-html'
import {
  SubmittalPdfDocument,
  type SubmittalApprovalRow,
  type SubmittalLinkedDoc,
  type SubmittalPdfViewModel,
} from '@/lib/server/submittal-pdf-document'
import { readFileSync } from 'fs'

// ── Types ─────────────────────────────────────────────────────────────────────

export type SubmittalPdfInput = {
  title: string
  projectName: string
  descriptionHtml: string
  // Metadata
  submittalNo?: string | null
  projectNo?: string | null
  date?: string | null
  contractDate?: string | null
  submittedBy?: string | null
  priority?: string | null
  rfiNo?: string | null
  actionNeededBy?: string | null
  specSection?: string | null
  manufacturer?: string | null
  productName?: string | null
  attachments?: string[] | null
  linkedDocuments?: Array<{ id: string; title: string }> | null
  // Approval
  approvalRows?: Array<{
    title: string
    role: string
    signature: 'approved' | 'rejected' | 'pending'
    signatureName: string | null
    date: string
    notes: string
  }>
  // Branding
  brandingCompanyName?: string | null
  contactAddress?: string | null
  contactPhone?: string | null
  contactEmail?: string | null
  reviewStatus?: string
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

// ── Main function ──────────────────────────────────────────────────────────────

export async function generateSubmittalPdfBuffer(
  input: SubmittalPdfInput
): Promise<Buffer> {
  const companyName = input.brandingCompanyName?.trim() || 'BuildSwift Construction'

  const contactAddress =
    input.contactAddress?.trim() || '123 Main Street\nAnytown, USA 12345'
  const contactPhone = input.contactPhone?.trim() || '(555) 123-4567'
  const contactEmail = input.contactEmail?.trim() || 'info@buildswift.com'

  const DEFAULT_LOGO_PATHS = [
    process.env.REVIEW_PDF_LOGO_PATH,
    '/home/dev/.cursor/projects/home-dev-Videos-buildswift-app/assets/image-e6c1473e-0b20-42b1-8660-849caf77b75d.png',
  ].filter((v): v is string => Boolean(v))

  let logoDataUri = ''
  for (const p of DEFAULT_LOGO_PATHS) {
    try {
      const bytes = readFileSync(p)
      logoDataUri = `data:image/png;base64,${bytes.toString('base64')}`
      break
    } catch {
      // try next
    }
  }

  const brand = companyName
  const brandSub = 'CONSTRUCTION'
  const themePrimary = '#1f3768'

  const html = input.descriptionHtml || ''

  // ── Content sections ───────────────────────────────────────────────────────

  const questionIssue =
    extractH3Block(html, 'Question / Issue') ||
    extractH3Block(html, 'Question') ||
    extractH3Block(html, 'Description') ||
    strongField(html, 'Description') ||
    '—'

  // ── Submittal title (the product / item being submitted) ───────────────────

  const submittalTitle =
    (input.productName?.trim()) ||
    (input.manufacturer?.trim()
      ? `${input.manufacturer.trim()}${input.title ? ` — ${input.title}` : ''}`
      : '') ||
    input.title ||
    '—'

  // ── Attachments ─────────────────────────────────────────────────────────────

  const attachments = (input.attachments ?? []).filter(Boolean)

  // ── Linked documents ────────────────────────────────────────────────────────

  const linkedDocuments: SubmittalLinkedDoc[] = (input.linkedDocuments ?? []).map((d) => ({
    id: d.id || '—',
    title: d.title || '',
  }))

  // ── Approval rows ───────────────────────────────────────────────────────────

  const approvalRows: SubmittalApprovalRow[] = (input.approvalRows ?? []).map((r) => ({
    title: r.title || '—',
    role: r.role || 'Reviewer',
    signature: r.signature,
    signatureName: r.signatureName || null,
    signatureUrl: r.signatureUrl || null,
    date: r.date || '—',
    notes: r.notes || '—',
  }))

  // ── Priority ────────────────────────────────────────────────────────────────

  const priorityLabel = input.priority
    ? input.priority.charAt(0).toUpperCase() + input.priority.slice(1).toLowerCase()
    : '—'

  // ── Footer ──────────────────────────────────────────────────────────────────

  const subNum = input.submittalNo || '001'
  const footerParts = [
    `Submittal ${subNum}`,
    input.projectName,
    input.projectNo ? `(${input.projectNo})` : '',
    input.date ? `\u2014 Generated ${fmtLongDate(input.date)}` : '',
    `\u2014 ${companyName}`,
  ].filter(Boolean)
  const footerNote = footerParts.join(' ')

  const viewModel: SubmittalPdfViewModel = {
    logoDataUri,
    brand,
    brandSub,
    themePrimary,
    contactAddress,
    contactPhone,
    contactEmail,
    submittalNumber: subNum,
    status: input.reviewStatus || 'PENDING',
    projectName: input.projectName || '—',
    projectNo: input.projectNo || '—',
    date: fmtLongDate(input.date),
    contractDate: fmtLongDate(input.contractDate),
    submittedBy: input.submittedBy?.trim() || '—',
    priority: priorityLabel,
    rfiNo: input.rfiNo?.trim() || '—',
    actionNeededBy: fmtLongDate(input.actionNeededBy),
    specSection: input.specSection?.trim() || '—',
    manufacturer: input.manufacturer?.trim() || '—',
    submittalTitle,
    questionIssue,
    attachments,
    linkedDocuments,
    approvalRows,
    footerNote,
  }

  return renderToBuffer(
    React.createElement(SubmittalPdfDocument, { data: viewModel }) as React.ReactElement
  )
}
