import JSZip from 'jszip'
import { badRequest, notFound, serverError, unauthorized } from '@/lib/server/api-response'
import { getAuthContext } from '@/lib/server/auth'
import { getAnalysisForAccount } from '@/lib/server/clash-gap/access'
import { fetchAllRows } from '@/lib/server/clash-gap/fetch-all-rows'
import { downloadClashGapFile } from '@/lib/server/clash-gap/storage'
import { renderTextPdf } from '@/lib/server/clash-gap/text-pdf'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'

export const maxDuration = 300

type Params = { params: Promise<{ id: string; kind: string }> }

const KINDS = new Set(['images', 'ocr', 'merged', 'issues'])

type SheetRow = {
  id: string
  page_index: number
  image_path: string | null
  ocr_text: string | null
  raw_text: string | null
  sheet_id: string | null
  file_name: string
  file_role: string
}

function fileBase(id: string) {
  return `clash-gap-${id.slice(0, 8)}`
}

function attachment(filename: string): Record<string, string> {
  return { 'Content-Disposition': `attachment; filename="${filename}"` }
}

function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

async function loadSheets(supabase: any, analysisId: string): Promise<SheetRow[]> {
  const { data: files } = await supabase
    .from('clash_gap_analysis_files')
    .select('id, file_name, file_role')
    .eq('analysis_id', analysisId)
    .order('created_at', { ascending: true })
  const fileById = new Map((files || []).map((f: any) => [f.id, f]))
  if (!files?.length) return []
  const data = await fetchAllRows<any>((from, to) =>
    supabase
      .from('clash_gap_extracted_sheets')
      .select('id, analysis_file_id, page_index, image_path, ocr_text, raw_text, sheet_id')
      .in(
        'analysis_file_id',
        files.map((f: any) => f.id),
      )
      .order('analysis_file_id', { ascending: true })
      .order('page_index', { ascending: true })
      .range(from, to),
  )
  return data.map((row: any) => {
    const file = fileById.get(row.analysis_file_id) as any
    return {
      id: row.id,
      page_index: row.page_index,
      image_path: row.image_path,
      ocr_text: row.ocr_text,
      raw_text: row.raw_text,
      sheet_id: row.sheet_id,
      file_name: file?.file_name ?? 'document',
      file_role: file?.file_role ?? 'plans',
    }
  })
}

export async function GET(req: Request, { params }: Params) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) return badRequest('Account context is unavailable.')

  const { id, kind } = await params
  if (!KINDS.has(kind)) return badRequest('Unknown artifact')

  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')

  const analysis = await getAnalysisForAccount(supabase, id, auth.accountId)
  if (!analysis) return notFound('Analysis not found')

  const base = fileBase(id)
  const url = new URL(req.url)
  const format = (url.searchParams.get('format') || '').toLowerCase()

  if (kind === 'issues') {
    const { data: issues } = await supabase
      .from('clash_gap_issues')
      .select('*')
      .eq('analysis_id', id)
      .order('created_at', { ascending: true })
    const rows = issues || []
    if (format === 'json') {
      return new Response(JSON.stringify(rows, null, 2), {
        headers: { 'Content-Type': 'application/json', ...attachment(`${base}-issues.json`) },
      })
    }
    const header = [
      'type',
      'title',
      'severity',
      'sheet_reference',
      'location',
      'confidence_score',
      'suggested_action',
      'description',
    ]
    const lines = [header.join(',')]
    for (const r of rows as any[]) {
      lines.push(
        [
          r.type,
          r.title,
          r.severity,
          r.sheet_reference,
          r.location,
          r.confidence_score,
          r.suggested_action,
          r.description,
        ]
          .map(csvCell)
          .join(','),
      )
    }
    return new Response(lines.join('\n'), {
      headers: { 'Content-Type': 'text/csv', ...attachment(`${base}-issues.csv`) },
    })
  }

  const sheets = await loadSheets(supabase, id)

  if (kind === 'images') {
    const zip = new JSZip()
    let added = 0
    for (const sheet of sheets) {
      if (!sheet.image_path) continue
      try {
        const bytes = await downloadClashGapFile(sheet.image_path)
        const safe = sheet.file_name.replace(/[^\w.\-]+/g, '_')
        const page = String(sheet.page_index + 1).padStart(4, '0')
        const ext = (sheet.image_path.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '') || 'jpg'
        zip.file(`${safe}/page-${page}.${ext}`, bytes)
        added++
      } catch {
      }
    }
    if (!added) return badRequest('No page images are available yet. Run the chunk stage first.')
    const buffer = await zip.generateAsync({ type: 'nodebuffer' })
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/zip',
        ...attachment(`${base}-page-images.zip`),
      },
    })
  }

  if (kind === 'ocr' || kind === 'merged') {
    const pick = (s: SheetRow) => (kind === 'ocr' ? s.ocr_text : s.raw_text) || ''
    if (format === 'json') {
      const payload = sheets.map((s) => ({
        file: s.file_name,
        role: s.file_role,
        page: s.page_index + 1,
        sheet_id: s.sheet_id,
        text: pick(s),
      }))
      return new Response(JSON.stringify(payload, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          ...attachment(`${base}-${kind}.json`),
        },
      })
    }

    if (kind === 'ocr') {
      const zip = new JSZip()
      let added = 0
      for (const s of sheets) {
        const safe = s.file_name.replace(/[^\w.\-]+/g, '_')
        const page = String(s.page_index + 1).padStart(4, '0')
        const pdf = await renderTextPdf({
          title: s.file_name,
          subtitle: `Page ${s.page_index + 1}${s.sheet_id ? ` · ${s.sheet_id}` : ''}`,
          sections: [{ body: pick(s) }],
        })
        zip.file(`${safe}/page-${page}.pdf`, pdf)
        added++
      }
      if (!added) return badRequest('No OCR results are available yet. Run the OCR stage first.')
      const buffer = await zip.generateAsync({ type: 'nodebuffer' })
      return new Response(new Uint8Array(buffer), {
        headers: { 'Content-Type': 'application/zip', ...attachment(`${base}-ocr-pages.zip`) },
      })
    }

    if (!sheets.length) return badRequest('No merged text is available yet. Run the Merge stage first.')
    const sections = sheets.map((s) => ({
      heading: `${s.file_name} — ${s.sheet_id || `Page ${s.page_index + 1}`}`,
      body: pick(s),
    }))
    const pdf = await renderTextPdf({
      title: 'Merged Document Text',
      subtitle: `${sheets.length} page${sheets.length === 1 ? '' : 's'}`,
      sections,
    })
    return new Response(new Uint8Array(pdf), {
      headers: { 'Content-Type': 'application/pdf', ...attachment(`${base}-merged.pdf`) },
    })
  }

  return badRequest('Unknown artifact')
}
