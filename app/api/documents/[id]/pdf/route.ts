import { badRequest, notFound, serverError, unauthorized } from '@/lib/server/api-response'
import {
  ensureRfiFullDescriptionHtml,
  ensureSubmittalFullDescriptionHtml,
} from '@/lib/document-html'
import { getAccountBranding, resolveBrandingLogoDataUri } from '@/lib/server/account-branding'
import { parseBrandingPrimaryColor } from '@/lib/branding-utils'
import { getAuthContext } from '@/lib/server/auth'
import { findDocumentById } from '@/lib/server/document-store'
import { generateReviewPdfBuffer } from '@/lib/server/review-pdf'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Params) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) {
    return badRequest(
      'Account context is unavailable. Configure SUPABASE_SERVICE_ROLE_KEY and ensure your account row exists in the database.'
    )
  }
  const { id } = await params
  const url = new URL(req.url)
  const shouldDownload = url.searchParams.get('download') === '1'

  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const { data: document, error: documentError } = await findDocumentById({
    supabase,
    id,
    accountId: auth.accountId,
  })
  if (documentError) return serverError(documentError.message)
  if (!document) return notFound('Document not found')

  const { data: projectRow, error: projectError } = await supabase
    .from('projects')
    .select('name')
    .eq('id', document.project_id)
    .maybeSingle()
  if (projectError) return serverError(projectError.message)

  const { data: versionRow } = await supabase
    .from('document_versions')
    .select('metadata,created_at')
    .eq('document_id', document.id)
    .order('version_no', { ascending: false })
    .limit(1)
    .maybeSingle()

  const metadata =
    versionRow?.metadata && typeof versionRow.metadata === 'object'
      ? (versionRow.metadata as Record<string, unknown>)
      : {}

  const { data: attachmentRows } = await supabase
    .from('attachments')
    .select('file_name')
    .eq('document_id', document.id)
    .order('created_at', { ascending: true })

  const { data: cycleRow } = await supabase
    .from('review_cycles')
    .select('id,status')
    .eq('document_id', document.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: cycleRequests } = cycleRow
    ? await supabase
        .from('review_requests')
        .select('full_name,reviewer_email,decision,decided_at,decision_notes,signature_url')
        .eq('review_cycle_id', cycleRow.id)
    : { data: [] as Array<Record<string, unknown>> }

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

  const projectName = projectRow?.name ?? 'Untitled Project'
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

  const attachmentNames = mergeAttachmentNames(
    metadata,
    (attachmentRows ?? []).map((a) => a.file_name).filter((n): n is string => Boolean(n))
  )

  const approvalRows = (cycleRequests ?? []).map((row) => ({
    title:
      (typeof row.reviewer_email === 'string' && row.reviewer_email.trim()) ||
      (typeof row.full_name === 'string' && row.full_name.trim()) ||
      'Reviewer',
    role: 'Reviewer',
    signature:
      row.decision === 'approve'
        ? ('approved' as const)
        : row.decision === 'reject'
          ? ('rejected' as const)
          : ('pending' as const),
    signatureName:
      row.decision === 'approve' &&
      typeof row.full_name === 'string' &&
      row.full_name.trim()
        ? row.full_name.trim()
        : null,
    signatureUrl:
      typeof row.signature_url === 'string' && row.signature_url.trim()
        ? row.signature_url.trim()
        : null,
    date:
      typeof row.decided_at === 'string' && row.decided_at
        ? new Date(row.decided_at).toLocaleDateString('en-US')
        : '—',
    notes:
      (typeof row.decision_notes === 'string' && row.decision_notes.trim()) || '—',
  }))

  const isApproved =
    document.internal_status === 'approved' ||
    document.external_status === 'approved' ||
    cycleRow?.status === 'approved'
  const isRejected =
    document.internal_status === 'rejected' ||
    document.external_status === 'rejected' ||
    cycleRow?.status === 'rejected'

  const { data: brandingRow, error: brandingError } = await getAccountBranding(supabase, auth.accountId)
  if (brandingError) return serverError(brandingError.message)

  const brandingCompanyName = brandingRow?.company_name?.trim() || null
  const brandingPrimaryColor = parseBrandingPrimaryColor(brandingRow?.primary_color ?? '')
  const brandingLogoDataUri = brandingRow?.logo_url
    ? await resolveBrandingLogoDataUri(brandingRow.logo_url)
    : ''

  const pdf = await generateReviewPdfBuffer({
    title: document.title,
    projectName,
    docType: document.doc_type,
    descriptionHtml,
    applyAccountBranding: true,
    brandingCompanyName,
    brandingPrimaryColor,
    brandingLogoDataUri: brandingLogoDataUri || null,
    projectNo:
      (typeof metadata.projectNo === 'string' && metadata.projectNo) ||
      (typeof metadata.project_number === 'string' && metadata.project_number) ||
      null,
    reportDate:
      (typeof metadata.date === 'string' && metadata.date) ||
      (typeof metadata.changeOrderDate === 'string' && metadata.changeOrderDate) ||
      null,
    contractDate:
      (typeof metadata.contractDate === 'string' && metadata.contractDate) ||
      (typeof metadata.contract_date === 'string' && metadata.contract_date) ||
      null,
    actionNeededBy:
      (typeof metadata.actionNeededBy === 'string' && metadata.actionNeededBy) ||
      null,
    submittedBy:
      (typeof metadata.submittedBy === 'string' && metadata.submittedBy) ||
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
    approvalRows: approvalRows.length ? approvalRows : undefined,
    reviewStatus: isApproved ? 'APPROVED' : isRejected ? 'REJECTED' : 'PENDING',
  })

  return new Response(pdf, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': shouldDownload
        ? `attachment; filename="document-${document.id}.pdf"`
        : `inline; filename="document-${document.id}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
