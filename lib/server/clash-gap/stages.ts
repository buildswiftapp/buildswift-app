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
  renderPdfPageToImage,
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

function maxPagesPerRun(): number {
  const n = Number(process.env.CLASH_GAP_MAX_PAGES_PER_RUN || 10000)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 10000
}

function maxPagesPerFile(): number {
  const n = Number(process.env.CLASH_GAP_MAX_PAGES_PER_FILE || 5000)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 5000
}

function ocrConcurrency(): number {
  const n = Number(process.env.CLASH_GAP_OCR_CONCURRENCY || 10)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 10
}

function uploadConcurrency(): number {
  const n = Number(process.env.CLASH_GAP_UPLOAD_CONCURRENCY || 6)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 6
}

function pageStageTimeoutMs(): number {
  const n = Number(process.env.CLASH_GAP_PAGE_STAGE_TIMEOUT_MS || 120_000)
  return Number.isFinite(n) && n >= 1000 ? Math.floor(n) : 120_000
}

function ocrPageTimeoutMs(): number {
  const n = Number(process.env.CLASH_GAP_OCR_PAGE_TIMEOUT_MS || 160_000)
  return Number.isFinite(n) && n >= 1000 ? Math.floor(n) : 160_000
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

function createTaskPool(limit: number) {
  const safeLimit = Math.max(1, limit)
  const inFlight = new Set<Promise<void>>()
  return {
    async add(task: () => Promise<void>): Promise<void> {
      while (inFlight.size >= safeLimit) await Promise.race(inFlight)
      const p = task().finally(() => {
        inFlight.delete(p)
      })
      inFlight.add(p)
    },
    async drain(): Promise<void> {
      await Promise.allSettled([...inFlight])
    },
  }
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

type ExistingSheet = { id: string; image_path: string | null }

async function loadExistingSheets(
  supabase: any,
  fileIds: string[],
): Promise<Map<string, Map<number, ExistingSheet>>> {
  const byFile = new Map<string, Map<number, ExistingSheet>>()
  if (!fileIds.length) return byFile
  const { data } = await supabase
    .from('clash_gap_extracted_sheets')
    .select('id, analysis_file_id, page_index, image_path')
    .in('analysis_file_id', fileIds)
  for (const row of (data || []) as any[]) {
    let pages = byFile.get(row.analysis_file_id)
    if (!pages) {
      pages = new Map<number, ExistingSheet>()
      byFile.set(row.analysis_file_id, pages)
    }
    pages.set(row.page_index, { id: row.id, image_path: row.image_path })
  }
  return byFile
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

    const overallCap = maxPagesPerRun()
    const perFileCap = maxPagesPerFile()

    type FilePlan = { file: FileRow; isImage: boolean; pagesToProcess: number }
    const plans: FilePlan[] = []
    let plannedTotal = 0
    let pagesPlanned = 0
    let skippedPages = 0
    let skippedFiles = 0

    for (const file of files) {
      const isPdf = isPdfFile(file)
      const isImage = isImageUpload(file.mime_type || '', file.file_name)
      if (!isPdf && !isImage) continue

      const available = isImage
        ? 1
        : file.page_count && file.page_count > 0
          ? file.page_count
          : perFileCap
      const overallRemaining = overallCap - pagesPlanned
      if (overallRemaining <= 0) {
        skippedFiles++
        skippedPages += available
        continue
      }
      const pagesToProcess = Math.min(available, perFileCap, overallRemaining)
      skippedPages += Math.max(0, available - pagesToProcess)
      plannedTotal += pagesToProcess
      pagesPlanned += pagesToProcess
      plans.push({ file, isImage, pagesToProcess })
    }

    const existing = await loadExistingSheets(
      params.supabase,
      plans.map((p) => p.file.id),
    )

    const pool = createTaskPool(uploadConcurrency())
    const stageTimeout = pageStageTimeoutMs()
    let processed = 0
    let rendered = 0
    let failedPages = 0

    const bumpProgress = async (detail: string, force = false) => {
      if (!force && processed % 5 !== 0) return
      await markStageProgress(params.supabase, params.analysisId, 'chunk', {
        processed,
        total: plannedTotal,
        detail,
      })
    }

    for (const plan of plans) {
      const { file, isImage, pagesToProcess } = plan
      const existingForFile = existing.get(file.id) ?? new Map<number, ExistingSheet>()

      if (isImage) {
        const current = existingForFile.get(0)
        if (!current?.image_path) {
          await params.supabase
            .from('clash_gap_analysis_files')
            .update({ page_count: 1 })
            .eq('id', file.id)
          if (current) {
            await params.supabase
              .from('clash_gap_extracted_sheets')
              .update({ image_path: file.storage_path })
              .eq('id', current.id)
          } else {
            await params.supabase.from('clash_gap_extracted_sheets').insert({
              analysis_file_id: file.id,
              sheet_id: 'Page-1',
              page_index: 0,
              image_path: file.storage_path,
            })
          }
        }
        rendered++
        processed++
        await bumpProgress(`${file.file_name} · page 1/1`)
        continue
      }

      const pending: number[] = []
      for (let i = 0; i < pagesToProcess; i++) {
        if (existingForFile.get(i)?.image_path) {
          rendered++
          processed++
        } else {
          pending.push(i)
        }
      }
      await bumpProgress(`${file.file_name} · page ${processed}/${plannedTotal}`, true)

      if (!pending.length) continue

      const buffer = await downloadClashGapFile(file.storage_path)
      const sha256 = sha256Buffer(buffer)
      const totalPages = await getPdfPageCount(buffer)
      await params.supabase
        .from('clash_gap_analysis_files')
        .update({ sha256, page_count: totalPages })
        .eq('id', file.id)

      await withPdfDocument(buffer, async (pdf) => {
        for (const i of pending) {
          if (i + 1 > pdf.numPages) {
            failedPages++
            processed++
            continue
          }
          let image: { bytes: Buffer; ext: string; mime: string } | null = null
          try {
            image = await withTimeout(
              renderPdfPageToImage(pdf, i),
              stageTimeout,
              `render page ${i + 1}`,
            )
          } catch (e) {
            console.error('[clash-gap chunk] render failed', file.file_name, i, e)
          }

          const rowId = existingForFile.get(i)?.id ?? null
          const png = image
          await pool.add(async () => {
            let imagePath: string | null = null
            if (png) {
              const path = clashGapImagePath({
                accountId: params.accountId,
                analysisId: params.analysisId,
                fileId: file.id,
                pageIndex: i,
                ext: png.ext,
              })
              try {
                await uploadClashGapImage({
                  storagePath: path,
                  bytes: png.bytes,
                  contentType: png.mime,
                })
                imagePath = path
              } catch (e) {
                console.error('[clash-gap chunk] upload failed', file.file_name, i, e)
              }
            }

            if (rowId) {
              await params.supabase
                .from('clash_gap_extracted_sheets')
                .update({ image_path: imagePath })
                .eq('id', rowId)
            } else {
              await params.supabase.from('clash_gap_extracted_sheets').insert({
                analysis_file_id: file.id,
                sheet_id: `Page-${i + 1}`,
                page_index: i,
                image_path: imagePath,
              })
            }

            if (imagePath) rendered++
            else failedPages++
            processed++
            await bumpProgress(`${file.file_name} · page ${processed}/${plannedTotal}`)
          })
        }
      })

      await params.supabase
        .from('clash_gap_extracted_sheets')
        .delete()
        .eq('analysis_file_id', file.id)
        .gte('page_index', pagesToProcess)
    }

    await pool.drain()

    const detailParts = [`${rendered} page image(s)`]
    if (failedPages > 0) detailParts.push(`${failedPages} page(s) could not be rendered`)
    if (skippedPages > 0) {
      const fileNote = skippedFiles > 0 ? `, ${skippedFiles} file(s) not reached` : ''
      detailParts.push(
        `${skippedPages} page(s) skipped — limit ${perFileCap}/file, ${overallCap}/run${fileNote}`,
      )
    }
    await markStageCompleted(params.supabase, params.analysisId, 'chunk', {
      processed: plannedTotal,
      total: plannedTotal,
      detail: detailParts.join(' · '),
    })
    return { pages: rendered, skippedPages }
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
  ocr_text: string | null
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
      ocr_text: row.ocr_text ?? null,
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

    const todo = sheets.filter((s) => s.ocr_text == null)
    let processed = sheets.length - todo.length
    let failedPages = 0
    let emptyPages = 0
    await markStageProgress(params.supabase, params.analysisId, 'ocr', {
      processed,
      total: sheets.length,
      detail: `page ${processed}/${sheets.length}`,
    })
    await mapWithConcurrency(todo, ocrConcurrency(), async (sheet) => {
      let text: string | null = null
      if (sheet.image_path) {
        const imagePath = sheet.image_path
        try {
          text = await withTimeout(
            (async () => {
              const bytes = await downloadClashGapFile(imagePath)
              const isOriginalImage =
                !imagePath.includes('/images/') &&
                isImageUpload(sheet.mime_type || '', sheet.file_name)
              const sourceMime = isOriginalImage ? sheet.mime_type || 'image/png' : 'image/png'
              const ocr = await downscaleImageForOcr(bytes, sourceMime)
              return ocrImageWithOpenAI(ocr.bytes, ocr.mime, sheet.file_name, sheet.page_index)
            })(),
            ocrPageTimeoutMs(),
            `OCR page ${sheet.page_index + 1}`,
          )
          if (!text.trim()) emptyPages++
        } catch (e) {
          failedPages++
          console.error('[clash-gap ocr] failed for sheet', sheet.id, e)
        }
      } else {
        text = ''
        failedPages++
      }
      if (text != null) {
        await params.supabase
          .from('clash_gap_extracted_sheets')
          .update({ ocr_text: text })
          .eq('id', sheet.id)
      }
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

    await markStageCompleted(params.supabase, params.analysisId, 'ocr', {
      processed: sheets.length,
      total: sheets.length,
      detail: `${sheets.length} page(s) read.`,
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
