type SupabaseLike = {
  from: (table: string) => {
    update: (values: Record<string, unknown>) => any
    select: (columns: string, opts?: any) => any
    eq: (col: string, value: any) => any
    maybeSingle?: () => any
    single?: () => any
  }
}

function isMissingColumnError(errorMessage: string) {
  const msg = errorMessage.toLowerCase()
  return msg.includes('does not exist') && msg.includes('column')
}

export async function incrementAccountStorageBytes(
  supabase: SupabaseLike,
  accountId: string,
  deltaBytes: number
): Promise<void> {
  if (!Number.isFinite(deltaBytes) || deltaBytes === 0) return

  try {
    const { data, error } = await (supabase.from('accounts' as any) as any)
      .select('storage_used_bytes')
      .eq('id', accountId)
      .maybeSingle()

    if (error) {
      if (isMissingColumnError(error.message)) return
      throw new Error(error.message)
    }

    const current =
      typeof data?.storage_used_bytes === 'number' && Number.isFinite(data.storage_used_bytes)
        ? Math.max(0, Math.floor(data.storage_used_bytes))
        : 0

    const next = Math.max(0, current + Math.floor(deltaBytes))
    const { error: updateError } = await (supabase.from('accounts' as any) as any)
      .update({ storage_used_bytes: next, updated_at: new Date().toISOString() })
      .eq('id', accountId)

    if (updateError && isMissingColumnError(updateError.message)) return
    if (updateError) throw new Error(updateError.message)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (isMissingColumnError(msg)) return
    throw e
  }
}
