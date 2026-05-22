import { formatClashGapError, isRetryableNetworkError } from '@/lib/server/clash-gap/errors'
import { getOpenAIClient } from '@/lib/server/openai'
import { writeAuditLog } from '@/lib/server/audit'
import type { DetectionSettings } from '@/lib/clash-gap-types'
import {
  getAnalysisForAccount,
  parseSettings,
  updateAnalysisStep,
} from '@/lib/server/clash-gap/access'
import { extractPdfFromStorage } from '@/lib/server/clash-gap/extract-pdf'
import {
  buildSummaryFromRows,
  llmIssuesToDbRows,
  parseLlmIssuesPayload,
} from '@/lib/server/clash-gap/map-issues'
import { CLASH_SYSTEM_PROMPT, clashUserPrompt } from '@/lib/server/clash-gap/prompts/clash'
import { GAP_SYSTEM_PROMPT, gapUserPrompt } from '@/lib/server/clash-gap/prompts/gap'
import {
  MISMATCH_SYSTEM_PROMPT,
  mismatchUserPrompt,
} from '@/lib/server/clash-gap/prompts/mismatch'

type SheetRow = {
  id: string
  analysis_file_id: string
  sheet_id: string | null
  discipline: string | null
  page_index: number
  raw_text: string | null
  structured: Record<string, unknown> | null
  file_name?: string
  file_role?: string
}

function maxPagesPerRun() {
  return Number(process.env.CLASH_GAP_MAX_PAGES_PER_RUN || 40)
}

function analysisModel() {
  return process.env.OPENAI_MODEL || 'gpt-4o'
}

function classifyModel() {
  return process.env.OPENAI_MODEL_CLASSIFY || process.env.OPENAI_MODEL || 'gpt-4o-mini'
}

async function callJsonLlm(system: string, user: string, model: string) {
  const openai = getOpenAIClient()
  if (!openai) return { issues: [] }

  const maxAttempts = 3
  let lastError: unknown

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      })
      const raw = completion.choices[0]?.message?.content
      if (!raw) return { issues: [] }
      try {
        return JSON.parse(raw) as unknown
      } catch {
        return { issues: [] }
      }
    } catch (error) {
      lastError = error
      if (attempt < maxAttempts - 1 && isRetryableNetworkError(error)) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)))
        continue
      }
      throw new Error(formatClashGapError(error))
    }
  }

  throw new Error(formatClashGapError(lastError))
}

async function classifySheet(sheet: SheetRow) {
  const text = sheet.raw_text || ''
  const payload = await callJsonLlm(
    `Classify construction sheet discipline. Return JSON: { "discipline": "architectural"|"structural"|"mechanical"|"electrical"|"plumbing"|"civil"|"other", "sheet_id": "string", "confidence": 0-1 }`,
    JSON.stringify({
      sheet_id: sheet.sheet_id,
      excerpt: text.slice(0, 2000),
    }),
    classifyModel()
  )
  const obj = payload as Record<string, unknown>
  const discipline =
    typeof obj.discipline === 'string' ? obj.discipline.toLowerCase() : 'other'
  const sheetId =
    typeof obj.sheet_id === 'string' && obj.sheet_id.trim()
      ? obj.sheet_id.trim()
      : sheet.sheet_id || `Page-${sheet.page_index + 1}`
  return { discipline, sheetId }
}

async function structureSheet(sheet: SheetRow, discipline: string, sheetId: string) {
  const text = sheet.raw_text || ''
  const payload = await callJsonLlm(
    `From sheet text return JSON: { "notes": string[], "callouts": string[], "schedules": string[], "detail_references": string[] }`,
    JSON.stringify({ discipline, sheet_id: sheetId, content: text.slice(0, 6000) }),
    classifyModel()
  )
  return (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
}

function tradeMatches(discipline: string, trades: string[]): boolean {
  if (!trades.length) return true
  const d = discipline.toLowerCase()
  return trades.some((t) => {
    const tl = t.toLowerCase()
    if (tl.includes('mep') && ['mechanical', 'electrical', 'plumbing'].some((x) => d.includes(x)))
      return true
    return d.includes(tl) || tl.includes(d)
  })
}

function splitSpecSections(text: string): Array<{ heading: string; body: string }> {
  const parts = text.split(/\n(?=\d{2}\s+\d{2}\s+\d{2}|\n#{1,3}\s|SECTION\s)/i)
  if (parts.length <= 1) return [{ heading: 'Specification', body: text }]
  return parts.map((body, i) => ({
    heading: `Section-${i + 1}`,
    body: body.trim(),
  }))
}

export async function runClashGapPipeline(params: {
  supabase: any
  analysisId: string
  accountId: string
  userId: string
  userEmail: string | null
}) {
  const analysis = await getAnalysisForAccount(params.supabase, params.analysisId, params.accountId)
  if (!analysis) throw new Error('Analysis not found')

  const settings = parseSettings(analysis.settings)
  const maxPages = maxPagesPerRun()

  await updateAnalysisStep(params.supabase, params.analysisId, {
    status: 'processing',
    processing_step: 'extract',
    error_message: null,
  })

  const { data: files, error: filesError } = await params.supabase
    .from('clash_gap_analysis_files')
    .select('*')
    .eq('analysis_id', params.analysisId)
    .order('created_at', { ascending: true })

  if (filesError) throw new Error(filesError.message)
  if (!files?.length) throw new Error('No files uploaded')
  if (!files.some((f: { file_role: string }) => f.file_role === 'plans')) {
    throw new Error('At least one plans document is required')
  }
  if (
    !files.some(
      (f: { file_role: string }) => f.file_role === 'specs' || f.file_role === 'addenda',
    )
  ) {
    throw new Error('At least one specifications document is required')
  }

  let pagesProcessed = 0

  for (const file of files) {
    if (pagesProcessed >= maxPages) break
    const mime = (file.mime_type || '').toLowerCase()
    if (!mime.includes('pdf') && !file.file_name.toLowerCase().endsWith('.pdf')) {
      continue
    }

    const remaining = maxPages - pagesProcessed
    const { sha256, pages } = await extractPdfFromStorage({
      storagePath: file.storage_path,
      fileName: file.file_name,
      maxPages: remaining,
    })

    await params.supabase
      .from('clash_gap_analysis_files')
      .update({ sha256, page_count: pages.length })
      .eq('id', file.id)

    const { data: existingSheets } = await params.supabase
      .from('clash_gap_extracted_sheets')
      .select('id, page_index')
      .eq('analysis_file_id', file.id)

    const existingSet = new Set((existingSheets || []).map((s: { page_index: number }) => s.page_index))

    for (const page of pages) {
      if (existingSet.has(page.pageIndex)) {
        pagesProcessed++
        continue
      }
      await params.supabase.from('clash_gap_extracted_sheets').insert({
        analysis_file_id: file.id,
        sheet_id: page.sheetId,
        page_index: page.pageIndex,
        raw_text: page.rawText,
      })
      pagesProcessed++
    }
  }

  await updateAnalysisStep(params.supabase, params.analysisId, { processing_step: 'classify' })

  const fileIds = files.map((f: { id: string }) => f.id)
  const fileById = new Map<string, { id: string; file_name: string; file_role: string }>(
    files.map((f: { id: string; file_name: string; file_role: string }) => [f.id, f]),
  )

  const { data: sheetRows, error: sheetsError } = await params.supabase
    .from('clash_gap_extracted_sheets')
    .select('*')
    .in('analysis_file_id', fileIds)

  if (sheetsError) throw new Error(sheetsError.message)

  const sheets: SheetRow[] = (sheetRows || []).map((row: any) => {
    const file = fileById.get(row.analysis_file_id)
    return {
      id: row.id,
      analysis_file_id: row.analysis_file_id,
      sheet_id: row.sheet_id,
      discipline: row.discipline,
      page_index: row.page_index,
      raw_text: row.raw_text,
      structured: row.structured,
      file_name: file?.file_name,
      file_role: file?.file_role,
    }
  })

  for (const sheet of sheets) {
    const { discipline, sheetId } = await classifySheet(sheet)
    await params.supabase
      .from('clash_gap_extracted_sheets')
      .update({ discipline, sheet_id: sheetId })
      .eq('id', sheet.id)
    sheet.discipline = discipline
    sheet.sheet_id = sheetId
  }

  await updateAnalysisStep(params.supabase, params.analysisId, { processing_step: 'structure' })

  for (const sheet of sheets) {
    const structured = await structureSheet(sheet, sheet.discipline || 'other', sheet.sheet_id || '')
    await params.supabase
      .from('clash_gap_extracted_sheets')
      .update({ structured })
      .eq('id', sheet.id)
    sheet.structured = structured
  }

  await updateAnalysisStep(params.supabase, params.analysisId, { processing_step: 'analyze' })

  await params.supabase.from('clash_gap_issues').delete().eq('analysis_id', params.analysisId)

  const trades =
    settings.scope === 'selected_trades' && settings.selectedTrades?.length
      ? settings.selectedTrades
      : []

  const planSheets = sheets.filter((s) => s.file_role === 'plans')
  const specSheets = sheets.filter((s) => s.file_role === 'specs' || s.file_role === 'addenda')

  // Both roles are guaranteed to be present (guarded above). Build a single
  // concatenated spec context that acts as the authoritative baseline for every
  // detection pass.
  const specLabel = specSheets[0]?.file_name || 'Specifications'
  const specContext = specSheets.map((s) => s.raw_text || '').join('\n\n')

  const allLlmIssues: ReturnType<typeof parseLlmIssuesPayload> = []
  const model = analysisModel()

  // --- Gap pass: each plan sheet reviewed against full spec context ---
  for (const sheet of planSheets) {
    if (!tradeMatches(sheet.discipline || 'other', trades)) continue
    const payload = await callJsonLlm(
      GAP_SYSTEM_PROMPT,
      gapUserPrompt({
        specLabel,
        specContent: specContext,
        documentLabel: sheet.file_name || 'Plans',
        sheetId: sheet.sheet_id || '',
        discipline: sheet.discipline || 'other',
        text: sheet.raw_text || '',
        sensitivity: settings.sensitivity,
      }),
      model
    )
    allLlmIssues.push(...parseLlmIssuesPayload(payload))
  }

  // --- Clash pass: coordination conflicts on plans, anchored to the spec ---
  if (planSheets.length >= 1) {
    const byDisc = new Map<string, typeof planSheets>()
    for (const s of planSheets) {
      const d = s.discipline || 'other'
      if (!byDisc.has(d)) byDisc.set(d, [])
      byDisc.get(d)!.push(s)
    }

    const allDisciplines = [...byDisc.keys()]
    const filtered = allDisciplines.filter((d) => tradeMatches(d, trades))
    const disciplines = allDisciplines.length <= 1 ? allDisciplines : filtered

    if (disciplines.length >= 1) {
      const sheetsForCall = planSheets.filter((s) =>
        disciplines.includes(s.discipline || 'other'),
      )
      const chunks = sheetsForCall.slice(0, 12).map((s) => ({
        documentLabel: s.file_name || 'Plans',
        sheetId: s.sheet_id || '',
        discipline: s.discipline || 'other',
        text: s.raw_text || '',
      }))
      const payload = await callJsonLlm(
        CLASH_SYSTEM_PROMPT,
        clashUserPrompt({
          specLabel,
          specContent: specContext,
          disciplines,
          chunks,
          sensitivity: settings.sensitivity,
        }),
        model
      )
      allLlmIssues.push(...parseLlmIssuesPayload(payload))
    }
  }

  // --- Mismatch pass: per spec section, drawings checked for active contradictions ---
  const sections = splitSpecSections(specContext)
  for (const section of sections.slice(0, 8)) {
    const payload = await callJsonLlm(
      MISMATCH_SYSTEM_PROMPT,
      mismatchUserPrompt({
        specLabel,
        specText: section.body,
        planLabel: 'Plans',
        planSheets: planSheets.slice(0, 10).map((s) => ({
          sheetId: s.sheet_id || '',
          discipline: s.discipline || 'other',
          text: s.raw_text || '',
        })),
        sensitivity: settings.sensitivity,
      }),
      model
    )
    allLlmIssues.push(...parseLlmIssuesPayload(payload))
  }

  const dbRows = llmIssuesToDbRows({
    issues: allLlmIssues,
    analysisId: params.analysisId,
    accountId: params.accountId,
  })

  if (dbRows.length) {
    const { error: insertError } = await params.supabase.from('clash_gap_issues').insert(dbRows)
    if (insertError) throw new Error(insertError.message)
  }

  const summary = buildSummaryFromRows(dbRows as Array<{ type: string }>)

  await updateAnalysisStep(params.supabase, params.analysisId, {
    status: 'completed',
    processing_step: 'done',
    summary,
    completed_at: new Date().toISOString(),
    error_message: null,
  })

  await writeAuditLog(
    {
      accountId: params.accountId,
      actorType: 'user',
      actorUserId: params.userId,
      actorEmail: params.userEmail,
      eventType: 'ai.generation',
      eventData: {
        feature: 'clash_gap_analysis',
        analysisId: params.analysisId,
        model,
        issueCount: dbRows.length,
      },
    },
    params.supabase
  )

  return { summary, issueCount: dbRows.length }
}
