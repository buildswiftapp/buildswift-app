'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [imgLoading, setImgLoading] = useState(false)
  const panDragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)

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

  const resetView = useCallback(() => {
    setZoom(1)
    setRotation(0)
    setPan({ x: 0, y: 0 })
  }, [])

  useEffect(() => {
    resetView()
    setImgLoading(Boolean(current?.imageUrl))
  }, [current?.id, current?.imageUrl, resetView])

  useEffect(() => {
    if (!open || count <= 1) return
    const onKey = (e: KeyboardEvent) => {
      if (isPanning) return
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(count - 1, i + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, count, isPanning])

  const endPan = useCallback(() => {
    panDragRef.current = null
    setIsPanning(false)
  }, [])

  const onViewportPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!current?.imageUrl || e.button !== 0) return
      e.preventDefault()
      viewportRef.current?.setPointerCapture(e.pointerId)
      panDragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y }
      setIsPanning(true)
    },
    [current?.imageUrl, pan.x, pan.y],
  )

  const onViewportPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = panDragRef.current
    if (!drag) return
    setPan({
      x: drag.panX + (e.clientX - drag.startX),
      y: drag.panY + (e.clientY - drag.startY),
    })
  }, [])

  const onViewportWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (!current?.imageUrl) return
      e.preventDefault()
      const next = clampZoom(zoom + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP))
      if (next === 1) setPan({ x: 0, y: 0 })
      setZoom(next)
    },
    [current?.imageUrl, zoom],
  )

  const iconBtn =
    'flex h-8 w-8 items-center justify-center rounded-lg border border-[#e2e8f0] bg-white text-[#475569] transition-colors hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40'

  const canGrab = zoom > 1

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[96vh] w-[min(98vw,1680px)] max-w-[min(98vw,1680px)] flex-col overflow-hidden sm:max-w-[min(98vw,1680px)]">
        <DialogHeader>
          <DialogTitle>OCR result — image vs. text</DialogTitle>
          <DialogDescription>
            {current
              ? `${pageLabel(current)} — page ${safeIndex + 1} of ${count}`
              : 'Each original page image with its transcribed text.'}
            {current?.imageUrl ? (
              <span className="mt-1 block text-xs text-[#64748b]">
                Use zoom controls or scroll wheel to zoom. Drag the image to pan when zoomed in.
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col gap-3 py-20">
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
            <div className="flex min-h-0 flex-1 flex-col px-6 pb-1 lg:px-10">
              <div className="grid min-h-[68vh] flex-1 grid-cols-[minmax(0,4fr)_minmax(0,1fr)] gap-3">
                <div className="relative flex min-h-0 min-w-0 flex-col">
                  <button
                    type="button"
                    aria-label="Previous page"
                    disabled={atStart}
                    onClick={() => setIndex((i) => Math.max(0, i - 1))}
                    className="absolute left-0 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[#e2e8f0] bg-white text-[#0f172a] shadow-md transition-colors hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ChevronLeft className="h-5 w-5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label="Next page"
                    disabled={atEnd}
                    onClick={() => setIndex((i) => Math.min(count - 1, i + 1))}
                    className="absolute right-0 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[#e2e8f0] bg-white text-[#0f172a] shadow-md transition-colors hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ChevronRight className="h-5 w-5" aria-hidden />
                  </button>
                  <div className="mb-2 flex shrink-0 items-center justify-end gap-1.5">
                    <button type="button" className={iconBtn} title="Rotate 90°" onClick={() => setRotation((r) => (r + 90) % 360)}>
                      <RotateCw className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={iconBtn}
                      title="Zoom out"
                      disabled={zoom <= ZOOM_MIN}
                      onClick={() => {
                        const next = clampZoom(zoom - ZOOM_STEP)
                        setZoom(next)
                        if (next === 1) setPan({ x: 0, y: 0 })
                      }}
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
                      disabled={zoom === 1 && rotation === 0 && pan.x === 0 && pan.y === 0}
                      onClick={resetView}
                    >
                      <RefreshCw className="h-4 w-4" aria-hidden />
                    </button>
                  </div>

                  <div
                    ref={viewportRef}
                    role="img"
                    aria-label="Page preview — drag to pan when zoomed"
                    className={`relative min-h-0 flex-1 touch-none select-none overflow-hidden rounded-xl border border-[#e2e8f0] bg-slate-50 p-2 ${
                      canGrab ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
                    }`}
                    onPointerDown={onViewportPointerDown}
                    onPointerMove={onViewportPointerMove}
                    onPointerUp={endPan}
                    onPointerCancel={endPan}
                    onLostPointerCapture={endPan}
                    onWheel={onViewportWheel}
                  >
                    {current.imageUrl ? (
                      <>
                        <div className="flex h-full min-h-[60vh] w-full items-center justify-center">
                          <div
                            className="flex items-center justify-center"
                            style={{
                              transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scale(${zoom})`,
                              transformOrigin: 'center center',
                              transition: isPanning ? 'none' : 'transform 150ms ease-out',
                            }}
                          >
                            <img
                              key={current.id}
                              src={current.imageUrl}
                              alt={pageLabel(current)}
                              draggable={false}
                              onLoad={() => setImgLoading(false)}
                              onError={() => setImgLoading(false)}
                              className="pointer-events-none max-h-full max-w-full rounded-lg object-contain"
                            />
                          </div>
                        </div>
                        {imgLoading ? (
                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-50/70">
                            <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" aria-hidden />
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div className="text-muted-foreground flex h-full min-h-[60vh] items-center justify-center text-xs">
                        No image
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex min-h-0 min-w-0 flex-col rounded-xl border border-[#e2e8f0] bg-[#f8fafc]">
                  <h4 className="shrink-0 border-b border-[#e2e8f0] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[#64748b]">
                    Transcribed text
                  </h4>
                  <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-3 text-[11px] leading-relaxed text-[#334155]">
                    {(current.rawText.trim() || current.ocrText.trim()) ||
                      '(no text recognized on this page)'}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
