import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'

type AuditInput = {
  accountId: string
  actorType: 'user' | 'reviewer' | 'system'
  actorUserId?: string | null
  actorEmail?: string | null
  eventType: string
  projectId?: string | null
  documentId?: string | null
  eventData?: Record<string, unknown> | null
  ip?: string | null
}

export async function writeAuditLog(input: AuditInput, db?: SupabaseClient | null) {
  const supabase = db ?? (await createSupabaseServerClient())
  if (!supabase) return

  await supabase.from('audit_logs').insert({
    account_id: input.accountId,
    project_id: input.projectId ?? null,
    document_id: input.documentId ?? null,
    actor_type: input.actorType,
    actor_user_id: input.actorUserId ?? null,
    actor_email: input.actorEmail ?? null,
    event_type: input.eventType,
    event_data: input.eventData ?? null,
    ip: input.ip ?? null,
  })
}
