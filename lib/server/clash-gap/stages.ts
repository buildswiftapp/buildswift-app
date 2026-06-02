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
import {
  getPdfPageCount,
  renderPdfPageFromDoc,
  withPdfDocument,
} from '@/lib/server/clash-gap/render-pdf-page'
import { mergePageText } from '@/lib/server/clash-gap/merge-ocr'
import { downscaleImageForOcr } from '@/lib/server/clash-gap/ocr-image'
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
  page_count: number | null
}

// Overall ceiling on pages rendered in a single chunk run (across every uploaded
// file). Guards the serverless time budget. Raised above the per-file cap so a
// large plan set never starves the spec file of pages.
function maxPagesPerRun(): number {
  const n = Number(process.env.CLASH_GAP_MAX_PAGES_PER_RUN || 120)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 120
}

// Per-file page cap. Each uploaded document gets its own share of pages so that
// plans and specs are both represented even when one document is very large.
function maxPagesPerFile(): number {
  const n = Number(process.env.CLASH_GAP_MAX_PAGES_PER_FILE || 40)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 40
}

function ocrConcurrency(): number {
  const n = Number(process.env.CLASH_GAP_OCR_CONCURRENCY || 8)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 8
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
    .select('id, storage_path, file_name, mime_type, page_count')
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

    const overallCap = maxPagesPerRun()
    const perFileCap = maxPagesPerFile()
    let pagesProcessed = 0
    let totalRendered = 0
    let skippedPages = 0
    let skippedFiles = 0

    for (const file of files) {
      const isPdf = isPdfFile(file)
      const isImage = isImageUpload(file.mime_type || '', file.file_name)
      if (!isPdf && !isImage) continue

      const overallRemaining = overallCap - pagesProcessed
      if (overallRemaining <= 0) {
        // Overall run ceiling reached — this whole file is skipped.
        skippedFiles++
        skippedPages += isImage ? 1 : Math.max(0, file.page_count ?? 0)
        continue
      }

      const buffer = await downloadClashGapFile(file.storage_path)
      const sha256 = sha256Buffer(buffer)

      if (isPdf) {
        const stageTimeout = pageStageTimeoutMs()
        const totalPages = await getPdfPageCount(buffer)
        await withPdfDocument(buffer, async (pdf) => {
          const availablePages = Math.min(totalPages, pdf.numPages)
          const pagesToProcess = Math.min(availablePages, perFileCap, overallRemaining)
          skippedPages += Math.max(0, availablePages - pagesToProcess)

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

    const detailParts = [`${totalRendered} page image(s)`]
    if (skippedPages > 0) {
      const fileNote = skippedFiles > 0 ? `, ${skippedFiles} file(s) not reached` : ''
      detailParts.push(
        `${skippedPages} page(s) skipped — limit ${perFileCap}/file, ${overallCap}/run${fileNote}`,
      )
    }
    await markStageCompleted(params.supabase, params.analysisId, 'chunk', {
      processed: totalRendered,
      total: totalRendered,
      detail: detailParts.join(' · '),
    })
    return { pages: totalRendered, skippedPages }
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
    let failedPages = 0
    let emptyPages = 0
    await mapWithConcurrency(sheets, ocrConcurrency(), async (sheet) => {
      let text = ''
      if (sheet.image_path) {
        try {
          const bytes = await downloadClashGapFile(sheet.image_path)
          const isOriginalImage =
            !sheet.image_path.includes('/images/') &&
            isImageUpload(sheet.mime_type || '', sheet.file_name)
          const sourceMime = isOriginalImage ? sheet.mime_type || 'image/png' : 'image/png'
          const ocr = await downscaleImageForOcr(bytes, sourceMime)
          text = await ocrImageWithOpenAI(ocr.bytes, ocr.mime, sheet.file_name, sheet.page_index)
          if (!text.trim()) emptyPages++
        } catch (e) {
          failedPages++
          console.error('[clash-gap ocr] failed for sheet', sheet.id, e)
        }
      } else {
        // No rendered image for this page (chunk could not render it).
        failedPages++
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

    await markStageProgress(params.supabase, params.analysisId, 'ocr', {
      processed: sheets.length,
      total: sheets.length,
      detail: 'Merging text per document…',
    })
    await mergeSheets(params.supabase, params.analysisId)

    const unreadable = failedPages + emptyPages
    const detail =
      unreadable > 0
        ? `${sheets.length} page(s) read · ${unreadable} returned no text`
        : undefined
    await markStageCompleted(params.supabase, params.analysisId, 'ocr', {
      processed: sheets.length,
      total: sheets.length,
      detail,
    })
    return { pages: sheets.length, failedPages, emptyPages }
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

async function mergeSheets(supabase: any, analysisId: string): Promise<number> {
  const files = await loadFiles(supabase, analysisId)
  const fileIds = files.map((f) => f.id)
  if (!fileIds.length) throw new Error('No files uploaded')

  const { data: sheetRows, error } = await supabase
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
  if (!sheets.length) return 0

  const fileOrdinal = new Map(fileIds.map((fileId, index) => [fileId, index + 1]))
  const multipleFiles = fileIds.length > 1

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
    await supabase
      .from('clash_gap_extracted_sheets')
      .update({ raw_text: merged.rawText, sheet_id: sheetId })
      .eq('id', sheet.id)
  })

  return sheets.length
}
