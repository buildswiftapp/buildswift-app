import { createHash } from 'crypto'
import {
  ensureRfiFullDescriptionHtml,
  ensureSubmittalFullDescriptionHtml,
} from '@/lib/document-html'
import { notFound, serverError } from '@/lib/server/api-response'
import { findDocumentById } from '@/lib/server/document-store'
import { generateReviewPdfBuffer } from '@/lib/server/review-pdf'
import { isDocumentReviewFinal, isReviewCycleTerminal } from '@/lib/server/review-token-policy'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'

type Params = { params: Promise<{ token: string }> }

export const runtime = 'nodejs'

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
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

  const approvalRows = (cycleRequests ?? []).map((row) => ({
    title: row.reviewer_email || row.full_name?.trim() || 'Reviewer',
    role: 'Reviewer',
    signature:
      row.decision === 'approve'
        ? ('approved' as const)
        : row.decision === 'reject'
          ? ('rejected' as const)
          : ('pending' as const),
    signatureName: row.decision === 'approve' ? row.full_name?.trim() || null : null,
    signatureUrl: row.signature_url?.trim() || null,
    date: row.decided_at ? new Date(row.decided_at).toLocaleDateString('en-US') : '—',
    notes: row.decision_notes?.trim() || '—',
  }))

  const attachmentNames = mergeAttachmentNames(
    metadata,
    (attachmentRows ?? []).map((a) => a.file_name).filter((n): n is string => Boolean(n))
  )

  const projectName = projectRow?.name ?? 'Untitled Project'
  const docForHeader = {
    title: document.title,
    description: document.description ?? '',
    doc_number: document.doc_number,
  }
  let descriptionHtml = docForHeader.description
  if (document.doc_type === 'rfi') {
    descriptionHtml = ensureRfiFullDescriptionHtml(
      docForHeader,
      metadata,
      projectName
    )
  } else if (document.doc_type === 'submittal') {
    descriptionHtml = ensureSubmittalFullDescriptionHtml(
      docForHeader,
      metadata,
      projectName
    )
  }

  const pdf = await generateReviewPdfBuffer({
    title: document.title,
    projectName,
    docType: document.doc_type,
    descriptionHtml,
    projectNo:
      (typeof metadata.projectNo === 'string' && metadata.projectNo) ||
      (typeof metadata.project_number === 'string' && metadata.project_number) ||
      ((projectRow as any)?.project_number as string | undefined) ||
      null,
    reportDate:
      (typeof metadata.date === 'string' && metadata.date) ||
      (typeof metadata.changeOrderDate === 'string' && metadata.changeOrderDate) ||
      ((document as any).due_date as string | undefined) ||
      null,
    contractDate:
      (typeof metadata.contractDate === 'string' && metadata.contractDate) ||
      (typeof metadata.contract_date === 'string' && metadata.contract_date) ||
      null,
    actionNeededBy:
      (typeof metadata.actionNeededBy === 'string' && metadata.actionNeededBy) ||
      ((document as any).due_date as string | undefined) ||
      null,
    submittedBy:
      (typeof metadata.submittedBy === 'string' && metadata.submittedBy) ||
      requestRow.reviewer_email ||
      null,
    rfiNo:
      (typeof metadata.rfiNo === 'string' && metadata.rfiNo) ||
      (typeof metadata.changeOrderNumber === 'string' && metadata.changeOrderNumber) ||
      null,
    specSection:
      (typeof metadata.specSection === 'string' && metadata.specSection) ||
      (typeof metadata.spec_section === 'string' && metadata.spec_section) ||
      null,
    priority: typeof metadata.priority === 'string' ? metadata.priority : null,
    attachments: attachmentNames,
    linkedDocuments: linkedDocuments.length ? linkedDocuments : undefined,
    approvalRows: approvalRows.length ? approvalRows : undefined,
    reviewStatus: cycleRow.status === 'approved' ? 'APPROVED' : cycleRow.status === 'rejected' ? 'REJECTED' : 'PENDING',
  })

  return new Response(pdf, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="review-${document.id}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}

