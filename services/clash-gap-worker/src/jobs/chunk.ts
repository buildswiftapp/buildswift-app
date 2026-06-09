import { createHash } from 'crypto'
import pLimit from 'p-limit'
import { config } from '../config.js'
import { openPdfDocument, renderPageToJpeg } from '../lib/pdf.js'
import {
  markStageCompleted,
  setFileChunkStatus,
  setProgress,
  setStage,
  updateAnalysisStep,
} from '../lib/stages.js'
import { clashGapImagePath, fetchAllRows } from '../lib/storage.js'
import { sb } from '../supabase.js'

export type ChunkJobInput = {
  analysisId: string
  fileId: string
  pdfStoragePath: string
  accountId: string
}

function sha256Buffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

async function loadCompletedPageIndexes(fileId: string): Promise<Set<number>> {
  const rows = await fetchAllRows<{ page_index: number }>(async (from, to) =>
    sb()
      .from('clash_gap_extracted_sheets')
      .select('page_index, image_path')
      .eq('analysis_file_id', fileId)
      .not('image_path', 'is', null)
      .range(from, to),
  )
  return new Set(rows.map((r) => r.page_index))
}

async function upsertSheetRow(params: {
  fileId: string
  pageIndex: number
  imagePath: string
  existingId?: string | null
}): Promise<void> {
  if (params.existingId) {
    const { error } = await sb()
      .from('clash_gap_extracted_sheets')
      .update({ image_path: params.imagePath })
      .eq('id', params.existingId)
    if (error) throw new Error(error.message)
    return
  }
  const { error } = await sb().from('clash_gap_extracted_sheets').insert({
    analysis_file_id: params.fileId,
    sheet_id: `Page-${params.pageIndex + 1}`,
    page_index: params.pageIndex,
    image_path: params.imagePath,
  })
  if (error) throw new Error(error.message)
}

async function loadExistingRowIds(fileId: string): Promise<Map<number, string>> {
  const rows = await fetchAllRows<{ id: string; page_index: number }>(async (from, to) =>
    sb()
      .from('clash_gap_extracted_sheets')
      .select('id, page_index')
      .eq('analysis_file_id', fileId)
      .range(from, to),
  )
  return new Map(rows.map((r) => [r.page_index, r.id]))
}

async function countRenderedPages(analysisId: string): Promise<{ processed: number; total: number }> {
  const { data: files, error } = await sb()
    .from('clash_gap_analysis_files')
    .select('id, mime_type, file_name, page_count')
    .eq('analysis_id', analysisId)
  if (error) throw new Error(error.message)
  if (!files?.length) return { processed: 0, total: 0 }

  let processed = 0
  let total = 0
  for (const file of files as Array<{
    id: string
    mime_type: string | null
    file_name: string
    page_count: number | null
  }>) {
    const mime = (file.mime_type || '').toLowerCase()
    const isImage =
      mime.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|tiff?)$/i.test(file.file_name)
    const isPdf = mime.includes('pdf') || file.file_name.toLowerCase().endsWith('.pdf')
    if (!isPdf && !isImage) continue

    const expected = isImage ? 1 : file.page_count ?? 0
    if (expected > 0) total += expected

    const { count } = await sb()
      .from('clash_gap_extracted_sheets')
      .select('id', { count: 'exact', head: true })
      .eq('analysis_file_id', file.id)
      .not('image_path', 'is', null)
    processed += count ?? 0
  }
  return { processed, total: total || processed }
}

async function tryCompleteChunkStage(analysisId: string): Promise<void> {
  const { data: files, error } = await sb()
    .from('clash_gap_analysis_files')
    .select('id, mime_type, file_name, page_count, chunk_status')
    .eq('analysis_id', analysisId)
  if (error) throw new Error(error.message)
  if (!files?.length) return

  for (const file of files as Array<{
    id: string
    mime_type: string | null
    file_name: string
    page_count: number | null
    chunk_status?: string | null
  }>) {
    const mime = (file.mime_type || '').toLowerCase()
    const isImage =
      mime.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|tiff?)$/i.test(file.file_name)
    const isPdf = mime.includes('pdf') || file.file_name.toLowerCase().endsWith('.pdf')
    if (!isPdf && !isImage) continue

    if (file.chunk_status === 'failed') {
      await setStage(analysisId, 'chunk', 'failed', 'One or more PDFs failed to chunk')
      await updateAnalysisStep(analysisId, {
        status: 'failed',
        error_message: 'One or more PDFs failed to chunk',
      })
      return
    }

    if (isPdf && file.chunk_status === 'running') return

    const expected = isImage ? 1 : file.page_count ?? 0
    if (!isImage && expected <= 0) return

    const { count } = await sb()
      .from('clash_gap_extracted_sheets')
      .select('id', { count: 'exact', head: true })
      .eq('analysis_file_id', file.id)
      .not('image_path', 'is', null)
    const have = count ?? 0
    if (have < expected) return
  }

  const { processed, total } = await countRenderedPages(analysisId)
  await markStageCompleted(analysisId, 'chunk', {
    processed,
    total: total || processed,
    detail: `${processed} page image(s)`,
  })
}

export async function runChunkJob(input: ChunkJobInput): Promise<void> {
  const { analysisId, fileId, pdfStoragePath, accountId } = input

  await setStage(analysisId, 'chunk', 'running')
  await setFileChunkStatus(fileId, 'running')
  await updateAnalysisStep(analysisId, {
    status: 'processing',
    processing_step: 'chunk',
    error_message: null,
  })

  try {
    const { data: blob, error: dlError } = await sb()
      .storage.from(config.storageBucket)
      .download(pdfStoragePath)
    if (dlError || !blob) throw new Error(dlError?.message || 'PDF download failed')
    const pdfBuffer = Buffer.from(await blob.arrayBuffer())

    const doc = await openPdfDocument(pdfBuffer)
    const totalPages = doc.numPages
    const pagesToProcess = Math.min(totalPages, config.maxPagesPerFile)

    await sb()
      .from('clash_gap_analysis_files')
      .update({ sha256: sha256Buffer(pdfBuffer), page_count: totalPages })
      .eq('id', fileId)

    const completed = await loadCompletedPageIndexes(fileId)
    const rowIds = await loadExistingRowIds(fileId)
    const pending: number[] = []
    for (let i = 0; i < pagesToProcess; i++) {
      if (!completed.has(i)) pending.push(i)
    }

    const baseline = await countRenderedPages(analysisId)
    let progressTotal = Math.max(baseline.total, baseline.processed + pending.length)
    let uploadedSinceBaseline = 0

    const bumpProgress = async (force = false) => {
      if (!force && uploadedSinceBaseline % config.chunkBatchSize !== 0) return
      await setProgress(
        analysisId,
        'chunk',
        baseline.processed + uploadedSinceBaseline,
        progressTotal,
        `page ${baseline.processed + uploadedSinceBaseline}/${progressTotal}`,
      )
    }

    await bumpProgress(true)

    const renderLimit = pLimit(config.chunkRenderWorkers)
    const uploadLimit = pLimit(config.chunkWorkers)

    await Promise.all(
      pending.map((pageIndex) =>
        renderLimit(async () => {
          const jpeg = await renderPageToJpeg(doc, pageIndex, config.chunkDpi)
          return { pageIndex, jpeg }
        }).then(({ pageIndex, jpeg }) =>
          uploadLimit(async () => {
            const storagePath = clashGapImagePath({
              accountId,
              analysisId,
              fileId,
              pageIndex,
              ext: 'jpg',
            })
            const { error: upError } = await sb()
              .storage.from(config.storageBucket)
              .upload(storagePath, jpeg, { contentType: 'image/jpeg', upsert: true })
            if (upError) throw new Error(upError.message)

            await upsertSheetRow({
              fileId,
              pageIndex,
              imagePath: storagePath,
              existingId: rowIds.get(pageIndex),
            })
            completed.add(pageIndex)
            uploadedSinceBaseline++
            await bumpProgress()
          }),
        ),
      ),
    )

    await sb()
      .from('clash_gap_extracted_sheets')
      .delete()
      .eq('analysis_file_id', fileId)
      .gte('page_index', pagesToProcess)

    await setFileChunkStatus(fileId, 'completed')

    const totals = await countRenderedPages(analysisId)
    await setProgress(
      analysisId,
      'chunk',
      totals.processed,
      Math.max(totals.total, totals.processed),
      `page ${totals.processed}/${Math.max(totals.total, totals.processed)}`,
    )
    await tryCompleteChunkStage(analysisId)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await setFileChunkStatus(fileId, 'failed', message)
    await setStage(analysisId, 'chunk', 'failed', message)
    await updateAnalysisStep(analysisId, { status: 'failed', error_message: message })
    throw e
  }
}
