import { formatClashGapError, isRetryableNetworkError } from '@/lib/server/clash-gap/errors'
import { getOpenAIClient } from '@/lib/server/openai'
import { writeAuditLog } from '@/lib/server/audit'
import { incrementMonthlyClashGapReports } from '@/lib/server/account-usage'
import {
  getAnalysisForAccount,
  parseSettings,
  updateAnalysisStep,
} from '@/lib/server/clash-gap/access'
import { isImageUpload } from '@/lib/server/clash-gap/extract-pdf'
import {
  markStageCompleted,
  markStageFailed,
  markStageProgress,
  markStageRunning,
} from '@/lib/server/clash-gap/stage-state'
import { runChunkStage, runOcrStage } from '@/lib/server/clash-gap/stages'
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

type StageParams = {
  supabase: any
  analysisId: string
  accountId: string
  userId: string
  userEmail: string | null
}

function analysisModel() {
  return process.env.OPENAI_MODEL || 'gpt-4o'
}

function classifyModel() {
  return process.env.OPENAI_MODEL_CLASSIFY || process.env.OPENAI_MODEL || 'gpt-4o-mini'
}

function llmConcurrency(): number {
  const n = Number(process.env.CLASH_GAP_LLM_CONCURRENCY || 6)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 6
}

// Status codes worth retrying: rate limits, overload, and transient gateway errors.
const RETRYABLE_LLM_STATUS = new Set([408, 409, 429, 500, 502, 503, 529])

function isRetryableLlmError(error: unknown): boolean {
  if (isRetryableNetworkError(error)) return true
  const status = (error as { status?: number } | null)?.status
  return typeof status === 'number' && RETRYABLE_LLM_STATUS.has(status)
}

function llmTimeoutMs(): number {
  const n = Number(process.env.CLASH_GAP_LLM_TIMEOUT_MS || 90_000)
  return Number.isFinite(n) && n >= 1000 ? Math.floor(n) : 90_000
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  const safeLimit = Math.max(1, Math.min(limit, items.length || 1))
  let next = 0

  async function runner(): Promise<void> {
    while (true) {
      const index = next++
      if (index >= items.length) return
      results[index] = await worker(items[index]!, index)
    }
  }

  await Promise.all(Array.from({ length: safeLimit }, () => runner()))
  return results
}

async function callJsonLlm(system: string, user: string, model: string) {
  const openai = getOpenAIClient()
  if (!openai) return { issues: [] }

  const maxAttempts = 3
  let lastError: unknown

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Own the timeout via an AbortController, and disable the SDK's retries so we
    // don't multiply slow calls. The response is streamed so HTTP headers arrive
    // immediately — that avoids undici's UND_ERR_HEADERS_TIMEOUT on long generations.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), llmTimeoutMs())
    try {
      const stream = await openai.chat.completions.create(
        {
          model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          stream: true,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        },
        { signal: controller.signal, maxRetries: 0 },
      )
      let raw = ''
      for await (const chunk of stream) {
        raw += chunk.choices[0]?.delta?.content ?? ''
      }
      if (!raw) return { issues: [] }
      try {
        return JSON.parse(raw) as unknown
      } catch {
        return { issues: [] }
      }
    } catch (error) {
      lastError = error
      const retryable = controller.signal.aborted || isRetryableLlmError(error)
      if (attempt < maxAttempts - 1 && retryable) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)))
        continue
      }
      throw new Error(formatClashGapError(error))
    } finally {
      clearTimeout(timer)
    }
  }

  throw new Error(formatClashGapError(lastError))
}

async function classifyAndStructureSheet(sheet: SheetRow) {
  const text = sheet.raw_text || ''
  const payload = await callJsonLlm(
    `Classify a construction sheet and extract its key content in one pass. Return JSON: { "discipline": "architectural"|"structural"|"mechanical"|"electrical"|"plumbing"|"civil"|"other", "sheet_id": "string", "notes": string[], "callouts": string[], "schedules": string[], "detail_references": string[] }`,
    JSON.stringify({
      sheet_id: sheet.sheet_id,
      content: text.slice(0, 6000),
    }),
    classifyModel()
  )
  const obj = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
  const discipline =
    typeof obj.discipline === 'string' ? obj.discipline.toLowerCase() : 'other'
  const sheetId =
    typeof obj.sheet_id === 'string' && obj.sheet_id.trim()
      ? obj.sheet_id.trim()
      : sheet.sheet_id || `Page-${sheet.page_index + 1}`
  const structured = {
    notes: Array.isArray(obj.notes) ? obj.notes : [],
    callouts: Array.isArray(obj.callouts) ? obj.callouts : [],
    schedules: Array.isArray(obj.schedules) ? obj.schedules : [],
    detail_references: Array.isArray(obj.detail_references) ? obj.detail_references : [],
  }
  return { discipline, sheetId, structured }
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

export async function runDetectStage(params: StageParams) {
  const analysis = await getAnalysisForAccount(params.supabase, params.analysisId, params.accountId)
  if (!analysis) throw new Error('Analysis not found')

  await markStageRunning(params.supabase, params.analysisId, 'detect')
  await updateAnalysisStep(params.supabase, params.analysisId, {
    status: 'processing',
    processing_step: 'detect',
    error_message: null,
  })

  try {
    const settings = parseSettings(analysis.settings)

    const { data: files, error: filesError } = await params.supabase
      .from('clash_gap_analysis_files')
      .select('*')
      .eq('analysis_id', params.analysisId)
      .order('created_at', { ascending: true })
    if (filesError) throw new Error(filesError.message)
    if (!files?.length) throw new Error('No files uploaded')

    const hasPlansRole = files.some((f: { file_role: string }) => f.file_role === 'plans')
    const hasSpecsRole = files.some(
      (f: { file_role: string }) => f.file_role === 'specs' || f.file_role === 'addenda',
    )
    const firstFile = files[0]
    const firstMime = (firstFile?.mime_type || '').toLowerCase()
    const firstName = (firstFile?.file_name || '').toLowerCase()
    const allowSingleFallback =
      files.length === 1 &&
      (isImageUpload(firstMime, firstName) || firstMime.includes('pdf') || firstName.endsWith('.pdf'))

    if (!hasPlansRole && !allowSingleFallback) {
      throw new Error('At least one plans document is required')
    }
    if (!hasSpecsRole && !allowSingleFallback) {
      throw new Error('At least one specifications document is required')
    }

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

    if (!sheets.length) throw new Error('No extracted text — run the OCR and merge stages first')

    // Detect reports no progress on its own, which makes the step look frozen and
    // trips the client's stall watchdog. Emit a heartbeat for every LLM call.
    let llmDone = 0
    let llmTotal = sheets.length
    const bumpDetect = async (detail: string) => {
      await markStageProgress(params.supabase, params.analysisId, 'detect', {
        processed: llmDone,
        total: llmTotal,
        detail,
      })
    }
    await bumpDetect('Classifying sheets…')

    await mapWithConcurrency(sheets, llmConcurrency(), async (sheet) => {
      // Resume support: keep sheets already classified by an interrupted run.
      if (!sheet.discipline) {
        const { discipline, sheetId, structured } = await classifyAndStructureSheet(sheet)
        await params.supabase
          .from('clash_gap_extracted_sheets')
          .update({ discipline, sheet_id: sheetId, structured })
          .eq('id', sheet.id)
        sheet.discipline = discipline
        sheet.sheet_id = sheetId
        sheet.structured = structured
      }
      llmDone++
      if (llmDone % 3 === 0) await bumpDetect(`Classifying sheets… ${llmDone}/${llmTotal}`)
    })

    await params.supabase.from('clash_gap_issues').delete().eq('analysis_id', params.analysisId)

    const trades =
      settings.scope === 'selected_trades' && settings.selectedTrades?.length
        ? settings.selectedTrades
        : []

    const planSheets = sheets.filter((s) => s.file_role === 'plans')
    const specSheets = sheets.filter((s) => s.file_role === 'specs' || s.file_role === 'addenda')
    const effectivePlanSheets = planSheets.length ? planSheets : allowSingleFallback ? sheets : []
    const effectiveSpecSheets = specSheets.length ? specSheets : allowSingleFallback ? sheets : []

    const specLabel = effectiveSpecSheets[0]?.file_name || 'Specifications'
    const specContext = effectiveSpecSheets.map((s) => s.raw_text || '').join('\n\n')

    const allLlmIssues: ReturnType<typeof parseLlmIssuesPayload> = []
    const model = analysisModel()

    const gapSheets = effectivePlanSheets.filter((sheet) =>
      tradeMatches(sheet.discipline || 'other', trades),
    )
    const sections = splitSpecSections(specContext).slice(0, 8)
    // Now the remaining call counts are known — refine the progress denominator.
    llmTotal = sheets.length + gapSheets.length + (effectivePlanSheets.length ? 1 : 0) + sections.length

    await bumpDetect('Finding missing info…')
    const gapPayloads = await mapWithConcurrency(gapSheets, llmConcurrency(), async (sheet) => {
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
        model,
      )
      llmDone++
      if (llmDone % 3 === 0) await bumpDetect(`Finding missing info… ${llmDone}/${llmTotal}`)
      return payload
    })
    for (const payload of gapPayloads) {
      allLlmIssues.push(...parseLlmIssuesPayload(payload))
    }

    if (effectivePlanSheets.length >= 1) {
      const byDisc = new Map<string, typeof effectivePlanSheets>()
      for (const s of effectivePlanSheets) {
        const d = s.discipline || 'other'
        if (!byDisc.has(d)) byDisc.set(d, [])
        byDisc.get(d)!.push(s)
      }

      const allDisciplines = [...byDisc.keys()]
      const filtered = allDisciplines.filter((d) => tradeMatches(d, trades))
      const disciplines = allDisciplines.length <= 1 ? allDisciplines : filtered

      if (disciplines.length >= 1) {
        await bumpDetect('Checking conflicts…')
        const sheetsForCall = effectivePlanSheets.filter((s) =>
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
      llmDone++
    }

    const mismatchPlanSheets = effectivePlanSheets.slice(0, 10).map((s) => ({
      sheetId: s.sheet_id || '',
      discipline: s.discipline || 'other',
      text: s.raw_text || '',
    }))
    await bumpDetect('Checking mismatches…')
    const mismatchPayloads = await mapWithConcurrency(sections, llmConcurrency(), async (section) => {
      const payload = await callJsonLlm(
        MISMATCH_SYSTEM_PROMPT,
        mismatchUserPrompt({
          specLabel,
          specText: section.body,
          planLabel: 'Plans',
          planSheets: mismatchPlanSheets,
          sensitivity: settings.sensitivity,
        }),
        model,
      )
      llmDone++
      if (llmDone % 2 === 0) await bumpDetect(`Checking mismatches… ${llmDone}/${llmTotal}`)
      return payload
    })
    for (const payload of mismatchPayloads) {
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

    await markStageCompleted(params.supabase, params.analysisId, 'detect', {
      processed: dbRows.length,
      total: dbRows.length,
    })

    try {
      await incrementMonthlyClashGapReports(params.supabase as any, params.accountId, 1)
    } catch {
    }

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
  } catch (error) {
    const message = formatClashGapError(error)
    await markStageFailed(params.supabase, params.analysisId, 'detect', message)
    await updateAnalysisStep(params.supabase, params.analysisId, {
      status: 'failed',
      error_message: message,
    })
    throw error
  }
}

export async function runClashGapPipeline(params: StageParams) {
  await runChunkStage(params)
  await runOcrStage(params)
  return runDetectStage(params)
}
