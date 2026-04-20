type DocType = 'rfi' | 'submittal' | 'change_order'

const TABLE_BY_TYPE: Record<DocType, string> = {
  rfi: 'rfi_documents',
  submittal: 'submittal_documents',
  change_order: 'change_order_documents',
}

const TYPES: DocType[] = ['rfi', 'submittal', 'change_order']

type BaseDoc = {
  id: string
  account_id: string
  project_id: string
  doc_number: string | null
  title: string
  description: string
  current_version_no: number
  internal_status: string
  external_status: string
  is_final: boolean
  created_by: string
  created_at: string
  updated_at: string
  finalized_at: string | null
  rejected_count: number
}

export type UnifiedDocument = BaseDoc & { doc_type: DocType }

export async function listDocuments(params: {
  supabase: any
  accountId: string
  docType?: string | null
  projectId?: string | null
}) {
  const { supabase, accountId, docType, projectId } = params
  const types = docType && TYPES.includes(docType as DocType) ? [docType as DocType] : TYPES
  const all: UnifiedDocument[] = []

  for (const t of types) {
    let q = supabase.from(TABLE_BY_TYPE[t]).select('*').eq('account_id', accountId)
    if (projectId) q = q.eq('project_id', projectId)
    const { data, error } = await q
    if (error) return { data: null, error }
    all.push(...((data ?? []).map((row: BaseDoc) => ({ ...row, doc_type: t }))))
  }

  all.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  return { data: all, error: null }
}

export async function findDocumentById(params: {
  supabase: any
  id: string
  accountId?: string | null
}) {
  const { supabase, id, accountId } = params
  for (const t of TYPES) {
    let q = supabase.from(TABLE_BY_TYPE[t]).select('*').eq('id', id)
    if (accountId) q = q.eq('account_id', accountId)
    const { data, error } = await q.maybeSingle()
    if (error) return { data: null, error }
    if (data) return { data: { ...(data as BaseDoc), doc_type: t } as UnifiedDocument, error: null }
  }
  return { data: null, error: null }
}

export async function insertDocument(params: {
  supabase: any
  docType: DocType
  row: Omit<BaseDoc, 'id' | 'created_at' | 'updated_at' | 'is_final' | 'finalized_at' | 'rejected_count'>
}) {
  const { supabase, docType, row } = params
  const { data, error } = await supabase
    .from(TABLE_BY_TYPE[docType])
    .insert({
      ...row,
      is_final: false,
      rejected_count: 0,
    })
    .select('*')
    .single()
  if (error) return { data: null, error }
  return { data: { ...(data as BaseDoc), doc_type: docType } as UnifiedDocument, error: null }
}

export async function updateDocument(params: {
  supabase: any
  id: string
  accountId: string
  updates: Record<string, unknown>
}) {
  const { supabase, id, accountId, updates } = params
  const found = await findDocumentById({ supabase, id, accountId })
  if (found.error || !found.data) return { data: null, error: found.error, docType: null }
  const { doc_type } = found.data
  const { data, error } = await supabase
    .from(TABLE_BY_TYPE[doc_type])
    .update(updates)
    .eq('id', id)
    .eq('account_id', accountId)
    .select('*')
    .single()
  if (error) return { data: null, error, docType: doc_type }
  return { data: { ...(data as BaseDoc), doc_type } as UnifiedDocument, error: null, docType: doc_type }
}

export async function deleteDocument(params: {
  supabase: any
  id: string
  accountId: string
}) {
  const { supabase, id, accountId } = params
  const found = await findDocumentById({ supabase, id, accountId })
  if (found.error || !found.data) return { data: null, error: found.error, docType: null }
  const { doc_type } = found.data
  const { data, error } = await supabase
    .from(TABLE_BY_TYPE[doc_type])
    .delete()
    .eq('id', id)
    .eq('account_id', accountId)
    .select('id,project_id')
    .maybeSingle()
  return { data, error, docType: doc_type }
}

export async function updateDocumentStatusesById(params: {
  supabase: any
  id: string
  internalStatus: string
  externalStatus: string
}) {
  const { supabase, id, internalStatus, externalStatus } = params
  const found = await findDocumentById({ supabase, id })
  if (found.error || !found.data) return { error: found.error, data: null }
  const table = TABLE_BY_TYPE[found.data.doc_type]
  const { data, error } = await supabase
    .from(table)
    .update({ internal_status: internalStatus, external_status: externalStatus })
    .eq('id', id)
    .select('id')
    .maybeSingle()
  return { data, error }
}
