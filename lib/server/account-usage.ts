type SupabaseLike = {
  from: (table: string) => any
}

function monthStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10)
}

export async function getOrCreateMonthlyUsageRow(
  supabase: SupabaseLike,
  accountId: string,
  usageMonth = monthStart(),
) {
  const { data, error } = await (supabase.from('account_usage_monthly') as any)
    .select('account_id,usage_month,ai_generations_used,clash_gap_reports_used')
    .eq('account_id', accountId)
    .eq('usage_month', usageMonth)
    .maybeSingle()
  if (!error && data) return data

  const insert = {
    account_id: accountId,
    usage_month: usageMonth,
    ai_generations_used: 0,
    clash_gap_reports_used: 0,
    updated_at: new Date().toISOString(),
  }
  const { data: created } = await (supabase.from('account_usage_monthly') as any)
    .upsert(insert, { onConflict: 'account_id,usage_month' })
    .select('account_id,usage_month,ai_generations_used,clash_gap_reports_used')
    .maybeSingle()
  return created ?? insert
}

export async function incrementMonthlyAiGenerations(
  supabase: SupabaseLike,
  accountId: string,
  by = 1,
  usageMonth = monthStart(),
) {
  const row = await getOrCreateMonthlyUsageRow(supabase, accountId, usageMonth)
  const current =
    typeof row?.ai_generations_used === 'number' && Number.isFinite(row.ai_generations_used)
      ? row.ai_generations_used
      : 0
  const next = Math.max(0, Math.floor(current + by))
  await (supabase.from('account_usage_monthly') as any)
    .upsert(
      {
        account_id: accountId,
        usage_month: usageMonth,
        ai_generations_used: next,
        clash_gap_reports_used:
          typeof row?.clash_gap_reports_used === 'number' && Number.isFinite(row.clash_gap_reports_used)
            ? row.clash_gap_reports_used
            : 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_id,usage_month' },
    )
}

export async function incrementMonthlyClashGapReports(
  supabase: SupabaseLike,
  accountId: string,
  by = 1,
  usageMonth = monthStart(),
) {
  const row = await getOrCreateMonthlyUsageRow(supabase, accountId, usageMonth)
  const current =
    typeof row?.clash_gap_reports_used === 'number' && Number.isFinite(row.clash_gap_reports_used)
      ? row.clash_gap_reports_used
      : 0
  const next = Math.max(0, Math.floor(current + by))
  await (supabase.from('account_usage_monthly') as any)
    .upsert(
      {
        account_id: accountId,
        usage_month: usageMonth,
        ai_generations_used:
          typeof row?.ai_generations_used === 'number' && Number.isFinite(row.ai_generations_used)
            ? row.ai_generations_used
            : 0,
        clash_gap_reports_used: next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_id,usage_month' },
    )
}

