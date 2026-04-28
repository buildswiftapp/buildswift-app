import { createHash } from 'crypto'
import {
  ensureRfiFullDescriptionHtml,
  ensureSubmittalFullDescriptionHtml,
} from '@/lib/document-html'
import { notFound, serverError } from '@/lib/server/api-response'
import { getAccountBranding, resolveBrandingLogoDataUriWithSupabase } from '@/lib/server/account-branding'
import { parseBrandingPrimaryColor } from '@/lib/branding-utils'
import { findDocumentById } from '@/lib/server/document-store'
import { generateChangeOrderPdfBuffer } from '@/lib/server/change-order-pdf'
import { generateRfiPdfBuffer } from '@/lib/server/rfi-pdf'
import { generateSubmittalPdfBuffer } from '@/lib/server/submittal-pdf'
import { generateReviewPdfBuffer } from '@/lib/server/review-pdf'
import { isDocumentReviewFinal, isReviewCycleTerminal } from '@/lib/server/review-token-policy'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'

type Params = { params: Promise<{ token: string }> }

export const runtime = 'nodejs'

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

async function resolveSignatureImageDataUrl(params: {
  supabase: any
  raw: string | null | undefined
}): Promise<string | null> {
  const raw = (params.raw ?? '').trim()
  if (!raw) return null
  if (raw.startsWith('data:image/')) return raw

  // If an absolute URL is stored, fetch and embed.
  if (/^https?:\/\//i.test(raw)) {
    try {
      const res = await fetch(raw, { cache: 'no-store' })
      if (!res.ok) return null
      const mime = res.headers.get('content-type') || 'image/png'
      const ab = await res.arrayBuffer()
      const b64 = Buffer.from(ab).toString('base64')
      return `data:${mime};base64,${b64}`
    } catch {
      return null
    }
  }

  // Otherwise treat it as a Supabase Storage path.
  const bucket = process.env.REVIEW_SIGNATURES_BUCKET || 'document-attachments'
  try {
    const dl = await params.supabase.storage.from(bucket).download(raw)
    if (dl?.error || !dl?.data) return null
    const mime = (dl.data as any).type || 'image/png'
    const ab = await (dl.data as any).arrayBuffer()
    const b64 = Buffer.from(ab).toString('base64')
    return `data:${mime};base64,${b64}`
  } catch {
    return null
  }
}

export async function GET(_req: Request, { params }: Params) {
  const { token } = await params
  const supabase = await createSupabaseServerClient()
  if (!supabase) return serverError('Supabase is not configured')
  const privilegedDb = createSupabaseAdminClient() ?? supabase

  const hashed = hashToken(token)
  const { data: requestRow, error: requestError } = await privilegedDb
    .from('review_requests')
    .select('id,review_cycle_id,reviewer_email')
    .eq('secure_token_hash', hashed)
    .maybeSingle()
  if (requestError) return serverError(requestError.message)
  if (!requestRow) return notFound('Invalid review token')

  const { data: cycleRow, error: cycleError } = await privilegedDb
    .from('review_cycles')
    .select('id,document_id,status')
    .eq('id', requestRow.review_cycle_id)
    .maybeSingle()
  if (cycleError) return serverError(cycleError.message)
  if (!cycleRow) return notFound('Review cycle not found')

  const { data: document, error: documentError } = await findDocumentById({
    supabase: privilegedDb,
    id: cycleRow.document_id,
  })
  if (documentError) return serverError(documentError.message)
  if (!document) return notFound('Document not found')

  if (isDocumentReviewFinal(document) || isReviewCycleTerminal(cycleRow.status)) {
    return notFound('Invalid review token')
  }

  const { data: projectRow, error: projectError } = await privilegedDb
    .from('projects')
    .select('*')
    .eq('id', document.project_id)
    .maybeSingle()
  if (projectError) return serverError(projectError.message)

  const { data: versionRow } = await privilegedDb
    .from('document_versions')
    .select('metadata,created_at')
    .eq('document_id', document.id)
    .order('version_no', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: attachmentRows } = await privilegedDb
    .from('attachments')
    .select('file_name')
    .eq('document_id', document.id)
    .order('created_at', { ascending: true })

  const { data: cycleRequests } = await privilegedDb
    .from('review_requests')
    .select('full_name,reviewer_email,decision,decided_at,decision_notes,signature_url')
    .eq('review_cycle_id', cycleRow.id)

  const metadata =
    versionRow?.metadata && typeof versionRow.metadata === 'object'
      ? (versionRow.metadata as Record<string, unknown>)
      : {}

  function mergeAttachmentNames(
    meta: Record<string, unknown>,
    dbNames: string[]
  ): string[] | undefined {
    const fromMeta: string[] = []
    const raw = meta.attachments
    if (Array.isArray(raw)) {
      for (const entry of raw) {
        if (typeof entry === 'string') {
          const t = entry.trim()
          if (t) fromMeta.push(t)
          continue
        }
        if (entry && typeof entry === 'object') {
          const row = entry as Record<string, unknown>
          const name =
            (typeof row.name === 'string' && row.name) ||
            (typeof row.file_name === 'string' && row.file_name) ||
            ''
          const t = name.trim()
          if (t) fromMeta.push(t)
        }
      }
    }
    const fromDb = (dbNames ?? []).map((n) => n.trim()).filter(Boolean)
    const seen = new Set<string>()
    const out: string[] = []
    for (const n of [...fromMeta, ...fromDb]) {
      const key = n.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(n)
    }
    return out.length ? out : undefined
  }

  const linkedDocuments = Array.isArray(metadata.linkedDocuments)
    ? metadata.linkedDocuments
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return ''
          const row = entry as Record<string, unknown>
          const code = typeof row.code === 'string' ? row.code : ''
          const title = typeof row.title === 'string' ? row.title : ''
          return [code, title].filter(Boolean).join(' ')
        })
        .filter(Boolean)
    : []

  const approvalRows = await Promise.all(
    (cycleRequests ?? []).map(async (row) => ({
      title: row.reviewer_email || row.full_name?.trim() || 'Reviewer',
      role: 'Reviewer',
      signature:
        row.decision === 'approve'
          ? ('approved' as const)
          : row.decision === 'reject'
            ? ('rejected' as const)
            : ('pending' as const),
      signatureName: row.decision === 'approve' ? row.full_name?.trim() || null : null,
      signatureUrl: await resolveSignatureImageDataUrl({ supabase: privilegedDb, raw: row.signature_url }),
      date: row.decided_at ? new Date(row.decided_at).toLocaleDateString('en-US') : '—',
      notes: row.decision_notes?.trim() || '—',
    }))
  )

  const attachmentNames = mergeAttachmentNames(
    metadata,
    (attachmentRows ?? []).map((a) => a.file_name).filter((n): n is string => Boolean(n))
  )

  const projectName = projectRow?.name ?? 'Untitled Project'
  const projectAddress = (projectRow as { address?: string | null } | null)?.address ?? null
  const docForHeader = {
    title: document.title,
    description: document.description ?? '',
    doc_number: document.doc_number,
  }
  let descriptionHtml = docForHeader.description
  if (document.doc_type === 'rfi') {
    descriptionHtml = ensureRfiFullDescriptionHtml(docForHeader, metadata, projectName)
  } else if (document.doc_type === 'submittal') {
    descriptionHtml = ensureSubmittalFullDescriptionHtml(docForHeader, metadata, projectName)
  }

  // Fetch account branding (same as the main documents PDF route)
  const accountId = (document as Record<string, unknown>).account_id as string | undefined
  const { data: brandingRow } = accountId
    ? await getAccountBranding(privilegedDb, accountId)
    : { data: null }
  const brandingCompanyName = brandingRow?.company_name?.trim() || null
  const brandingPrimaryColor = parseBrandingPrimaryColor(brandingRow?.primary_color ?? '')
  const brandingLogoDataUri = brandingRow?.logo_url
    ? await resolveBrandingLogoDataUriWithSupabase(privilegedDb, brandingRow.logo_url)
    : ''

  const { data: accountRow } = accountId
    ? await privilegedDb.from('accounts').select('address,phone').eq('id', accountId).maybeSingle()
    : { data: null }
  const accountContactAddress =
    typeof accountRow?.address === 'string' && accountRow.address.trim() ? accountRow.address.trim() : null
  const accountContactPhone =
    typeof accountRow?.phone === 'string' && accountRow.phone.trim() ? accountRow.phone.trim() : null

  const isApproved = cycleRow.status === 'approved'
  const isRejected = cycleRow.status === 'rejected'
  const reviewStatus = isApproved ? 'APPROVED' : isRejected ? 'REJECTED' : 'PENDING'

  const isChangeOrder = document.doc_type === 'change_order'
  const isRfi = document.doc_type === 'rfi'
  const isSubmittal = document.doc_type === 'submittal'

  const projectNo =
    (typeof metadata.projectNo === 'string' && metadata.projectNo) ||
    (typeof metadata.project_number === 'string' && metadata.project_number) ||
    null
  const contractDate =
    (typeof metadata.contractDate === 'string' && metadata.contractDate) ||
    (typeof metadata.contract_date === 'string' && metadata.contract_date) ||
    null
  const dueDate =
    (typeof metadata.actionNeededBy === 'string' && metadata.actionNeededBy) ||
    (typeof metadata.dueDate === 'string' && metadata.dueDate) ||
    null

  const { data: creatorRow } = document.created_by
    ? await privilegedDb.from('users').select('full_name, email').eq('id', document.created_by).maybeSingle()
    : { data: null }
  const documentAuthorDisplay =
    (creatorRow && typeof creatorRow.full_name === 'string' && creatorRow.full_name.trim()) ||
    (creatorRow && typeof creatorRow.email === 'string' && creatorRow.email.trim()) ||
    null
  const submittedByFromMeta =
    typeof metadata.submittedBy === 'string' && metadata.submittedBy.trim() ? metadata.submittedBy.trim() : null
  const submittedBy = submittedByFromMeta || documentAuthorDisplay || null
  const priority = typeof metadata.priority === 'string' ? metadata.priority : null
  const specSection =
    (typeof metadata.specSection === 'string' && metadata.specSection) ||
    (typeof metadata.spec_section === 'string' && metadata.spec_section) ||
    null

  const pdf = isSubmittal
    ? await generateSubmittalPdfBuffer({
        title: document.title,
        projectName,
        descriptionHtml,
        submittalNo:
          (typeof metadata.submittalNumber === 'string' && metadata.submittalNumber) ||
          document.doc_number ||
          null,
        projectNo: (projectAddress && projectAddress.trim()) || projectNo,
        date:
          (typeof metadata.submittalDate === 'string' && metadata.submittalDate) ||
          (typeof metadata.documentDate === 'string' && metadata.documentDate) ||
          (typeof metadata.date === 'string' && metadata.date) ||
          null,
        contractDate,
        submittedBy,
        priority,
        rfiNo: (typeof metadata.rfiNo === 'string' && metadata.rfiNo) || null,
        actionNeededBy:
          (typeof metadata.actionNeededBy === 'string' && metadata.actionNeededBy) || null,
        specSection,
        manufacturer:
          (typeof metadata.manufacturer === 'string' && metadata.manufacturer) || null,
        productName:
          (typeof metadata.productName === 'string' && metadata.productName) || null,
        attachments: attachmentNames,
        linkedDocuments: Array.isArray(metadata.linkedDocuments)
          ? (metadata.linkedDocuments as Array<{ id: string; title: string }>)
          : null,
        brandingCompanyName,
        contactAddress: accountContactAddress || process.env.REVIEW_PDF_CONTACT_ADDRESS || null,
        contactPhone: accountContactPhone || process.env.REVIEW_PDF_CONTACT_PHONE || null,
        contactEmail: process.env.REVIEW_PDF_CONTACT_EMAIL || null,
        reviewStatus,
      })
    : isRfi
    ? await generateRfiPdfBuffer({
        title: document.title,
        projectName,
        descriptionHtml,
        rfiNo:
          (typeof metadata.rfiNo === 'string' && metadata.rfiNo) ||
          document.doc_number ||
          null,
        projectNo: (projectAddress && projectAddress.trim()) || projectNo,
        date:
          (typeof metadata.rfiDate === 'string' && metadata.rfiDate) ||
          (typeof metadata.documentDate === 'string' && metadata.documentDate) ||
          (typeof metadata.date === 'string' && metadata.date) ||
          null,
        contractDate:
          (typeof metadata.actionNeededBy === 'string' && metadata.actionNeededBy) ||
          (typeof metadata.dueDate === 'string' && metadata.dueDate) ||
          contractDate,
        submittedBy,
        priority,
        scheduleImpact:
          (typeof metadata.scheduleImpact === 'string' && metadata.scheduleImpact) || null,
        costImpact:
          (typeof metadata.costImpact === 'string' && metadata.costImpact) || null,
        scopeImpact:
          (typeof metadata.scopeImpact === 'string' && metadata.scopeImpact) || null,
        attachments: attachmentNames,
        brandingCompanyName,
        contactAddress: accountContactAddress || process.env.REVIEW_PDF_CONTACT_ADDRESS || null,
        contactPhone: accountContactPhone || process.env.REVIEW_PDF_CONTACT_PHONE || null,
        contactEmail: process.env.REVIEW_PDF_CONTACT_EMAIL || null,
        reviewStatus,
      })
    : isChangeOrder
    ? await generateChangeOrderPdfBuffer({
        title: document.title,
        projectName,
        descriptionHtml,
        coNumber:
          (typeof metadata.changeOrderNumber === 'string' && metadata.changeOrderNumber) ||
          document.doc_number ||
          null,
        projectNo: (projectAddress && projectAddress.trim()) || projectNo,
        date:
          (typeof metadata.changeOrderDate === 'string' && metadata.changeOrderDate) ||
          (typeof metadata.date === 'string' && metadata.date) ||
          null,
        contractDate: dueDate || contractDate,
        submittedBy,
        priority,
        status: reviewStatus,
        scheduleImpact:
          (typeof metadata.scheduleImpact === 'string' && metadata.scheduleImpact) || null,
        newCompletionDate:
          (typeof metadata.newCompletionDate === 'string' && metadata.newCompletionDate) || null,
        reason: (typeof metadata.reason === 'string' && metadata.reason) || null,
        totalCost:
          typeof metadata.proposedAmount === 'number'
            ? metadata.proposedAmount
            : typeof metadata.proposedAmount === 'string'
              ? Number.parseFloat(metadata.proposedAmount) || 0
              : 0,
        costBreakdownItems: Array.isArray(metadata.costBreakdownItems)
          ? (metadata.costBreakdownItems as Array<{
              description: string
              quantity: number
              unitPrice: number
              total: number
            }>)
          : null,
        brandingCompanyName,
        contactAddress: accountContactAddress || process.env.REVIEW_PDF_CONTACT_ADDRESS || null,
        contactPhone: accountContactPhone || process.env.REVIEW_PDF_CONTACT_PHONE || null,
        contactEmail: process.env.REVIEW_PDF_CONTACT_EMAIL || null,
      })
    : await generateReviewPdfBuffer({
        title: document.title,
        projectName,
        docType: document.doc_type,
        descriptionHtml,
        applyAccountBranding: true,
        brandingCompanyName,
        brandingPrimaryColor,
        brandingLogoDataUri: brandingLogoDataUri || null,
        projectNo,
        reportDate:
          (typeof metadata.date === 'string' && metadata.date) ||
          (typeof metadata.changeOrderDate === 'string' && metadata.changeOrderDate) ||
          null,
        contractDate,
        actionNeededBy:
          (typeof metadata.actionNeededBy === 'string' && metadata.actionNeededBy) || null,
        submittedBy,
        rfiNo:
          (typeof metadata.rfiNo === 'string' && metadata.rfiNo) ||
          (typeof metadata.changeOrderNumber === 'string' && metadata.changeOrderNumber) ||
          null,
        specSection,
        priority,
        attachments: attachmentNames,
        linkedDocuments: linkedDocuments.length ? linkedDocuments : undefined,
        reviewStatus,
        metadata,
      })

  const body: Uint8Array = pdf instanceof Uint8Array ? pdf : new Uint8Array(pdf)
  return new Response(body as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="review-${document.id}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}

