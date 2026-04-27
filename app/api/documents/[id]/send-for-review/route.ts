import { createHash, randomBytes } from 'crypto'
import { badRequest, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { getAuthContext } from '@/lib/server/auth'
import { findDocumentById } from '@/lib/server/document-store'
import { writeAuditLog } from '@/lib/server/audit'
import { assertCanUseProFeature } from '@/lib/server/billing'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'
import { enforceRateLimit } from '@/lib/server/rate-limit'
import {
  isReviewCycleTerminal,
  resolveReviewTokenExpiresAtMs,
  reviewLinkExpiresAtMs,
  type ReviewLinkExpiryDays,
} from '@/lib/server/review-token-policy'
import { sendForReviewSchema } from '@/lib/server/validators'

type Params = { params: Promise<{ id: string }> }
type DocumentType = 'rfi' | 'submittal' | 'change_order'

const DOCUMENT_TABLE_BY_TYPE: Record<DocumentType, string> = {
  rfi: 'rfi_documents',
  submittal: 'submittal_documents',
  change_order: 'change_order_documents',
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function generateSecureToken() {
  return randomBytes(32).toString('hex')
}

function getReviewBaseUrl(req: Request) {
  const envBaseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL
  if (envBaseUrl) return envBaseUrl.replace(/\/+$/, '')
  const origin = new URL(req.url).origin
  return origin.replace(/\/+$/, '')
}

function buildReviewUrl(baseUrl: string, token: string) {
  return `${baseUrl}/review/${encodeURIComponent(token)}`
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function createReviewEmailContent(input: { projectName: string; documentTitle: string; reviewUrl: string }) {
  const project = escapeHtml(input.projectName)
  const title = escapeHtml(input.documentTitle)
  const url = escapeHtml(input.reviewUrl)
  return {
    subject: `Review requested: ${input.documentTitle}`,
    text: [
      `You have been requested to review a document.`,
      `Project: ${input.projectName}`,
      `Document: ${input.documentTitle}`,
      '',
      `Review Document: ${input.reviewUrl}`,
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
        <p>You have been requested to review a document.</p>
        <p><strong>Project:</strong> ${project}<br/><strong>Document:</strong> ${title}</p>
        <p>
          <a href="${url}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600">
            Review Document
          </a>
        </p>
        <p style="font-size:12px;color:#64748b">If the button does not work, open this link: ${url}</p>
      </div>
    `.trim(),
  }
}

async function sendReviewEmail(job: {
  to: string
  projectName: string
  documentTitle: string
  reviewUrl: string
}) {
  const content = createReviewEmailContent({
    projectName: job.projectName,
    documentTitle: job.documentTitle,
    reviewUrl: job.reviewUrl,
  })

  const webhookUrl = process.env.REVIEW_EMAIL_WEBHOOK_URL
  if (webhookUrl) {
    const webhookRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        to: job.to,
        subject: content.subject,
        text: content.text,
        html: content.html,
        review_url: job.reviewUrl,
      }),
    })
    if (!webhookRes.ok) {
      const detail = await webhookRes.text().catch(() => webhookRes.statusText)
      throw new Error(`Email webhook failed (${webhookRes.status}): ${detail}`)
    }
    return
  }

  const resendApiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.REVIEW_EMAIL_FROM
  if (resendApiKey && fromEmail) {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [job.to],
        subject: content.subject,
        html: content.html,
        text: content.text,
      }),
    })
    if (!resendRes.ok) {
      const detail = await resendRes.text().catch(() => resendRes.statusText)
      throw new Error(`Resend delivery failed (${resendRes.status}): ${detail}`)
    }
    return
  }

  throw new Error(
    'Email integration is not configured. Set REVIEW_EMAIL_WEBHOOK_URL, or set RESEND_API_KEY and REVIEW_EMAIL_FROM.'
  )
}

async function findVersionByNo(supabase: any, documentId: string, versionNo: number) {
  return supabase
    .from('document_versions')
    .select('id,version_no')
    .eq('document_id', documentId)
    .eq('version_no', versionNo)
    .maybeSingle()
}

async function findCycleByNo(supabase: any, documentId: string, cycleNo: number) {
  return supabase
    .from('review_cycles')
    .select('*')
    .eq('document_id', documentId)
    .eq('cycle_no', cycleNo)
    .maybeSingle()
}

export async function POST(req: Request, { params }: Params) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) {
    return badRequest(
      'Account context is unavailable. Configure SUPABASE_SERVICE_ROLE_KEY and ensure your account row exists in the database.'
    )
  }

  const { id } = await params
  const payload = sendForReviewSchema.safeParse(await req.json().catch(() => ({})))
  if (!payload.success) return badRequest('Invalid payload', payload.error.flatten())

  const supabase = await createSupabaseServerClient()
  if (!supabase) return serverError('Supabase is not configured')
  const privilegedDb = createSupabaseAdminClient() ?? supabase
  if (payload.data.reviewers.length > 1) {
    const proGate = await assertCanUseProFeature(
      privilegedDb as any,
      auth.accountId,
      'multi-reviewer approvals'
    )
    if (!proGate.ok) return badRequest(proGate.reason)
  }

  const { data: document, error: docError } = await findDocumentById({
    supabase,
    id,
    accountId: auth.accountId,
  })
  if (docError) return serverError(docError.message)
  if (!document) return badRequest('Document not found')

  const expiresInDays = payload.data.expires_in_days as ReviewLinkExpiryDays
  const reviewBaseUrl = getReviewBaseUrl(req)

  if (payload.data.resend) {
    const resendLimiter = enforceRateLimit({
      key: `review-resend:${auth.accountId}:${id}:${auth.user.id}`,
      limit: 20,
      windowMs: 60 * 60 * 1000,
    })
    if (!resendLimiter.allowed) {
      return badRequest('Too many resend attempts. Please try again later.')
    }

    const { data: openCycle, error: openCycleError } = await privilegedDb
      .from('review_cycles')
      .select('id,cycle_no,status')
      .eq('document_id', id)
      .in('status', ['sent', 'pending'])
      .order('cycle_no', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (openCycleError) return serverError(openCycleError.message)
    if (!openCycle || isReviewCycleTerminal(openCycle.status)) {
      return badRequest(
        'No active review cycle to resend. Send reviewers first, or this review round is already closed.'
      )
    }

    const { data: projectRowResend, error: projectErrorResend } = await supabase
      .from('projects')
      .select('name')
      .eq('id', document.project_id)
      .eq('account_id', auth.accountId)
      .maybeSingle()
    if (projectErrorResend) return serverError(projectErrorResend.message)
    const projectNameResend = projectRowResend?.name || 'Untitled Project'

    const resentRows: {
      reviewer_email: string
      _token: string
      _review_url: string
    }[] = []

    for (const email of payload.data.reviewers) {
      const { data: reqRow, error: reqErr } = await privilegedDb
        .from('review_requests')
        .select('id,decided_at,token_expires_at,created_at,email_status,reviewer_email')
        .eq('review_cycle_id', openCycle.id)
        .eq('reviewer_email', email)
        .maybeSingle()
      if (reqErr) return serverError(reqErr.message)
      if (!reqRow) {
        return badRequest(
          `No review request for ${email} in the current cycle. Add them with a normal send first.`
        )
      }
      if (reqRow.decided_at) {
        return badRequest(`Cannot resend: ${email} has already submitted a review.`)
      }
      const expMs = resolveReviewTokenExpiresAtMs({
        tokenExpiresAt: reqRow.token_expires_at,
        createdAt: reqRow.created_at,
      })
      const isExpired =
        reqRow.email_status === 'expired' || !Number.isFinite(expMs) || expMs < Date.now()
      if (!isExpired) {
        return badRequest(`Review link for ${email} is still valid; resend is only allowed after it expires.`)
      }

      const newToken = generateSecureToken()
      const newExpires = new Date(reviewLinkExpiresAtMs(expiresInDays)).toISOString()
      const { error: updErr } = await privilegedDb
        .from('review_requests')
        .update({
          secure_token_hash: hashToken(newToken),
          token_expires_at: newExpires,
          email_status: 'sent',
        })
        .eq('id', reqRow.id)
      if (updErr) return serverError(updErr.message)

      resentRows.push({
        reviewer_email: email,
        _token: newToken,
        _review_url: buildReviewUrl(reviewBaseUrl, newToken),
      })
    }

    const emailResults = await Promise.allSettled(
      resentRows.map((row) =>
        sendReviewEmail({
          to: row.reviewer_email,
          projectName: projectNameResend,
          documentTitle: document.title,
          reviewUrl: row._review_url,
        })
      )
    )
    const emailFailure = emailResults.find((result) => result.status === 'rejected')
    if (emailFailure && emailFailure.status === 'rejected') {
      return serverError(emailFailure.reason instanceof Error ? emailFailure.reason.message : 'Failed to send review email')
    }

    await writeAuditLog(
      {
        accountId: auth.accountId,
        actorType: 'user',
        actorUserId: auth.user.id,
        actorEmail: auth.user.email ?? null,
        eventType: 'document.review_link_resent',
        documentId: id,
        projectId: document.project_id,
        eventData: {
          reviewer_count: resentRows.length,
          cycle_no: openCycle.cycle_no,
          expires_in_days: expiresInDays,
        },
      },
      privilegedDb
    )

    return ok({
      cycle_id: openCycle.id,
      resent: true,
      reviewers: resentRows.map(({ reviewer_email, _token, _review_url }) => ({
        reviewer_email,
        token: _token,
        review_url: _review_url,
      })),
    })
  }

  const { data: projectRow, error: projectError } = await supabase
    .from('projects')
    .select('name')
    .eq('id', document.project_id)
    .eq('account_id', auth.accountId)
    .maybeSingle()
  if (projectError) return serverError(projectError.message)
  const projectName = projectRow?.name || 'Untitled Project'

  const { data: versionRows, error: versionError } = await privilegedDb
    .from('document_versions')
    .select('id,version_no')
    .eq('document_id', id)
    .eq('version_no', document.current_version_no)
  if (versionError) return serverError(versionError.message)
  if (versionRows && versionRows.length > 1) {
    return serverError('Multiple rows found for current document version')
  }
  let version = versionRows?.[0]
  if (!version) {
    const { data: fallbackVersion, error: fallbackVersionError } = await privilegedDb
      .from('document_versions')
      .select('id,version_no')
      .eq('document_id', id)
      .order('version_no', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (fallbackVersionError) return serverError(fallbackVersionError.message)
    if (fallbackVersion) {
      version = fallbackVersion
    } else {
      const bootstrapVersionNo =
        typeof document.current_version_no === 'number' && Number.isFinite(document.current_version_no)
          ? Math.max(1, Math.trunc(document.current_version_no))
          : 1
      const bootstrapPayload = {
        document_id: id,
        version_no: bootstrapVersionNo,
        title: document.title,
        description: document.description,
        metadata: {},
        created_by: auth.user.id,
      }
      let { data: bootstrapVersion, error: bootstrapVersionError } = await privilegedDb
        .from('document_versions')
        .insert(bootstrapPayload)
        .select('id,version_no')
        .single()
      const errorMessage = bootstrapVersionError?.message?.toLowerCase() ?? ''
      if (errorMessage.includes('duplicate key value')) {
        const existingVersion = await findVersionByNo(privilegedDb, id, bootstrapVersionNo)
        bootstrapVersion = existingVersion.data ?? null
        bootstrapVersionError = existingVersion.error
      } else if (errorMessage.includes('row-level security')) {
        const admin = createSupabaseAdminClient()
        if (admin) {
          const adminInsert = await admin
            .from('document_versions')
            .insert(bootstrapPayload as any)
            .select('id,version_no')
            .single()
          bootstrapVersion = adminInsert.data ?? null
          bootstrapVersionError = adminInsert.error
          const adminErrorMessage = bootstrapVersionError?.message?.toLowerCase() ?? ''
          if (adminErrorMessage.includes('duplicate key value')) {
            const adminExistingVersion = await findVersionByNo(admin, id, bootstrapVersionNo)
            bootstrapVersion = adminExistingVersion.data ?? null
            bootstrapVersionError = adminExistingVersion.error
          }
        }
      }
      if (bootstrapVersionError) return serverError(bootstrapVersionError.message)
      if (!bootstrapVersion) return serverError('Failed to create bootstrap document version')
      version = bootstrapVersion
    }
  }

  const { data: lastCycle } = await privilegedDb
    .from('review_cycles')
    .select('cycle_no')
    .eq('document_id', id)
    .order('cycle_no', { ascending: false })
    .limit(1)
    .maybeSingle()

  const cycleNo = (lastCycle?.cycle_no ?? 0) + 1
  let { data: cycle, error: cycleError } = await privilegedDb
    .from('review_cycles')
    .insert({
      document_id: id,
      document_version_id: version.id,
      cycle_no: cycleNo,
      status: 'sent',
      sent_by: auth.user.id,
      sent_at: new Date().toISOString(),
    })
    .select('*')
    .single()
  let cycleErrorMessage = cycleError?.message?.toLowerCase() ?? ''
  if (cycleErrorMessage.includes('duplicate key value')) {
    const existingCycle = await findCycleByNo(privilegedDb, id, cycleNo)
    cycle = existingCycle.data ?? null
    cycleError = existingCycle.error
    cycleErrorMessage = cycleError?.message?.toLowerCase() ?? ''
  } else if (cycleErrorMessage.includes('row-level security')) {
    const admin = createSupabaseAdminClient()
    if (admin) {
      const adminCycleInsert = await admin
        .from('review_cycles')
        .insert({
          document_id: id,
          document_version_id: version.id,
          cycle_no: cycleNo,
          status: 'sent',
          sent_by: auth.user.id,
          sent_at: new Date().toISOString(),
        } as any)
        .select('*')
        .single()
      cycle = adminCycleInsert.data ?? null
      cycleError = adminCycleInsert.error
      cycleErrorMessage = cycleError?.message?.toLowerCase() ?? ''
      if (cycleErrorMessage.includes('duplicate key value')) {
        const adminExistingCycle = await findCycleByNo(admin, id, cycleNo)
        cycle = adminExistingCycle.data ?? null
        cycleError = adminExistingCycle.error
      }
    }
  }
  if (cycleError) return serverError(cycleError.message)
  if (!cycle) return serverError('Failed to create review cycle')

  const requestRows = payload.data.reviewers.map((email) => {
    const token = generateSecureToken()
    return {
      review_cycle_id: cycle.id,
      reviewer_email: email.toLowerCase(),
      secure_token_hash: hashToken(token),
      token_expires_at: new Date(reviewLinkExpiresAtMs(expiresInDays)).toISOString(),
      email_status: 'sent',
      _token: token,
      _review_url: buildReviewUrl(reviewBaseUrl, token),
    }
  })

  const requestInsertRows = requestRows.map((row) => ({
    review_cycle_id: row.review_cycle_id,
    reviewer_email: row.reviewer_email,
    secure_token_hash: row.secure_token_hash,
    token_expires_at: row.token_expires_at,
    email_status: row.email_status,
  }))
  let { error: requestError } = await privilegedDb.from('review_requests').insert(requestInsertRows)
  if (requestError?.message?.toLowerCase().includes('row-level security')) {
    const admin = createSupabaseAdminClient()
    if (admin) {
      const adminRequestInsert = await admin.from('review_requests').insert(requestInsertRows as any)
      requestError = adminRequestInsert.error
    }
  }
  if (requestError) return serverError(requestError.message)

  const emailResults = await Promise.allSettled(
    requestRows.map((row) =>
      sendReviewEmail({
        to: row.reviewer_email,
        projectName,
        documentTitle: document.title,
        reviewUrl: row._review_url,
      })
    )
  )
  const emailFailure = emailResults.find((result) => result.status === 'rejected')
  if (emailFailure && emailFailure.status === 'rejected') {
    return serverError(emailFailure.reason instanceof Error ? emailFailure.reason.message : 'Failed to send review email')
  }

  const { error: docUpdateError } = await privilegedDb
    .from(DOCUMENT_TABLE_BY_TYPE[document.doc_type as DocumentType])
    .update({ internal_status: 'in_review', external_status: 'sent' })
    .eq('id', id)
  if (docUpdateError) return serverError(docUpdateError.message)

  await writeAuditLog({
    accountId: auth.accountId,
    actorType: 'user',
    actorUserId: auth.user.id,
    actorEmail: auth.user.email ?? null,
    eventType: 'document.sent_for_review',
    documentId: id,
    projectId: document.project_id,
    eventData: {
      reviewer_count: payload.data.reviewers.length,
      cycle_no: cycleNo,
      expires_in_days: expiresInDays,
    },
  })

  return ok({
    cycle_id: cycle.id,
    reviewers: requestRows.map(({ reviewer_email, _token, _review_url }) => ({
      reviewer_email,
      token: _token,
      review_url: _review_url,
    })),
  })
}
 