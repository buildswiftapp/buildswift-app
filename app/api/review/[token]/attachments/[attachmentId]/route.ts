import { createHash } from 'crypto'
import { notFound, serverError } from '@/lib/server/api-response'
import { findDocumentById } from '@/lib/server/document-store'
import { attachmentsBucket, objectPathFromStoredPath } from '@/lib/server/review-attachment-storage'
import {
  isDocumentReviewFinal,
  isReviewCycleTerminal,
  resolveReviewTokenExpiresAtMs,
} from '@/lib/server/review-token-policy'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'

type Params = { params: Promise<{ token: string; attachmentId: string }> }

export const runtime = 'nodejs'

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function asciiFilename(name: string) {
  const safe = name.replace(/[^\w.\-() ]+/g, '_').trim() || 'attachment'
  return `attachment; filename="${safe.replace(/"/g, '')}"`
}

export async function GET(_req: Request, { params }: Params) {
  const { token, attachmentId } = await params
  const supabase = await createSupabaseServerClient()
  if (!supabase) return serverError('Supabase is not configured')
  const privilegedDb = createSupabaseAdminClient() ?? supabase
  const admin = createSupabaseAdminClient()
  if (!admin) return serverError('Service role is required for attachment downloads')

  const hashed = hashToken(token)
  const { data: requestRow, error: requestError } = await privilegedDb
    .from('review_requests')
    .select('id,review_cycle_id,decided_at,token_expires_at,created_at')
    .eq('secure_token_hash', hashed)
    .maybeSingle()
  if (requestError) return serverError(requestError.message)
  if (!requestRow) return notFound('Invalid review token')

  const isSubmitted = Boolean(requestRow.decided_at)
  const expiresAt = resolveReviewTokenExpiresAtMs({
    tokenExpiresAt: requestRow.token_expires_at,
    createdAt: requestRow.created_at,
  })
  const isExpired = Number.isFinite(expiresAt) && expiresAt < Date.now()
  if (!isSubmitted && isExpired) {
    return notFound('This review link has expired')
  }

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

  if (
    !isSubmitted &&
    (isDocumentReviewFinal(document) || isReviewCycleTerminal(cycleRow.status))
  ) {
    return notFound('Invalid review token')
  }

  const { data: attachment, error: attachmentError } = await privilegedDb
    .from('attachments')
    .select('id,document_id,storage_path,file_name,mime_type,size_bytes')
    .eq('id', attachmentId)
    .eq('document_id', document.id)
    .maybeSingle()
  if (attachmentError) return serverError(attachmentError.message)
  if (!attachment) return notFound('Attachment not found')

  const bucket = attachmentsBucket()
  const objectPath = objectPathFromStoredPath(attachment.storage_path as string, bucket)
  if (!objectPath) return notFound('Attachment file is not available')

  const { data: blob, error: downloadError } = await admin.storage.from(bucket).download(objectPath)
  if (downloadError || !blob) {
    return serverError(downloadError?.message || 'Failed to read attachment')
  }

  const buf = Buffer.from(await blob.arrayBuffer())
  const mime = typeof attachment.mime_type === 'string' && attachment.mime_type ? attachment.mime_type : 'application/octet-stream'
  const fileName = typeof attachment.file_name === 'string' && attachment.file_name ? attachment.file_name : 'attachment'

  return new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Disposition': asciiFilename(fileName),
      'Cache-Control': 'private, no-store',
    },
  })
}
