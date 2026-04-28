import type { SupabaseClient } from '@supabase/supabase-js'
import { badRequest, notFound, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { writeAuditLog } from '@/lib/server/audit'
import { getAuthContext } from '@/lib/server/auth'
import { findDocumentById } from '@/lib/server/document-store'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'
import { documentActivityCommentSchema } from '@/lib/server/validators'

type Params = { params: Promise<{ id: string }> }

function emailToDisplayLabel(email: string): string {
  const local = email.split('@')[0] ?? email
  return local
    .replace(/[._-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

async function enrichAuditRowsWithActorDisplayNames(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[]
): Promise<Record<string, unknown>[]> {
  const userIds = Array.from(
    new Set(
      rows
        .map((r) => (typeof r.actor_user_id === 'string' ? r.actor_user_id : null))
        .filter((id): id is string => Boolean(id))
    )
  )

  const byId = new Map<string, { full_name: string | null; email: string | null }>()
  if (userIds.length) {
    const { data: users } = await supabase.from('users').select('id, full_name, email').in('id', userIds)
    for (const u of users ?? []) {
      if (u && typeof u.id === 'string') {
        byId.set(u.id, {
          full_name: typeof u.full_name === 'string' ? u.full_name : null,
          email: typeof u.email === 'string' ? u.email : null,
        })
      }
    }
  }

  return rows.map((row) => {
    const actor_type = typeof row.actor_type === 'string' ? row.actor_type : null
    const actor_email = typeof row.actor_email === 'string' ? row.actor_email.trim() : ''
    const actor_user_id = typeof row.actor_user_id === 'string' ? row.actor_user_id : null

    let actor_display_name: string

    if (actor_email) {
      actor_display_name = emailToDisplayLabel(actor_email)
    } else if (actor_user_id && byId.has(actor_user_id)) {
      const u = byId.get(actor_user_id)!
      if (u.full_name?.trim()) actor_display_name = u.full_name.trim()
      else if (u.email?.trim()) actor_display_name = emailToDisplayLabel(u.email.trim())
      else actor_display_name = 'Team member'
    } else if (actor_type === 'reviewer') {
      actor_display_name = 'Reviewer'
    } else if (actor_type === 'system') {
      actor_display_name = 'System'
    } else {
      actor_display_name = 'Team member'
    }

    return { ...row, actor_display_name }
  })
}

export type ReviewDecisionSummary = {
  id: string
  review_cycle_id: string
  cycle_no: number | null
  decided_at: string
  reviewer_email: string
  reviewer_name: string | null
  status: 'Approved' | 'Rejected'
  notes: string | null
}

async function fetchReviewDecisionsForDocument(
  supabase: SupabaseClient,
  documentId: string
): Promise<ReviewDecisionSummary[]> {
  const { data: cycles, error: cyclesError } = await supabase
    .from('review_cycles')
    .select('id, cycle_no')
    .eq('document_id', documentId)

  if (cyclesError || !cycles?.length) return []

  const cycleNoById = new Map<string, number | null>()
  for (const c of cycles as Array<{ id: string; cycle_no?: number | null }>) {
    cycleNoById.set(c.id, typeof c.cycle_no === 'number' ? c.cycle_no : null)
  }
  const cycleIds = cycles.map((c: { id: string }) => c.id)

  const { data: requests, error: reqError } = await supabase
    .from('review_requests')
    .select('id, review_cycle_id, reviewer_email, full_name, decision, decision_notes, decided_at, is_overridden')
    .in('review_cycle_id', cycleIds)
    .not('decided_at', 'is', null)
    .not('decision', 'is', null)
    .order('decided_at', { ascending: false })

  if (reqError || !requests?.length) return []

  const out: ReviewDecisionSummary[] = []
  for (const r of requests as Array<Record<string, unknown>>) {
    if (r.is_overridden === true) continue
    const decision = r.decision
    if (decision !== 'approve' && decision !== 'reject') continue

    const reviewCycleId = typeof r.review_cycle_id === 'string' ? r.review_cycle_id : String(r.review_cycle_id ?? '')
    const decidedAt = typeof r.decided_at === 'string' ? r.decided_at : ''
    const reviewerEmail = typeof r.reviewer_email === 'string' ? r.reviewer_email : ''
    const fullName = typeof r.full_name === 'string' ? r.full_name.trim() : ''
    const rawNotes = typeof r.decision_notes === 'string' ? r.decision_notes.trim() : ''

    out.push({
      id: typeof r.id === 'string' ? r.id : String(r.id ?? ''),
      review_cycle_id: reviewCycleId,
      cycle_no: cycleNoById.get(reviewCycleId) ?? null,
      decided_at: decidedAt,
      reviewer_email: reviewerEmail,
      reviewer_name: fullName.length > 0 ? fullName : null,
      status: decision === 'approve' ? 'Approved' : 'Rejected',
      notes: rawNotes.length > 0 ? rawNotes : null,
    })
  }

  return out
}

export async function GET(req: Request, { params }: Params) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) {
    return badRequest(
      'Account context is unavailable. Configure SUPABASE_SERVICE_ROLE_KEY and ensure your account row exists in the database.'
    )
  }
  const { id } = await params

  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const { data: doc } = await findDocumentById({
    supabase,
    id,
    accountId: auth.accountId,
  })
  if (!doc) return notFound('Document not found')

  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('account_id', auth.accountId)
    .eq('document_id', id)
    .order('created_at', { ascending: false })

  if (error) return serverError(error.message)

  const raw = (data ?? []) as Record<string, unknown>[]
  const activity = await enrichAuditRowsWithActorDisplayNames(supabase, raw)
  const reviewDecisions = await fetchReviewDecisionsForDocument(supabase, id)
  return ok({ activity, reviewDecisions })
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

  const parsed = documentActivityCommentSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return badRequest('Invalid payload', parsed.error.flatten())

  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const { data: doc } = await findDocumentById({
    supabase,
    id,
    accountId: auth.accountId,
  })
  if (!doc) return notFound('Document not found')

  await writeAuditLog(
    {
      accountId: auth.accountId,
      actorType: 'user',
      actorUserId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      eventType: 'document.comment',
      documentId: id,
      projectId: doc.project_id,
      eventData: { body: parsed.data.body },
    },
    supabase
  )

  return ok({ success: true })
}
