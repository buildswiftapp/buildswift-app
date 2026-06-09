import pLimit from 'p-limit'
import { config } from '../config.js'
import { processImageWithDocumentAi, processPdfWithDocumentAi } from '../lib/document-ai.js'
import { extractEmbeddedTextFromPage } from '../lib/embedded-text.js'
import { mergePageText } from '../lib/merge-text.js'
import { PdfCache } from '../lib/pdf-cache.js'
import { markStageCompleted, setProgress, setStage, updateAnalysisStep } from '../lib/stages.js'
import { fetchAllRows } from '../lib/storage.js'
import { sb } from '../supabase.js'

type SheetTodo = {
  id: string
  page_index: number
  image_path: string
  analysis_file_id: string
}

type FileRow = {
  id: string
  storage_path: string
  file_name: string
  mime_type: string | null
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

function isPdfFile(file: { mime_type: string | null; file_name: string }): boolean {
  const mime = (file.mime_type || '').toLowerCase()
  return mime.includes('pdf') || file.file_name.toLowerCase().endsWith('.pdf')
}

function imageMimeType(fileName: string, buffer: Buffer): string {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg'
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png'
  if (/\.jpe?g$/i.test(fileName)) return 'image/jpeg'
  return 'image/png'
}

function groupByFile(todo: SheetTodo[]): Map<string, SheetTodo[]> {
  const groups = new Map<string, SheetTodo[]>()
  for (const sheet of todo) {
    const list = groups.get(sheet.analysis_file_id) ?? []
    list.push(sheet)
    groups.set(sheet.analysis_file_id, list)
  }
  return groups
}

async function loadFiles(analysisId: string): Promise<Map<string, FileRow>> {
  const { data, error } = await sb()
    .from('clash_gap_analysis_files')
    .select('id, storage_path, file_name, mime_type')
    .eq('analysis_id', analysisId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return new Map((data ?? []).map((f: FileRow) => [f.id, f]))
}

async function countSheetsWithImages(analysisId: string): Promise<{ total: number; todo: SheetTodo[] }> {
  const { data: files, error: filesError } = await sb()
    .from('clash_gap_analysis_files')
    .select('id')
    .eq('analysis_id', analysisId)
  if (filesError) throw new Error(filesError.message)
  const fileIds = (files ?? []).map((f: { id: string }) => f.id)
  if (!fileIds.length) return { total: 0, todo: [] }

  const rows = await fetchAllRows<{
    id: string
    analysis_file_id: string
    page_index: number
    image_path: string | null
    ocr_text: string | null
  }>(async (from, to) =>
    sb()
      .from('clash_gap_extracted_sheets')
      .select('id, analysis_file_id, page_index, image_path, ocr_text')
      .in('analysis_file_id', fileIds)
      .order('page_index', { ascending: true })
      .range(from, to),
  )

  const withImages = rows.filter((r) => r.image_path)
  const todo = withImages
    .filter((r) => r.ocr_text == null)
    .map((r) => ({
      id: r.id,
      page_index: r.page_index,
      image_path: r.image_path!,
      analysis_file_id: r.analysis_file_id,
    }))

  return { total: withImages.length, todo }
}

async function mergeSheets(analysisId: string): Promise<void> {
  const { data: files, error: filesError } = await sb()
    .from('clash_gap_analysis_files')
    .select('id')
    .eq('analysis_id', analysisId)
    .order('created_at', { ascending: true })
  if (filesError) throw new Error(filesError.message)
  const fileIds = (files ?? []).map((f: { id: string }) => f.id)
  if (!fileIds.length) return

  const sheets = await fetchAllRows<{
    id: string
    analysis_file_id: string
    page_index: number
    ocr_text: string | null
  }>(async (from, to) =>
    sb()
      .from('clash_gap_extracted_sheets')
      .select('id, analysis_file_id, page_index, ocr_text')
      .in('analysis_file_id', fileIds)
      .order('analysis_file_id', { ascending: true })
      .order('page_index', { ascending: true })
      .range(from, to),
  )

  const fileOrdinal = new Map(fileIds.map((id, index) => [id, index + 1]))
  const multipleFiles = fileIds.length > 1

  for (const sheet of sheets) {
    const rawText = normalizeWhitespace(sheet.ocr_text || '')
    const pageLabel = multipleFiles
      ? `Doc${fileOrdinal.get(sheet.analysis_file_id) ?? '?'}-Page-${sheet.page_index + 1}`
      : `Page-${sheet.page_index + 1}`
    const { error } = await sb()
      .from('clash_gap_extracted_sheets')
      .update({ raw_text: rawText, sheet_id: pageLabel })
      .eq('id', sheet.id)
    if (error) throw new Error(error.message)
  }
}

async function downloadFromStorage(path: string): Promise<Buffer> {
  const { data: blob, error } = await sb().storage.from(config.storageBucket).download(path)
  if (error || !blob) throw new Error(error?.message || `Download failed: ${path}`)
  return Buffer.from(await blob.arrayBuffer())
}

async function ocrPdfFile(
  file: FileRow,
  sheets: SheetTodo[],
  pdfCache: PdfCache,
): Promise<Map<string, string>> {
  const results = new Map<string, string>()
  const { doc, buffer } = await pdfCache.get(file.id, file.storage_path)

  const embeddedByPage = new Map<number, Awaited<ReturnType<typeof extractEmbeddedTextFromPage>>>()
  for (const sheet of sheets) {
    embeddedByPage.set(sheet.page_index, await extractEmbeddedTextFromPage(doc, sheet.page_index))
  }

  const needsDocumentAi: SheetTodo[] = []
  for (const sheet of sheets) {
    const embedded = embeddedByPage.get(sheet.page_index)!
    if (embedded.fullText.trim().length >= config.ocrEmbeddedMinLen) {
      results.set(sheet.id, normalizeWhitespace(embedded.fullText))
    } else {
      needsDocumentAi.push(sheet)
    }
  }

  if (!needsDocumentAi.length) return results

  const pageTexts = await processPdfWithDocumentAi(buffer)
  for (const sheet of needsDocumentAi) {
    const embedded = embeddedByPage.get(sheet.page_index)!
    const docAiText = pageTexts.get(sheet.page_index) ?? ''
    results.set(
      sheet.id,
      mergePageText({
        pageIndex: sheet.page_index,
        embedded,
        ocr: { text: docAiText },
      }).rawText,
    )
  }

  return results
}

async function ocrImageSheets(sheets: SheetTodo[], file?: FileRow): Promise<Map<string, string>> {
  const results = new Map<string, string>()
  for (const sheet of sheets) {
    const buffer = await downloadFromStorage(sheet.image_path)
    const mime = imageMimeType(file?.file_name ?? sheet.image_path, buffer)
    const text = await processImageWithDocumentAi(buffer, mime)
    results.set(sheet.id, normalizeWhitespace(text))
  }
  return results
}

export async function runOcrJob(analysisId: string): Promise<void> {
  await setStage(analysisId, 'ocr', 'running')
  await updateAnalysisStep(analysisId, {
    status: 'processing',
    processing_step: 'ocr',
    error_message: null,
  })

  const pdfCache = new PdfCache()

  try {
    const files = await loadFiles(analysisId)
    const { total: totalWithImages, todo } = await countSheetsWithImages(analysisId)
    if (!totalWithImages) throw new Error('No page images found — run the chunk stage first')

    let processed = totalWithImages - todo.length
    let failedPages = 0
    await setProgress(analysisId, 'ocr', processed, totalWithImages, `page ${processed}/${totalWithImages}`)

    const limit = pLimit(config.ocrWorkers)
    let sinceProgress = 0

    await Promise.all(
      [...groupByFile(todo).entries()].map(([fileId, sheets]) =>
        limit(async () => {
          const file = files.get(fileId)
          try {
            const texts =
              file && isPdfFile(file)
                ? await ocrPdfFile(file, sheets, pdfCache)
                : await ocrImageSheets(sheets, file)

            for (const sheet of sheets) {
              const { error } = await sb()
                .from('clash_gap_extracted_sheets')
                .update({ ocr_text: texts.get(sheet.id) ?? '' })
                .eq('id', sheet.id)
              if (error) throw new Error(error.message)
            }
          } catch (e) {
            failedPages += sheets.length
            const message = e instanceof Error ? e.message : String(e)
            console.error('[clash-gap ocr] file failed', fileId, message)
            for (const sheet of sheets) {
              await sb()
                .from('clash_gap_extracted_sheets')
                .update({ ocr_text: '' })
                .eq('id', sheet.id)
            }
          }

          processed += sheets.length
          sinceProgress += sheets.length
          if (sinceProgress >= config.ocrProgressEvery) {
            sinceProgress = 0
            await setProgress(analysisId, 'ocr', processed, totalWithImages, `page ${processed}/${totalWithImages}`)
          }
        }),
      ),
    )

    await setProgress(analysisId, 'ocr', totalWithImages, totalWithImages, 'Merging text per document…')
    await mergeSheets(analysisId)

    const detail =
      failedPages > 0
        ? `${totalWithImages} page(s) read via Document AI (${failedPages} with errors).`
        : `${totalWithImages} page(s) read via Document AI.`

    await markStageCompleted(analysisId, 'ocr', {
      processed: totalWithImages,
      total: totalWithImages,
      detail,
    })
    await updateAnalysisStep(analysisId, {
      status: 'processing',
      processing_step: 'ocr',
      error_message: null,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await setStage(analysisId, 'ocr', 'failed', message)
    await updateAnalysisStep(analysisId, { status: 'failed', error_message: message })
    throw e
  } finally {
    await pdfCache.destroyAll()
  }
}
