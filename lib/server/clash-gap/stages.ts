import { formatClashGapError } from '@/lib/server/clash-gap/errors'
import { updateAnalysisStep } from '@/lib/server/clash-gap/access'
import {
  markStageCompleted,
  markStageFailed,
} from '@/lib/server/clash-gap/stage-state'
import { isImageUpload } from '@/lib/server/clash-gap/extract-pdf'
import {
  assertWorkerConfigured,
  triggerChunkStageForAnalysis,
  triggerOcrJob,
} from '@/lib/server/clash-gap/worker-client'
import { fetchAllRows } from '@/lib/server/clash-gap/fetch-all-rows'

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

type ExistingSheet = { id: string; image_path: string | null }

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

async function loadExistingSheets(
  supabase: any,
  fileIds: string[],
): Promise<Map<string, Map<number, ExistingSheet>>> {
  const byFile = new Map<string, Map<number, ExistingSheet>>()
  if (!fileIds.length) return byFile
  const data = await fetchAllRows<any>((from, to) =>
    supabase
      .from('clash_gap_extracted_sheets')
      .select('id, analysis_file_id, page_index, image_path')
      .in('analysis_file_id', fileIds)
      .order('analysis_file_id', { ascending: true })
      .order('page_index', { ascending: true })
      .range(from, to),
  )
  for (const row of data) {
    let pages = byFile.get(row.analysis_file_id)
    if (!pages) {
      pages = new Map<number, ExistingSheet>()
      byFile.set(row.analysis_file_id, pages)
    }
    pages.set(row.page_index, { id: row.id, image_path: row.image_path })
  }
  return byFile
}

/** Image uploads are single-page sheets; PDFs are chunked by the worker. */
async function registerImageUploads(supabase: any, files: FileRow[]): Promise<number> {
  let registered = 0
  for (const file of files) {
    if (!isImageUpload(file.mime_type || '', file.file_name)) continue

    const existing = await loadExistingSheets(supabase, [file.id])
    const existingForFile = existing.get(file.id) ?? new Map<number, ExistingSheet>()
    const current = existingForFile.get(0)
    if (current?.image_path) {
      registered++
      continue
    }

    await supabase.from('clash_gap_analysis_files').update({ page_count: 1 }).eq('id', file.id)
    if (current) {
      await supabase
        .from('clash_gap_extracted_sheets')
        .update({ image_path: file.storage_path })
        .eq('id', current.id)
    } else {
      await supabase.from('clash_gap_extracted_sheets').insert({
        analysis_file_id: file.id,
        sheet_id: 'Page-1',
        page_index: 0,
        image_path: file.storage_path,
      })
    }
    registered++
  }
  return registered
}

export async function runChunkStage(params: StageParams) {
  assertWorkerConfigured()

  try {
    const files = await loadFiles(params.supabase, params.analysisId)
    if (!files.length) throw new Error('No files uploaded')

    const processable = files.filter(
      (f) => isPdfFile(f) || isImageUpload(f.mime_type || '', f.file_name),
    )
    if (!processable.length) throw new Error('No PDF or image files to chunk')

    const imageCount = await registerImageUploads(params.supabase, processable)

    const { delegated, pdfJobs } = await triggerChunkStageForAnalysis({
      analysisId: params.analysisId,
      accountId: params.accountId,
      supabase: params.supabase,
    })

    if (delegated) {
      return { pages: imageCount, skippedPages: 0, delegated: true, pdfJobs }
    }

    const total = imageCount || processable.length
    await markStageCompleted(params.supabase, params.analysisId, 'chunk', {
      processed: total,
      total,
      detail: `${total} page image(s)`,
    })
    return { pages: total, skippedPages: 0, delegated: false, pdfJobs: 0 }
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

export async function runOcrStage(params: StageParams) {
  assertWorkerConfigured()

  try {
    await triggerOcrJob(params.analysisId)
    return { delegated: true }
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
