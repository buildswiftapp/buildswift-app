import { createHash } from 'crypto'
import { notFound, ok, serverError } from '@/lib/server/api-response'
import { findDocumentById } from '@/lib/server/document-store'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'
import {
  isDocumentReviewFinal,
  isReviewCycleTerminal,
  resolveReviewTokenExpiresAtMs,
} from '@/lib/server/review-token-policy'

type Params = { params: Promise<{ token: string }> }

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
    .select(
      'id,review_cycle_id,reviewer_email,decision,decision_notes,full_name,signature_url,decided_at,token_expires_at,created_at,viewed_at,email_status'
    )
    .eq('secure_token_hash', hashed)
    .maybeSingle()
  if (requestError) return serverError(requestError.message)
  if (!requestRow) return notFound('Invalid review token')

  const { data: cycleRow, error: cycleError } = await privilegedDb
    .from('review_cycles')
    .select('id,document_id,status,sent_at')
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

  const isSubmitted = Boolean(requestRow.decided_at)
  if (
    !isSubmitted &&
    (isDocumentReviewFinal(document) || isReviewCycleTerminal(cycleRow.status))
  ) {
    return notFound('Invalid review token')
  }

  const { data: projectRow, error: projectError } = await privilegedDb
    .from('projects')
    .select('name')
    .eq('id', document.project_id)
    .maybeSingle()
  if (projectError) return serverError(projectError.message)

  const { data: attachmentRows, error: attachmentsError } = await privilegedDb
    .from('attachments')
    .select('id,file_name,mime_type,size_bytes')
    .eq('document_id', document.id)
    .order('created_at', { ascending: true })
  if (attachmentsError) return serverError(attachmentsError.message)

  const now = Date.now()
  const expiresAt = resolveReviewTokenExpiresAtMs({
    tokenExpiresAt: requestRow.token_expires_at,
    createdAt: requestRow.created_at,
  })
  const isExpired = Number.isFinite(expiresAt) && expiresAt < now
  if (isExpired && requestRow.email_status !== 'expired') {
    await privilegedDb.from('review_requests').update({ email_status: 'expired' }).eq('id', requestRow.id)
  }

  return ok({
    reviewerEmail: requestRow.reviewer_email,
    documentContent: {
      title: document.title,
      description: document.description,
      type: document.doc_type,
      projectName: projectRow?.name ?? 'Untitled Project',
    },
    attachments: (attachmentRows ?? []).map((row) => ({
      id: row.id as string,
      file_name: (row.file_name as string) || 'attachment',
      mime_type: row.mime_type as string | null,
      size_bytes: typeof row.size_bytes === 'number' ? row.size_bytes : null,
    })),
    reviewStatus: {
      state: isSubmitted ? 'submitted' : isExpired ? 'expired' : 'pending',
      decision: requestRow.decision ?? null,
      decided_at: requestRow.decided_at ?? null,
      token_expires_at: requestRow.token_expires_at ?? null,
      cycle_status: cycleRow.status ?? null,
      message: isSubmitted
        ? 'This review has already been submitted.'
        : isExpired
          ? 'This review link has expired. Ask the project owner to resend from the document page (Resend expired links).'
          : null,
    },
  })
}
