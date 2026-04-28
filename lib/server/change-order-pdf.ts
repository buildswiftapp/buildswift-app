import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { extractH3Block } from '@/lib/document-html'
import {
  ChangeOrderPdfDocument,
  type ChangeOrderPdfViewModel,
  type CoApprovalRow,
  type CoCostItem,
} from '@/lib/server/change-order-pdf-document'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ChangeOrderPdfInput = {
  title: string
  projectName: string
  descriptionHtml: string
  // CO metadata
  coNumber?: string | null
  projectNo?: string | null
  date?: string | null
  contractDate?: string | null
  submittedBy?: string | null
  priority?: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  scheduleImpact?: string | null
  newCompletionDate?: string | null
  reason?: string | null
  totalCost?: number | null
  costBreakdownItems?: Array<{
    description: string
    quantity: number
    unitPrice: number
    total: number
  }> | null
  // Approval
  approvalRows?: Array<{
    title: string
    role: string
    signature: 'approved' | 'rejected' | 'pending'
    signatureName: string | null
    signatureUrl: string | null
    date: string
    notes: string
  }>
  // Branding
  brandingCompanyName?: string | null
  contactAddress?: string | null
  contactPhone?: string | null
  contactEmail?: string | null
}

// ── Logo resolution ───────────────────────────────────────────────────────────

const DEFAULT_LOGO_PATHS = [
  process.env.REVIEW_PDF_LOGO_PATH,
  '/home/dev/.cursor/projects/home-dev-Videos-buildswift-app/assets/image-e6c1473e-0b20-42b1-8660-849caf77b75d.png',
].filter((v): v is string => Boolean(v))

let cachedLogoDataUri: string | null = null

function resolveLogoDataUri(): string {
  if (cachedLogoDataUri) return cachedLogoDataUri
  for (const p of DEFAULT_LOGO_PATHS) {
    try {
      const bytes = readFileSync(p)
      cachedLogoDataUri = `data:image/png;base64,${bytes.toString('base64')}`
      return cachedLogoDataUri
    } catch {
      // try next
    }
  }
  return ''
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtLongDate(raw: string | null | undefined): string {
  if (!raw) return '—'
  const t = Date.parse(raw.trim().includes('T') ? raw.trim() : raw.trim() + 'T12:00:00')
  if (Number.isNaN(t)) return raw
  return new Date(t).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function fmtUsdNum(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Main function ─────────────────────────────────────────────────────────────

export async function generateChangeOrderPdfBuffer(input: ChangeOrderPdfInput): Promise<Buffer> {
  const companyName = input.brandingCompanyName?.trim() || 'BuildSwift Construction'

  // Raw multi-line address for the right-hand contact block
  const rawAddress = (input.contactAddress || '123 Main Street\nAnytown, USA 12345')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')

  const phone = input.contactPhone || '(555) 123-4567'
  const email = input.contactEmail || 'info@buildswift.com'

  // Default branding
  const logoDataUri = resolveLogoDataUri()
  const brand = 'BUILDSWIFT'
  const brandSub = 'CONSTRUCTION'
  const themePrimary = '#1f3768'

  // Extract narrative content from the HTML description
  const reasonForChange =
    input.reason ||
    extractH3Block(input.descriptionHtml, 'Reason for Change') ||
    extractH3Block(input.descriptionHtml, 'Reason for Change Order') ||
    '—'

  const descriptionOfChanges =
    extractH3Block(input.descriptionHtml, 'Description of Change') ||
    extractH3Block(input.descriptionHtml, 'Description of Changes') ||
    input.title ||
    '—'

  // Schedule impact → time added display
  const rawSchedule = (input.scheduleImpact ?? '').trim()
  const timeAdded = rawSchedule && rawSchedule !== 'No Impact' && rawSchedule !== 'none' ? rawSchedule : ''

  const newCompletionDate = input.newCompletionDate?.trim() || ''

  // Submitted by — person only; never substitute company name
  const submittedBy = input.submittedBy?.trim() || '—'

  // Priority label — capitalise first letter
  const priorityLabel = input.priority
    ? input.priority.charAt(0).toUpperCase() + input.priority.slice(1).toLowerCase()
    : '—'

  // Cost breakdown items
  const costBreakdownItems: CoCostItem[] = (input.costBreakdownItems ?? [])
    .filter((item) => item.description?.trim() || item.total > 0)
    .map((item) => ({
      description: item.description?.trim() || '—',
      quantity: Number.isFinite(item.quantity) ? item.quantity : 1,
      unitPrice: Number.isFinite(item.unitPrice) ? item.unitPrice : 0,
      total: Number.isFinite(item.total) ? item.total : item.quantity * item.unitPrice,
    }))

  const totalCost =
    costBreakdownItems.length > 0
      ? costBreakdownItems.reduce((s, r) => s + r.total, 0)
      : (input.totalCost ?? 0)

  // Approval rows
  const approvalRows: CoApprovalRow[] = (input.approvalRows ?? []).map((r) => ({
    title: r.title || r.role || 'Reviewer',
    name: r.signatureName || r.title || '—',
    signature: r.signature,
    signatureName: r.signatureName,
    signatureUrl: r.signatureUrl,
    date: r.date || '—',
    notes: r.notes || '—',
  }))

  // Distribution line — deduplicate titles
  const distribution = approvalRows.length
    ? Array.from(new Set(approvalRows.map((r) => r.title).filter(Boolean))).join(' \u2022 ')
    : companyName

  // Footer note
  const footerParts: string[] = [`Change Order ${input.coNumber || '\u2014'}`, input.projectName]
  if (input.projectNo) footerParts.push(`(${input.projectNo})`)
  if (input.date) footerParts.push(`\u2014 Generated ${fmtLongDate(input.date)}`)
  footerParts.push(`\u2014 ${companyName}`)
  const footerNote = footerParts.join(' ')

  // Debug hash (content-based)
  const debugHash = createHash('sha256')
    .update(
      JSON.stringify({
        coNumber: input.coNumber,
        project: input.projectName,
        totalCost,
        itemCount: costBreakdownItems.length,
        approvalCount: approvalRows.length,
      })
    )
    .digest('hex')
    .slice(0, 12)

  const viewModel: ChangeOrderPdfViewModel = {
    logoDataUri,
    brand,
    brandSub,
    themePrimary,
    contactAddress: rawAddress,
    companyName,
    companyPhone: phone,
    companyEmail: email,
    coNumber: input.coNumber || 'CO-001',
    status: input.status || 'PENDING',
    projectName: input.projectName || '—',
    projectNo: input.projectNo || '—',
    date: fmtLongDate(input.date),
    contractDate: fmtLongDate(input.contractDate),
    submittedBy,
    priority: priorityLabel,
    reasonForChange,
    descriptionOfChanges,
    title: input.title || '—',
    timeAdded,
    newCompletionDate,
    costBreakdownItems,
    totalCost,
    approvalRows,
    distribution,
    footerNote,
    debugInfo: `debug render=${new Date().toISOString()} hash=${debugHash}`,
  }

  return renderToBuffer(
    React.createElement(ChangeOrderPdfDocument, { data: viewModel }) as React.ReactElement
  )
}
