import { readFileSync } from 'fs'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { extractH3Block, strongField } from '@/lib/document-html'
import {
  RfiPdfDocument,
  type RfiApprovalRow,
  type RfiImpactItem,
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
  attachments?: string[] | null
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

// ── Main function ──────────────────────────────────────────────────────────────

export async function generateRfiPdfBuffer(input: RfiPdfInput): Promise<Buffer> {
  const companyName = input.brandingCompanyName?.trim() || 'BuildSwift Construction'

  const contactAddress =
    input.contactAddress?.trim() || '123 Main Street\nAnytown, USA 12345'
  const contactPhone = input.contactPhone?.trim() || '(555) 123-4567'
  const contactEmail = input.contactEmail?.trim() || 'info@buildswift.com'
  const logoDataUri = resolveLogoDataUri()
  const brand = companyName
  const brandSub = 'CONSTRUCTION'
  const themePrimary = '#1f3768'

  const html = input.descriptionHtml || ''

  // ── Section content ────────────────────────────────────────────────────────

  // "Reason for Change Order" — use title as the canonical reason
  const reasonForChange =
    extractH3Block(html, 'Reason for Change') ||
    extractH3Block(html, 'Reason for Change Order') ||
    strongField(html, 'Title') ||
    input.title ||
    '—'

  // "Question / Issue"
  const questionIssue =
    extractH3Block(html, 'Question / Issue') ||
    extractH3Block(html, 'Question') ||
    extractH3Block(html, 'Issue') ||
    extractH3Block(html, 'Questions / descriptions') ||
    extractH3Block(html, 'Description / Context') ||
    stripHtmlToText(html) ||
    '—'

  // "Contractor's Proposed Interpretation"
  const proposedInterpretation =
    extractH3Block(html, "Contractor's Proposed Interpretation") ||
    extractH3Block(html, 'Proposed Interpretation') ||
    extractH3Block(html, 'Notes') ||
    '—'

  // ── Impact items ────────────────────────────────────────────────────────────

  const impactItems: RfiImpactItem[] = []

  const scheduleImpact =
    input.scheduleImpact ||
    extractH3Block(html, 'Schedule Impact') ||
    ''
  const costImpact =
    input.costImpact ||
    extractH3Block(html, 'Cost Impact') ||
    ''
  const scopeImpact =
    input.scopeImpact ||
    extractH3Block(html, 'Scope Impact') ||
    ''

  if (scheduleImpact) impactItems.push({ label: 'Schedule Impact', value: scheduleImpact })
  if (costImpact) impactItems.push({ label: 'Cost Impact', value: costImpact })
  if (scopeImpact) impactItems.push({ label: 'Scope Impact', value: scopeImpact })

  // ── Attachments ─────────────────────────────────────────────────────────────

  const attachments = (input.attachments ?? []).filter(Boolean)

  // ── Approval rows ───────────────────────────────────────────────────────────

  const approvalRows: RfiApprovalRow[] = (input.approvalRows ?? []).map((r) => ({
    title: r.title || '—',
    role: r.role || 'Reviewer',
    signatureName: r.signatureName || null,
    signatureUrl: r.signatureUrl || null,
    date: r.date || '—',
    notes: r.notes || '—',
  }))

  // ── Footer ──────────────────────────────────────────────────────────────────

  const rfiNum = input.rfiNo || 'RFI-001'
  const footerParts = [
    rfiNum,
    input.projectName,
    input.projectNo ? `(${input.projectNo})` : '',
    input.date ? `\u2014 Generated ${fmtLongDate(input.date)}` : '',
    `\u2014 ${companyName}`,
  ].filter(Boolean)
  const footerNote = footerParts.join(' ')

  // ── Priority ────────────────────────────────────────────────────────────────

  const priorityLabel = input.priority
    ? input.priority.charAt(0).toUpperCase() + input.priority.slice(1).toLowerCase()
    : '—'

  // Suppress unused resolveLogoDataUri — kept for future custom branding support
  void resolveLogoDataUri()

  const viewModel: RfiPdfViewModel = {
    logoDataUri,
    brand,
    brandSub,
    themePrimary,
    contactAddress,
    contactPhone,
    contactEmail,
    rfiNumber: rfiNum,
    status: input.reviewStatus || 'PENDING',
    projectName: input.projectName || '—',
    projectNo: input.projectNo || '—',
    date: fmtLongDate(input.date),
    contractDate: fmtLongDate(input.contractDate),
    submittedBy: input.submittedBy?.trim() || '—',
    priority: priorityLabel,
    reasonForChange,
    questionIssue,
    proposedInterpretation,
    impactItems,
    attachments,
    approvalRows,
    footerNote,
  }

  return renderToBuffer(
    React.createElement(RfiPdfDocument, { data: viewModel }) as React.ReactElement
  )
}
