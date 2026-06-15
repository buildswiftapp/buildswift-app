import pLimit from 'p-limit'
import { config } from '../config.js'
import { extractEmbeddedTextFromPage } from '../lib/embedded-text.js'
import { ocrImageWithVisionTiles } from '../lib/image-tiles.js'
import {
  minTextLengthForKind,
  normalizeFileRole,
  ocrDpiForKind,
  resolvePageKind,
  shouldRunTiledEscalation,
  type PageKind,
} from '../lib/page-router.js'
import { renderPageToJpeg } from '../lib/pdf.js'
import { PdfCache } from '../lib/pdf-cache.js'
import { mergePageTexts, ocrQualityPasses, isUsableEmbeddedText } from '../lib/text-quality.js'
import { ocrImageWithVision } from '../lib/vision-ocr.js'
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
  file_role: string
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

function isPdfFile(file: { mime_type: string | null; file_name: string }): boolean {
  const mime = (file.mime_type || '').toLowerCase()
  return mime.includes('pdf') || file.file_name.toLowerCase().endsWith('.pdf')
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
    .select('id, storage_path, file_name, mime_type, file_role')
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

async function loadPageImage(
  sheet: SheetTodo,
  file: FileRow | undefined,
  pdfCache: PdfCache | undefined,
  dpi: number,
): Promise<Buffer> {
  if (pdfCache && file && isPdfFile(file)) {
    try {
      const { doc } = await pdfCache.get(file.id, file.storage_path)
      return await renderPageToJpeg(doc, sheet.page_index, dpi, {
        maxWidth: config.ocrMaxImageWidth,
        jpegQuality: 98,
      })
    } catch (e) {
      console.warn('[clash-gap ocr] render failed, using chunk image', sheet.id, e)
    }
  }
  return downloadFromStorage(sheet.image_path)
}

async function runVisionOnPage(
  sheet: SheetTodo,
  file: FileRow | undefined,
  pdfCache: PdfCache | undefined,
  kind: PageKind,
): Promise<string> {
  const dpi = ocrDpiForKind(kind)
  const buffer = await loadPageImage(sheet, file, pdfCache, dpi)
  return normalizeWhitespace(await ocrImageWithVision(buffer))
}

async function ocrPage(params: {
  sheet: SheetTodo
  file: FileRow
  pdfCache?: PdfCache
  embeddedText: string
}): Promise<string> {
  const { sheet, file, pdfCache, embeddedText } = params
  const fileRole = normalizeFileRole(file.file_role)
  const kind = resolvePageKind(fileRole, embeddedText)
  const minLen = minTextLengthForKind(kind)

  if (kind === 'TEXT') {
    return normalizeWhitespace(embeddedText)
  }

  let merged = normalizeWhitespace(embeddedText)

  try {
    const visionText = await runVisionOnPage(sheet, file, pdfCache, kind)
    merged = normalizeWhitespace(mergePageTexts(merged, visionText))
  } catch (e) {
    console.warn('[clash-gap ocr] Vision OCR failed', sheet.id, kind, e)
  }

  if (!ocrQualityPasses(merged, minLen) && shouldRunTiledEscalation(kind)) {
    try {
      const dpi = ocrDpiForKind(kind)
      const buffer = await loadPageImage(sheet, file, pdfCache, dpi)
      const tiled = normalizeWhitespace(
        await ocrImageWithVisionTiles(buffer, config.ocrTileWorkers),
      )
      if (tiled) merged = normalizeWhitespace(mergePageTexts(merged, tiled))
    } catch (e) {
      console.warn('[clash-gap ocr] tiled Vision OCR failed', sheet.id, e)
    }
  }

  if (merged) return merged
  if (isUsableEmbeddedText(embeddedText)) return normalizeWhitespace(embeddedText)
  return ''
}

async function ocrPdfFile(
  file: FileRow,
  sheets: SheetTodo[],
  pdfCache: PdfCache,
): Promise<Map<string, string>> {
  const results = new Map<string, string>()
  const { doc } = await pdfCache.get(file.id, file.storage_path)

  const pageLimit = pLimit(config.ocrPageWorkers)
  await Promise.all(
    sheets.map((sheet) =>
      pageLimit(async () => {
        const embedded = await extractEmbeddedTextFromPage(doc, sheet.page_index)
        results.set(
          sheet.id,
          await ocrPage({
            sheet,
            file,
            pdfCache,
            embeddedText: embedded.fullText.trim(),
          }),
        )
      }),
    ),
  )

  return results
}

async function ocrImageSheets(
  sheets: SheetTodo[],
  file: FileRow,
  pdfCache?: PdfCache,
): Promise<Map<string, string>> {
  const results = new Map<string, string>()
  const pageLimit = pLimit(config.ocrPageWorkers)
  await Promise.all(
    sheets.map((sheet) =>
      pageLimit(async () => {
        results.set(
          sheet.id,
          await ocrPage({
            sheet,
            file,
            pdfCache,
            embeddedText: '',
          }),
        )
      }),
    ),
  )
  return results
}

export async function runOcrJob(analysisId: string): Promise<void> {
  const pdfCache = new PdfCache()

  try {
    const { data: analysisFiles, error: analysisFilesError } = await sb()
      .from('clash_gap_analysis_files')
      .select('id')
      .eq('analysis_id', analysisId)
    if (analysisFilesError) throw new Error(analysisFilesError.message)
    const analysisFileIds = (analysisFiles ?? []).map((f: { id: string }) => f.id)
    if (analysisFileIds.length) {
      const { error: resetError } = await sb()
        .from('clash_gap_extracted_sheets')
        .update({ ocr_text: null, raw_text: null })
        .in('analysis_file_id', analysisFileIds)
      if (resetError) throw new Error(resetError.message)
    }

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
          if (!file) {
            failedPages += sheets.length
            return
          }

          try {
            const texts =
              isPdfFile(file)
                ? await ocrPdfFile(file, sheets, pdfCache)
                : await ocrImageSheets(sheets, file, pdfCache)

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
            let recovered = false
            if (isPdfFile(file)) {
              try {
                const { doc } = await pdfCache.get(file.id, file.storage_path)
                for (const sheet of sheets) {
                  const embedded = await extractEmbeddedTextFromPage(doc, sheet.page_index)
                  const fallback = isUsableEmbeddedText(embedded.fullText)
                    ? normalizeWhitespace(embedded.fullText)
                    : ''
                  await sb()
                    .from('clash_gap_extracted_sheets')
                    .update({ ocr_text: fallback })
                    .eq('id', sheet.id)
                }
                recovered = true
              } catch {
              }
            }
            if (!recovered) {
              for (const sheet of sheets) {
                await sb()
                  .from('clash_gap_extracted_sheets')
                  .update({ ocr_text: '' })
                  .eq('id', sheet.id)
              }
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
        ? `${totalWithImages} page(s) read via Google Vision OCR (${failedPages} with errors).`
        : `${totalWithImages} page(s) read via Google Vision OCR.`

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
