import { formatClashGapError, isRetryableNetworkError } from '@/lib/server/clash-gap/errors'
import { fetchAllRows } from '@/lib/server/clash-gap/fetch-all-rows'
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
} from '@/lib/server/clash-gap/stage-state'
import { runChunkStage, runOcrStage } from '@/lib/server/clash-gap/stages'
import {
  buildSummaryFromRows,
  parseInsightFindingsPayload,
  type InsightFinding,
} from '@/lib/server/clash-gap/map-issues'
import {
  INSIGHT_SYSTEM_PROMPT,
  insightUserPrompt,
  type InsightDocumentSheet,
} from '@/lib/server/clash-gap/prompts/insight-review-engine'
import { loadProjectHistoryContext } from '@/lib/server/clash-gap/project-history'
import { persistInsightFindings } from '@/lib/server/clash-gap/persist-insight-findings'
import {
  enrichPlanSheetWithVision,
  mergeVisionEnrichment,
  needsVisionEnrichment,
  visionEnrichmentSummary,
  type PlanSheetForVision,
} from '@/lib/server/clash-gap/detect-vision-enrich'
import {
  buildInsightImageCaption,
  insightImageDetail,
  loadInsightPlanImages,
  shouldUseInsightImages,
} from '@/lib/server/clash-gap/insight-multimodal'

type SheetRow = {
  id: string
  analysis_file_id: string
  sheet_id: string | null
  discipline: string | null
  page_index: number
  raw_text: string | null
  structured: Record<string, unknown> | null
  image_path: string | null
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
  const n = Number(process.env.CLASH_GAP_LLM_CONCURRENCY || 4)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 4
}

function insightBatchSize(): number {
  const n = Number(process.env.CLASH_GAP_INSIGHT_BATCH_SHEETS || 20)
  return Number.isFinite(n) && n >= 5 ? Math.floor(n) : 20
}

const RETRYABLE_LLM_STATUS = new Set([408, 409, 429, 500, 502, 503, 529])

function isRetryableLlmError(error: unknown): boolean {
  if (isRetryableNetworkError(error)) return true
  const status = (error as { status?: number } | null)?.status
  return typeof status === 'number' && RETRYABLE_LLM_STATUS.has(status)
}

function llmTimeoutMs(): number {
  const n = Number(process.env.CLASH_GAP_LLM_TIMEOUT_MS || 180_000)
  return Number.isFinite(n) && n >= 1000 ? Math.floor(n) : 180_000
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

function classifyConcurrency(): number {
  const n = Number(process.env.CLASH_GAP_CLASSIFY_CONCURRENCY || process.env.CLASH_GAP_LLM_CONCURRENCY || 3)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 3
}

async function callJsonLlm(
  system: string,
  user: string,
  model: string,
  images?: Array<{ dataUrl: string; sheetId: string }>,
) {
  const openai = getOpenAIClient()
  if (!openai) return { findings: [] }

  const maxAttempts = 3
  let lastError: unknown

  const userContent =
    images?.length
      ? [
          { type: 'text' as const, text: user },
          ...images.flatMap((img) => [
            { type: 'text' as const, text: `[Drawing image: ${img.sheetId}]` },
            {
              type: 'image_url' as const,
              image_url: { url: img.dataUrl, detail: insightImageDetail() },
            },
          ]),
        ]
      : user

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), llmTimeoutMs())
    try {
      const stream = await openai.chat.completions.create(
        {
          model,
          temperature: 0.1,
          response_format: { type: 'json_object' },
          stream: true,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: userContent },
          ],
        },
        { signal: controller.signal, maxRetries: 0 },
      )
      let raw = ''
      for await (const chunk of stream) {
        raw += chunk.choices[0]?.delta?.content ?? ''
      }
      if (!raw) return { findings: [] }
      try {
        return JSON.parse(raw) as unknown
      } catch {
        console.error('[clash-gap detect] LLM returned invalid JSON', raw.slice(0, 500))
        return { findings: [] }
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

function visionEnrichConcurrency(): number {
  const n = Number(process.env.CLASH_GAP_VISION_CONCURRENCY || 2)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 2
}

function visionEnrichMaxSheets(): number {
  const n = Number(process.env.CLASH_GAP_DETECT_VISION_MAX_SHEETS || 12)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 12
}

async function enrichPlanSheetsWithVision(
  supabase: StageParams['supabase'],
  sheets: SheetRow[],
  onProgress: (detail: string) => Promise<void>,
): Promise<void> {
  const candidates = sheets
    .filter((s) => s.file_role === 'plans')
    .filter((s) => needsVisionEnrichment(s as PlanSheetForVision))
    .slice(0, visionEnrichMaxSheets())

  if (!candidates.length) return

  let done = 0
  await onProgress(`Vision enrich 0/${candidates.length} plan sheet(s)…`)

  await mapWithConcurrency(candidates, visionEnrichConcurrency(), async (sheet) => {
    const enrichment = await enrichPlanSheetWithVision(sheet as PlanSheetForVision)
    if (enrichment) {
      const merged = mergeVisionEnrichment(sheet.structured, enrichment)
      const supplement = visionEnrichmentSummary(enrichment)
      const rawText = supplement
        ? `${(sheet.raw_text || '').trim()}\n\n--- VISION ENRICHMENT ---\n${supplement}`.trim()
        : sheet.raw_text

      await supabase
        .from('clash_gap_extracted_sheets')
        .update({
          structured: merged,
          ...(rawText ? { raw_text: rawText } : {}),
        })
        .eq('id', sheet.id)

      sheet.structured = merged
      if (rawText) sheet.raw_text = rawText
    }
    done += 1
    await onProgress(`Vision enrich ${done}/${candidates.length} plan sheet(s)…`)
  })
}

function classifyBatchSize(): number {
  const n = Number(process.env.CLASH_GAP_CLASSIFY_BATCH_SHEETS || 12)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 12
}

async function classifySheetsBatch(batch: SheetRow[]) {
  const payload = await callJsonLlm(
    `Classify construction document sheets. Return JSON: { "sheets": [ { "index": number, "discipline": "architectural"|"structural"|"mechanical"|"electrical"|"plumbing"|"civil"|"fire_protection"|"other", "sheet_id": "string", "notes": string[], "callouts": string[], "schedules": string[], "detail_references": string[] } ] }. index matches the input order (0-based).`,
    JSON.stringify({
      sheets: batch.map((sheet, index) => ({
        index,
        sheet_id: sheet.sheet_id,
        file_role: sheet.file_role,
        file_name: sheet.file_name,
        content: (sheet.raw_text || '').slice(0, 4000),
      })),
    }),
    classifyModel(),
  )
  const obj = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
  const rows = Array.isArray(obj.sheets) ? obj.sheets : []
  const byIndex = new Map<number, Record<string, unknown>>()
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const index = Number(r.index)
    if (Number.isInteger(index) && index >= 0 && index < batch.length) {
      byIndex.set(index, r)
    }
  }

  return batch.map((sheet, index) => {
    const objRow = byIndex.get(index) ?? {}
    const discipline =
      typeof objRow.discipline === 'string' ? objRow.discipline.toLowerCase() : 'other'
    const sheetId =
      typeof objRow.sheet_id === 'string' && objRow.sheet_id.trim()
        ? objRow.sheet_id.trim()
        : sheet.sheet_id || `Page-${sheet.page_index + 1}`
    const structured = {
      notes: Array.isArray(objRow.notes) ? objRow.notes : [],
      callouts: Array.isArray(objRow.callouts) ? objRow.callouts : [],
      schedules: Array.isArray(objRow.schedules) ? objRow.schedules : [],
      detail_references: Array.isArray(objRow.detail_references) ? objRow.detail_references : [],
    }
    const mergedStructured = {
      ...(sheet.structured ?? {}),
      classify: structured,
    }
    return { sheet, discipline, sheetId, structured: mergedStructured }
  })
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

function toInsightSheets(sheets: SheetRow[]): InsightDocumentSheet[] {
  return sheets.map((s) => ({
    fileName: s.file_name || 'document',
    fileRole: s.file_role || 'plans',
    sheetId: s.sheet_id || `Page-${s.page_index + 1}`,
    discipline: s.discipline || 'other',
    pageIndex: s.page_index,
    text: s.raw_text || '',
    structured: s.structured ?? null,
    imagePath: s.image_path ?? null,
  }))
}

function batchInsightSheets(sheets: InsightDocumentSheet[]): InsightDocumentSheet[][] {
  const batchSize = insightBatchSize()
  const specs = sheets.filter((s) => s.fileRole === 'specs' || s.fileRole === 'addenda')
  const plans = sheets.filter((s) => s.fileRole === 'plans')
  const other = sheets.filter(
    (s) => !['plans', 'specs', 'addenda'].includes(s.fileRole),
  )

  if (plans.length <= batchSize) return [sheets]

  const batches: InsightDocumentSheet[][] = []
  for (let i = 0; i < plans.length; i += batchSize) {
    batches.push([...specs, ...other, ...plans.slice(i, i + batchSize)])
  }
  return batches
}

export async function runDetectStage(params: StageParams) {
  const analysis = await getAnalysisForAccount(params.supabase, params.analysisId, params.accountId)
  if (!analysis) throw new Error('Analysis not found')

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

    const sheetRows = await fetchAllRows<any>((from, to) =>
      params.supabase
        .from('clash_gap_extracted_sheets')
        .select('*')
        .in('analysis_file_id', fileIds)
        .order('analysis_file_id', { ascending: true })
        .order('page_index', { ascending: true })
        .range(from, to),
    )

    const sheets: SheetRow[] = sheetRows.map((row: any) => {
      const file = fileById.get(row.analysis_file_id)
      return {
        id: row.id,
        analysis_file_id: row.analysis_file_id,
        sheet_id: row.sheet_id,
        discipline: row.discipline,
        page_index: row.page_index,
        raw_text: row.raw_text,
        structured: row.structured,
        image_path: row.image_path ?? null,
        file_name: file?.file_name,
        file_role: file?.file_role,
      }
    })

    if (!sheets.length) throw new Error('No extracted text — run the OCR stage first')

    let llmDone = 0
    const llmTotal = sheets.length
    const bumpDetect = async (detail: string) => {
      await markStageProgress(params.supabase, params.analysisId, 'detect', {
        processed: llmDone,
        total: llmTotal,
        detail,
      })
    }
    await bumpDetect('Indexing contract documents…')

    const projectHistory = await loadProjectHistoryContext(
      params.supabase,
      analysis.project_id,
      params.accountId,
      params.analysisId,
    )

    const unclassified = sheets.filter((s) => !s.discipline)
    const batchSize = classifyBatchSize()
    const classifyBatches: SheetRow[][] = []
    for (let i = 0; i < unclassified.length; i += batchSize) {
      classifyBatches.push(unclassified.slice(i, i + batchSize))
    }

    let classifyDone = 0
    if (classifyBatches.length) {
      await bumpDetect(`Indexing 0/${unclassified.length} sheet(s)…`)
      await mapWithConcurrency(classifyBatches, classifyConcurrency(), async (batch) => {
        const results = await classifySheetsBatch(batch)
        for (const { sheet, discipline, sheetId, structured } of results) {
          await params.supabase
            .from('clash_gap_extracted_sheets')
            .update({ discipline, sheet_id: sheetId, structured })
            .eq('id', sheet.id)
          sheet.discipline = discipline
          sheet.sheet_id = sheetId
          sheet.structured = structured
        }
        classifyDone += batch.length
        await bumpDetect(`Indexing… ${classifyDone}/${unclassified.length}`)
      })
    }
    llmDone = llmTotal

    await enrichPlanSheetsWithVision(params.supabase, sheets, bumpDetect)

    const trades =
      settings.scope === 'selected_trades' && settings.selectedTrades?.length
        ? settings.selectedTrades
        : []

    const scopedSheets = sheets.filter((s) => tradeMatches(s.discipline || 'other', trades))
    const insightSheets = toInsightSheets(scopedSheets.length ? scopedSheets : sheets)
    const batches = batchInsightSheets(insightSheets)
    const model = analysisModel()
    const allFindings: InsightFinding[] = []

    const projectLabel =
      projectHistory.project_name ||
      `Project ${analysis.project_id.slice(0, 8)}`

    for (let i = 0; i < batches.length; i++) {
      const batchSheets = batches[i]!
      const useImages = shouldUseInsightImages(batchSheets)
      const planImages = useImages ? await loadInsightPlanImages(batchSheets) : []
      await bumpDetect(
        batches.length > 1
          ? planImages.length
            ? `INSIGHT review batch ${i + 1}/${batches.length} (${planImages.length} image(s))…`
            : `INSIGHT review batch ${i + 1}/${batches.length}…`
          : planImages.length
            ? `INSIGHT AI review (${planImages.length} drawing image(s))…`
            : 'INSIGHT AI review…',
      )
      const promptText = insightUserPrompt({
        projectLabel,
        analysisId: params.analysisId,
        projectHistory,
        sheets: batchSheets,
        selectedTrades: trades,
      })
      const imageCaption = planImages.length ? buildInsightImageCaption(planImages) : ''
      const userPrompt = imageCaption ? `${promptText}\n\n${imageCaption}` : promptText
      const payload = await callJsonLlm(
        INSIGHT_SYSTEM_PROMPT,
        userPrompt,
        model,
        planImages.map((img) => ({ dataUrl: img.dataUrl, sheetId: img.sheetId })),
      )
      allFindings.push(...parseInsightFindingsPayload(payload))
    }

    const { rows: dbRows, linked, created } = await persistInsightFindings({
      supabase: params.supabase,
      findings: allFindings,
      analysisId: params.analysisId,
      projectId: analysis.project_id,
      accountId: params.accountId,
    })

    const summary = {
      ...buildSummaryFromRows(
        dbRows as Array<{ type: string; issue_type_v2?: string; recommended_action?: string }>,
      ),
      linked_to_existing: linked,
      newly_created: created,
    }

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
      detail: `${dbRows.length} finding(s)`,
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
          engine: 'insight',
          issueCount: dbRows.length,
          linkedToExisting: linked,
          newlyCreated: created,
        },
      },
      params.supabase,
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
