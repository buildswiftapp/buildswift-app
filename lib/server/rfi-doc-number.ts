import type { SupabaseClient } from '@supabase/supabase-js'

const RFI_SEQ = /^RFI-(\d+)$/i

export async function allocateNextRfiDocNumber(supabase: SupabaseClient, projectId: string): Promise<string> {
  const { data, error } = await supabase
    .from('documents')
    .select('doc_number')
    .eq('project_id', projectId)
    .eq('doc_type', 'rfi')

  if (error) throw new Error(error.message)

  let max = 0
  let pad = 3
  for (const row of data ?? []) {
    const dn = typeof row.doc_number === 'string' ? row.doc_number.trim() : ''
    const m = dn.match(RFI_SEQ)
    if (m) {
      const n = parseInt(m[1], 10)
      if (!Number.isNaN(n)) max = Math.max(max, n)
      pad = Math.max(pad, m[1].length)
    }
  }

  return `RFI-${String(max + 1).padStart(pad, '0')}`
}
