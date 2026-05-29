import { formatClashGapError } from '@/lib/server/clash-gap/errors'
import { updateAnalysisStep } from '@/lib/server/clash-gap/access'
import {
  markStageCompleted,
  markStageFailed,
  markStageProgress,
  markStageRunning,
} from '@/lib/server/clash-gap/stage-state'
import {
  detectSheetId,
  isImageUpload,
  ocrImageWithOpenAI,
  sha256Buffer,
} from '@/lib/server/clash-gap/extract-pdf'
import { renderPdfPageFromDoc, withPdfDocument } from '@/lib/server/clash-gap/render-pdf-page'
import { mergePageText } from '@/lib/server/clash-gap/merge-ocr'
import {
  clashGapImagePath,
  downloadClashGapFile,
  uploadClashGapImage,
} from '@/lib/server/clash-gap/storage'

type StageParams = {
  supabase: any
  analysisId: string
  accountId: string
  userId: string
  userEmail: string | null
}

type FileRow = {
  id: string
  storage_path: string
  file_name: string
  mime_type: string | null
}

function maxPagesPerRun(): number {
  const n = Number(process.env.CLASH_GAP_MAX_PAGES_PER_RUN || 40)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 40
}

function ocrConcurrency(): number {
  const n = Number(process.env.CLASH_GAP_OCR_CONCURRENCY || 3)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 3
}

function pageStageTimeoutMs(): number {
  const n = Number(process.env.CLASH_GAP_PAGE_STAGE_TIMEOUT_MS || 120_000)
  return Number.isFinite(n) && n >= 1000 ? Math.floor(n) : 120_000
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms)
  })
  try {
    return await Promise.race([promise, guard])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  const safeLimit = Math.max(1, Math.min(limit, items.length || 1))
  let next = 0
  async function runner(): Promise<void> {
    while (true) {
      const index = next++
      if (index >= items.length) return
      await worker(items[index]!, index)
    }
  }
  await Promise.all(Array.from({ length: safeLimit }, () => runner()))
}

async function loadFiles(supabase: any, analysisId: string): Promise<FileRow[]> {
  const { data, error } = await supabase
    .from('clash_gap_analysis_files')
    .select('id, storage_path, file_name, mime_type')
    .eq('analysis_id', analysisId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data || []) as FileRow[]
}

function isPdfFile(file: { mime_type: string | null; file_name: string }): boolean {
  const mime = (file.mime_type || '').toLowerCase()
  return mime.includes('pdf') || file.file_name.toLowerCase().endsWith('.pdf')
}

export async function runChunkStage(params: StageParams) {
  await markStageRunning(params.supabase, params.analysisId, 'chunk')
  await updateAnalysisStep(params.supabase, params.analysisId, {
    status: 'processing',
    processing_step: 'chunk',
    error_message: null,
  })

  try {
    const files = await loadFiles(params.supabase, params.analysisId)
    if (!files.length) throw new Error('No files uploaded')

    const fileIds = files.map((f) => f.id)
    await params.supabase
      .from('clash_gap_extracted_sheets')
      .delete()
      .in('analysis_file_id', fileIds)

    const maxPages = maxPagesPerRun()
    let pagesProcessed = 0
    let totalRendered = 0

    for (const file of files) {
      if (pagesProcessed >= maxPages) break
      const isPdf = isPdfFile(file)
      const isImage = isImageUpload(file.mime_type || '', file.file_name)
      if (!isPdf && !isImage) continue

      const buffer = await downloadClashGapFile(file.storage_path)
      const sha256 = sha256Buffer(buffer)

      if (isPdf) {
        const stageTimeout = pageStageTimeoutMs()
        await withPdfDocument(buffer, async (pdf) => {
          const totalPages = pdf.numPages
          const remaining = maxPages - pagesProcessed
          const pagesToProcess = Math.min(totalPages, remaining)

          await params.supabase
            .from('clash_gap_analysis_files')
            .update({ sha256, page_count: totalPages })
            .eq('id', file.id)

          for (let i = 0; i < pagesToProcess; i++) {
            let imagePath: string | null = clashGapImagePath({
              accountId: params.accountId,
              analysisId: params.analysisId,
              fileId: file.id,
              pageIndex: i,
            })
            try {
              const png = await withTimeout(
                renderPdfPageFromDoc(pdf, i),
                stageTimeout,
                `render page ${i + 1}`,
              )
              await uploadClashGapImage({ storagePath: imagePath, bytes: png })
            } catch (e) {
              console.error('[clash-gap chunk] render failed', file.file_name, i, e)
              imagePath = null
            }

            await params.supabase.from('clash_gap_extracted_sheets').insert({
              analysis_file_id: file.id,
              sheet_id: `Page-${i + 1}`,
              page_index: i,
              image_path: imagePath,
            })

            pagesProcessed++
            totalRendered++
            if (i % 3 === 0) {
              await markStageProgress(params.supabase, params.analysisId, 'chunk', {
                processed: totalRendered,
                detail: `${file.file_name} · page ${i + 1}/${pagesToProcess}`,
              })
            }
          }
        })
      } else {
        await params.supabase
          .from('clash_gap_analysis_files')
          .update({ sha256, page_count: 1 })
          .eq('id', file.id)

        await params.supabase.from('clash_gap_extracted_sheets').insert({
          analysis_file_id: file.id,
          sheet_id: 'Page-1',
          page_index: 0,
          image_path: file.storage_path,
        })
        pagesProcessed++
        totalRendered++
      }
    }

    await markStageCompleted(params.supabase, params.analysisId, 'chunk', {
      processed: totalRendered,
      total: totalRendered,
      detail: `${totalRendered} page image(s)`,
    })
    return { pages: totalRendered }
  } catch (error) {
    const message = formatClashGapError(error)
    await markStageFailed(params.supabase, params.analysisId, 'chunk', message)
    await updateAnalysisStep(params.supabase, params.analysisId, {
      status: 'failed',
      error_message: message,
    })
    throw error
  }
}

type OcrSheetRow = {
  id: string
  page_index: number
  image_path: string | null
  mime_type: string | null
  file_name: string
}

async function loadSheetsWithFiles(supabase: any, analysisId: string): Promise<OcrSheetRow[]> {
  const files = await loadFiles(supabase, analysisId)
  if (!files.length) return []
  const fileById = new Map(files.map((f) => [f.id, f]))
  const { data, error } = await supabase
    .from('clash_gap_extracted_sheets')
    .select('id, analysis_file_id, page_index, image_path, ocr_text')
    .in(
      'analysis_file_id',
      files.map((f) => f.id),
    )
    .order('analysis_file_id', { ascending: true })
    .order('page_index', { ascending: true })
  if (error) throw new Error(error.message)
  return (data || []).map((row: any) => {
    const file = fileById.get(row.analysis_file_id)
    return {
      id: row.id,
      page_index: row.page_index,
      image_path: row.image_path,
      mime_type: file?.mime_type ?? null,
      file_name: file?.file_name ?? 'document',
    }
  })
}

export async function runOcrStage(params: StageParams) {
  await markStageRunning(params.supabase, params.analysisId, 'ocr')
  await updateAnalysisStep(params.supabase, params.analysisId, {
    status: 'processing',
    processing_step: 'ocr',
    error_message: null,
  })

  try {
    const sheets = await loadSheetsWithFiles(params.supabase, params.analysisId)
    if (!sheets.length) throw new Error('No page images found — run the chunk stage first')

    let processed = 0
    await mapWithConcurrency(sheets, ocrConcurrency(), async (sheet) => {
      let text = ''
      if (sheet.image_path) {
        try {
          const bytes = await downloadClashGapFile(sheet.image_path)
          const isOriginalImage =
            !sheet.image_path.includes('/images/') &&
            isImageUpload(sheet.mime_type || '', sheet.file_name)
          const mime = isOriginalImage ? sheet.mime_type || 'image/png' : 'image/png'
          text = await ocrImageWithOpenAI(bytes, mime, sheet.file_name, sheet.page_index)
        } catch (e) {
          console.error('[clash-gap ocr] failed for sheet', sheet.id, e)
        }
      }
      await params.supabase
        .from('clash_gap_extracted_sheets')
        .update({ ocr_text: text })
        .eq('id', sheet.id)
      processed++
      if (processed % 3 === 0) {
        await markStageProgress(params.supabase, params.analysisId, 'ocr', {
          processed,
          total: sheets.length,
          detail: `page ${processed}/${sheets.length}`,
        })
      }
    })

    await markStageCompleted(params.supabase, params.analysisId, 'ocr', {
      processed: sheets.length,
      total: sheets.length,
    })
    return { pages: sheets.length }
  } catch (error) {
    const message = formatClashGapError(error)
    await markStageFailed(params.supabase, params.analysisId, 'ocr', message)
    await updateAnalysisStep(params.supabase, params.analysisId, {
      status: 'failed',
      error_message: message,
    })
    throw error
  }
}

export async function runMergeStage(params: StageParams) {
  await markStageRunning(params.supabase, params.analysisId, 'merge')
  await updateAnalysisStep(params.supabase, params.analysisId, {
    status: 'processing',
    processing_step: 'merge',
    error_message: null,
  })

  try {
    const files = await loadFiles(params.supabase, params.analysisId)
    const fileIds = files.map((f) => f.id)
    if (!fileIds.length) throw new Error('No files uploaded')

    const { data: sheetRows, error } = await params.supabase
      .from('clash_gap_extracted_sheets')
      .select('id, analysis_file_id, page_index, ocr_text')
      .in('analysis_file_id', fileIds)
      .order('analysis_file_id', { ascending: true })
      .order('page_index', { ascending: true })
    if (error) throw new Error(error.message)

    const sheets = (sheetRows || []) as Array<{
      id: string
      analysis_file_id: string
      page_index: number
      ocr_text: string | null
    }>
    if (!sheets.length) throw new Error('No OCR results found — run the OCR stage first')

    const fileOrdinal = new Map(fileIds.map((fileId, index) => [fileId, index + 1]))
    const multipleFiles = fileIds.length > 1

    let processed = 0
    await mapWithConcurrency(sheets, 8, async (sheet) => {
      const merged = mergePageText({
        pageIndex: sheet.page_index,
        embedded: { blocks: [], fullText: '' },
        ocr: { text: sheet.ocr_text || '' },
      })
      const pageLabel = multipleFiles
        ? `Doc${fileOrdinal.get(sheet.analysis_file_id) ?? '?'}-Page-${sheet.page_index + 1}`
        : `Page-${sheet.page_index + 1}`
      const sheetId = detectSheetId(merged.rawText) || pageLabel
      await params.supabase
        .from('clash_gap_extracted_sheets')
        .update({ raw_text: merged.rawText, sheet_id: sheetId })
        .eq('id', sheet.id)
      processed++
    })

    await markStageCompleted(params.supabase, params.analysisId, 'merge', {
      processed,
      total: sheets.length,
    })
    return { pages: sheets.length }
  } catch (error) {
    const message = formatClashGapError(error)
    await markStageFailed(params.supabase, params.analysisId, 'merge', message)
    await updateAnalysisStep(params.supabase, params.analysisId, {
      status: 'failed',
      error_message: message,
    })
    throw error
  }
}
