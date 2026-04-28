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

function getDocumentTypeLabel(docType: string): string {
  const typeMap: Record<string, string> = {
    rfi: 'RFI',
    submittal: 'Submittal',
    change_order: 'Change Order',
  }
  return typeMap[docType] || docType
}

function createReviewEmailContent(input: {
  projectName: string
  documentTitle: string
  documentType: string
  reviewUrl: string
  expiresInDays: number
  senderName?: string
}) {
  const project = escapeHtml(input.projectName)
  const title = escapeHtml(input.documentTitle)
  const url = escapeHtml(input.reviewUrl)
  const docType = getDocumentTypeLabel(input.documentType)
  const senderName = input.senderName || 'BuildSwift Team'

  return {
    subject: `Action Required: ${docType} Review – ${input.projectName}`,
    text: [
      `Hello,`,
      ``,
      `You have been requested to review the following document:`,
      ``,
      `Document Type: ${docType}`,
      `Project: ${input.projectName}`,
      `Title: ${input.documentTitle}`,
      ``,
      `Please click the link below to review and respond:`,
      `${input.reviewUrl}`,
      ``,
      `This link will expire in ${input.expiresInDays} days.`,
      ``,
      `Thank you,`,
      `${senderName}`,
      ``,
      `Powered by BuildSwift`,
    ].join('\n'),
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;line-height:1.6;color:#111827;max-width:600px;margin:0 auto">
        <div style="background:linear-gradient(135deg, #f4f6fb 0%, #ffffff 100%);padding:24px;border-radius:12px;margin-bottom:24px">
          <h2 style="margin:0 0 16px 0;font-size:24px;font-weight:700;color:#111827">Review Request</h2>
          <p style="margin:0;font-size:16px;color:#64748b">You have been requested to review the following document:</p>
        </div>

        <div style="background:#ffffff;border:1px solid #e6e9f2;border-radius:8px;padding:20px;margin-bottom:24px">
          <table style="width:100%;border-collapse:collapse">
            <tr>
              <td style="padding:8px 0;color:#64748b;font-size:14px">Document Type:</td>
              <td style="padding:8px 0;color:#111827;font-weight:600;font-size:14px">${docType}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#64748b;font-size:14px">Project:</td>
              <td style="padding:8px 0;color:#111827;font-weight:600;font-size:14px">${project}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#64748b;font-size:14px">Title:</td>
              <td style="padding:8px 0;color:#111827;font-weight:600;font-size:14px">${title}</td>
            </tr>
          </table>
        </div>

        <p style="margin:0 0 16px 0;color:#111827;font-size:15px">Please click the button below to review and respond:</p>

        <div style="text-align:center;margin:32px 0">
          <a href="${url}" style="display:inline-block;padding:12px 28px;background:#3f63f3;color:#ffffff;text-decoration:none;font-weight:600;border-radius:8px;font-size:15px;transition:all 0.2s ease">Review Document</a>
        </div>

        <div style="background:#f8fafc;border-left:4px solid #3f63f3;padding:12px 16px;margin:32px 0;border-radius:4px">
          <p style="margin:0;font-size:13px;color:#64748b">
            <strong>Expiration:</strong> This link will expire in ${input.expiresInDays} day${input.expiresInDays !== 1 ? 's' : ''}.
          </p>
        </div>

        <div style="border-top:1px solid #e6e9f2;padding-top:24px;margin-top:32px">
          <p style="margin:0 0 8px 0;color:#111827;font-size:14px">Thank you,</p>
          <p style="margin:0 0 16px 0;color:#111827;font-weight:600;font-size:14px">${senderName}</p>
          <div style="text-align:center;padding-top:16px;border-top:1px solid #e6e9f2;margin-top:16px">
            <p style="margin:8px 0;font-size:12px;color:#64748b">
              <strong>BuildSwift</strong> — Construction Document Management
            </p>
            <p style="margin:4px 0;font-size:11px;color:#94a3b8">Powered by BuildSwift</p>
          </div>
        </div>
      </div>
    `.trim(),
  }
}

async function sendReviewEmail(job: {
  to: string
  projectName: string
  documentTitle: string
  documentType: string
  reviewUrl: string
  expiresInDays: number
  senderName?: string
}) {
  const content = createReviewEmailContent({
    projectName: job.projectName,
    documentTitle: job.documentTitle,
    documentType: job.documentType,
    reviewUrl: job.reviewUrl,
    expiresInDays: job.expiresInDays,
    senderName: job.senderName,
  })

  // Development mode: skip actual email sending
  if (process.env.NODE_ENV !== 'production' && process.env.SKIP_EMAIL_SENDING === 'true') {
    console.log('[sendReviewEmail] Development mode - skipping email send')
    console.log('[sendReviewEmail] Would send to:', job.to)
    console.log('[sendReviewEmail] Subject:', content.subject)
    return
  }

  const webhookUrl = process.env.REVIEW_EMAIL_WEBHOOK_URL
  if (webhookUrl) {
    try {
      console.log('[sendReviewEmail] Using webhook:', webhookUrl.substring(0, 50) + '...')
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30000) // 30 second timeout
      
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
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout))
      
      if (!webhookRes.ok) {
        const detail = await webhookRes.text().catch(() => webhookRes.statusText)
        throw new Error(`Email webhook failed (${webhookRes.status}): ${detail}`)
      }
      console.log('[sendReviewEmail] Webhook email sent successfully to:', job.to)
      return
    } catch (error) {
      console.error('[sendReviewEmail] Webhook error:', error)
      throw error
    }
  }

  const resendApiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.REVIEW_EMAIL_FROM
  
  if (!resendApiKey || !fromEmail) {
    const missingVars = []
    if (!resendApiKey) missingVars.push('RESEND_API_KEY')
    if (!fromEmail) missingVars.push('REVIEW_EMAIL_FROM')
    const webhookUrlMissing = !webhookUrl ? 'REVIEW_EMAIL_WEBHOOK_URL' : null
    
    const errorMsg = `Email integration not configured. Missing: ${[...missingVars, webhookUrlMissing].filter(Boolean).join(', ')}. Set either REVIEW_EMAIL_WEBHOOK_URL or both RESEND_API_KEY and REVIEW_EMAIL_FROM.`
    console.error('[sendReviewEmail] Configuration error:', errorMsg)
    throw new Error(errorMsg)
  }

  try {
    console.log('[sendReviewEmail] Using Resend API service...')
    const controller = new AbortController()
    const timeout = setTimeout(() => {
      controller.abort()
      console.error('[sendReviewEmail] Fetch timeout (30s) - aborting request to Resend API')
    }, 30000) // 30 second timeout
    
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
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout))
    
    if (!resendRes.ok) {
      const detail = await resendRes.text().catch(() => resendRes.statusText)
      throw new Error(`Resend delivery failed (${resendRes.status}): ${detail}`)
    }
    console.log('[sendReviewEmail] Resend email sent successfully to:', job.to)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error('[sendReviewEmail] Resend error:', errorMsg)
    
    // Check if it's a network error
    if (errorMsg.includes('fetch failed') || errorMsg.includes('ETIMEDOUT') || errorMsg.includes('ECONNREFUSED') || errorMsg.includes('AbortError')) {
      console.error('[sendReviewEmail] ⚠️  Network connectivity issue detected.')
      console.error('[sendReviewEmail] Possible causes:')
      console.error('[sendReviewEmail]   1. Server cannot reach api.resend.com (firewall/network issue)')
      console.error('[sendReviewEmail]   2. DNS resolution failure for api.resend.com')
      console.error('[sendReviewEmail]   3. RESEND_API_KEY is invalid or service is unavailable')
      console.error('[sendReviewEmail]   4. Network timeout - increase timeout or check your connection')
      console.error('[sendReviewEmail] Development workaround: Set SKIP_EMAIL_SENDING=true to test without emails')
    }
    
    throw error
  }
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
  try {
    console.log('[send-for-review] Starting send-for-review request...')
    console.log('[send-for-review] Environment:', {
      NODE_ENV: process.env.NODE_ENV,
      hasResendKey: !!process.env.RESEND_API_KEY,
      hasResendFrom: !!process.env.REVIEW_EMAIL_FROM,
      hasWebhookUrl: !!process.env.REVIEW_EMAIL_WEBHOOK_URL,
      skipEmailSending: process.env.SKIP_EMAIL_SENDING === 'true',
    })

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

      const { data: projectRowResend, error: projectErrorResend } = await privilegedDb
        .from('projects')
        .select('name')
        .eq('id', document.project_id)
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
            documentType: document.doc_type,
            reviewUrl: row._review_url,
            expiresInDays: expiresInDays,
          })
        )
      )
      const emailFailure = emailResults.find((result) => result.status === 'rejected')
      if (emailFailure && emailFailure.status === 'rejected') {
        const errorMsg = emailFailure.reason instanceof Error ? emailFailure.reason.message : 'Failed to send review email'
        console.error('[send-for-review] Email send failure during resend:', errorMsg)
        return serverError(errorMsg)
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

    const { data: projectRow, error: projectError } = await privilegedDb
      .from('projects')
      .select('name')
      .eq('id', document.project_id)
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
          documentType: document.doc_type,
          reviewUrl: row._review_url,
          expiresInDays,
        })
      )
    )
    const emailFailure = emailResults.find((result) => result.status === 'rejected')
    if (emailFailure && emailFailure.status === 'rejected') {
      const errorMsg = emailFailure.reason instanceof Error ? emailFailure.reason.message : 'Failed to send review email'
      console.error('[send-for-review] Email send failure:', errorMsg)
      return serverError(errorMsg)
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
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred'
    console.error('[send-for-review] Unexpected error:', error)
    
    // Provide specific guidance for network errors
    if (errorMsg.includes('fetch failed') || errorMsg.includes('ETIMEDOUT') || errorMsg.includes('ECONNREFUSED')) {
      console.error('\n❌ EMAIL SENDING FAILED - NETWORK ERROR')
      console.error('═══════════════════════════════════════════════════')
      console.error('Your server cannot reach api.resend.com')
      console.error('\nQuick Solutions:')
      console.error('1. Test with development mode (no real email sending):')
      console.error('   Add to .env.local: SKIP_EMAIL_SENDING=true')
      console.error('\n2. Use a custom webhook instead of Resend:')
      console.error('   Add to .env.local: REVIEW_EMAIL_WEBHOOK_URL=<your-webhook-url>')
      console.error('\n3. Check your network/firewall settings')
      console.error('   - Verify you can reach https://api.resend.com')
      console.error('   - Check if your ISP/firewall blocks external APIs')
      console.error('\n4. Verify your RESEND_API_KEY is valid and active')
      console.error('═══════════════════════════════════════════════════\n')
    }
    
    return serverError(`Send for review failed: ${errorMsg}`)
  }
}
 