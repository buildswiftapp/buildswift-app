'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ChevronLeft,
  ChevronRight,
  FileWarning,
  Loader2,
  RotateCw,
  RefreshCw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { ProgressBar } from './progress-bar'

type SheetItem = {
  id: string
  pageIndex: number
  sheetId: string | null
  fileName: string
  fileRole: string
  imageUrl: string | null
  ocrText: string
  rawText: string
}

const ZOOM_MIN = 0.5
const ZOOM_MAX = 4
const ZOOM_STEP = 0.25

function pageLabel(s: SheetItem) {
  return `${s.sheetId || `Page ${s.pageIndex + 1}`} · ${s.fileName}`
}

function clampZoom(z: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100))
}

export function DetectionResultViewer(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  analysisId: string | null
}) {
  const { open, onOpenChange, analysisId } = props
  const [loading, setLoading] = useState(false)
  const [sheets, setSheets] = useState<SheetItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [index, setIndex] = useState(0)
  const [rotation, setRotation] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [imgLoading, setImgLoading] = useState(false)

  useEffect(() => {
    if (!open || !analysisId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setIndex(0)
    apiFetch<{ sheets: SheetItem[] }>(`/api/clash-gap/analyses/${analysisId}/sheets`)
      .then((d) => {
        if (!cancelled) setSheets(d.sheets || [])
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load result')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, analysisId])

  const count = sheets.length
  const safeIndex = count ? Math.min(Math.max(index, 0), count - 1) : 0
  const current = sheets[safeIndex] ?? null
  const atStart = safeIndex <= 0
  const atEnd = safeIndex >= count - 1

  useEffect(() => {
    setRotation(0)
    setZoom(1)
    setImgLoading(Boolean(current?.imageUrl))
  }, [current?.id, current?.imageUrl])

  useEffect(() => {
    if (!open || count <= 1) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(count - 1, i + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, count])

  const iconBtn =
    'flex h-8 w-8 items-center justify-center rounded-lg border border-[#e2e8f0] bg-white text-[#475569] transition-colors hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[94vh] max-w-[min(97vw,1200px)] flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>OCR result — image vs. text</DialogTitle>
          <DialogDescription>
            {current
              ? `${pageLabel(current)} — page ${safeIndex + 1} of ${count}`
              : 'Each original page image with its transcribed text.'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col gap-3 py-20">
            <ProgressBar tone="violet" className="mx-auto w-1/2" />
            <div className="text-muted-foreground flex items-center justify-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading result…
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-red-600">
            <FileWarning className="h-4 w-4" aria-hidden /> {error}
          </div>
        ) : !current ? (
          <p className="text-muted-foreground py-20 text-center text-sm">No pages to show yet.</p>
        ) : (
          <div className="relative flex min-h-0 flex-1 flex-col">
            <button
              type="button"
              aria-label="Previous page"
              disabled={atStart}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              className="absolute left-1 top-[38%] z-10 flex h-11 w-11 items-center justify-center rounded-full border border-[#e2e8f0] bg-white text-[#0f172a] shadow-md transition-colors hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-30"
            >
              <ChevronLeft className="h-6 w-6" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Next page"
              disabled={atEnd}
              onClick={() => setIndex((i) => Math.min(count - 1, i + 1))}
              className="absolute right-1 top-[38%] z-10 flex h-11 w-11 items-center justify-center rounded-full border border-[#e2e8f0] bg-white text-[#0f172a] shadow-md transition-colors hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-30"
            >
              <ChevronRight className="h-6 w-6" aria-hidden />
            </button>

            <div className="min-h-0 flex-1 overflow-y-auto px-12 pb-1">
              <div className="mb-2 flex items-center justify-end gap-1.5">
                <button type="button" className={iconBtn} title="Rotate 90°" onClick={() => setRotation((r) => (r + 90) % 360)}>
                  <RotateCw className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  className={iconBtn}
                  title="Zoom out"
                  disabled={zoom <= ZOOM_MIN}
                  onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
                >
                  <ZoomOut className="h-4 w-4" aria-hidden />
                </button>
                <span className="w-12 text-center text-xs tabular-nums text-[#475569]">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  className={iconBtn}
                  title="Zoom in"
                  disabled={zoom >= ZOOM_MAX}
                  onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
                >
                  <ZoomIn className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  className={iconBtn}
                  title="Reset view"
                  disabled={zoom === 1 && rotation === 0}
                  onClick={() => {
                    setZoom(1)
                    setRotation(0)
                  }}
                >
                  <RefreshCw className="h-4 w-4" aria-hidden />
                </button>
              </div>

              <div className="relative flex h-[60vh] items-center justify-center overflow-auto rounded-xl border border-[#e2e8f0] bg-slate-50 p-2">
                {current.imageUrl ? (
                  <>
                    <img
                      key={current.id}
                      src={current.imageUrl}
                      alt={pageLabel(current)}
                      onLoad={() => setImgLoading(false)}
                      onError={() => setImgLoading(false)}
                      style={{ transform: `rotate(${rotation}deg) scale(${zoom})`, transformOrigin: 'center' }}
                      className="max-h-[56vh] max-w-full rounded-lg object-contain transition-transform duration-150"
                    />
                    {imgLoading ? (
                      <div className="bg-slate-50/70 absolute inset-0 flex items-center justify-center">
                        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" aria-hidden />
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="text-muted-foreground flex h-48 items-center justify-center text-xs">
                    No image
                  </div>
                )}
              </div>

              <div className="mt-4">
                <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#64748b]">
                  Transcribed text
                </h4>
                <pre className="max-h-[24vh] overflow-auto whitespace-pre-wrap rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-3 text-xs leading-relaxed text-[#334155]">
                  {current.ocrText.trim() || '(no text recognized on this page)'}
                </pre>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
