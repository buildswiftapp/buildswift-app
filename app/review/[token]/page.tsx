'use client'

import { use, useEffect, useMemo, useRef, useState } from 'react'
import SignaturePad from 'signature_pad'
import { CheckCircle2, Download, Paperclip, XCircle } from 'lucide-react'

type ReviewAttachment = {
  id: string
  file_name: string
  mime_type: string | null
  size_bytes: number | null
}

type ReviewPayload = {
  reviewerEmail: string
  documentContent: {
    title: string
    description: string
    type: 'rfi' | 'submittal' | 'change_order'
    projectName: string
  }
  attachments?: ReviewAttachment[]
  reviewStatus: {
    state: 'pending' | 'submitted' | 'expired'
    decision: 'approve' | 'reject' | null
    decided_at: string | null
    token_expires_at: string | null
    cycle_status: string | null
    message: string | null
  }
}

const DOC_TYPE_LABELS: Record<string, string> = {
  rfi: 'Request for Information',
  submittal: 'Product Submittal',
  change_order: 'Change Order',
}

function formatSize(bytes: number | null) {
  if (bytes == null || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ReviewTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payload, setPayload] = useState<ReviewPayload | null>(null)
  const [notes, setNotes] = useState('')
  const [typedName, setTypedName] = useState('')
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitMessage, setSubmitMessage] = useState<string | null>(null)
  const [pdfLoaded, setPdfLoaded] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const signaturePadRef = useRef<SignaturePad | null>(null)
  const teardownRef = useRef<(() => void) | null>(null)

  const { token } = use(params)
  const pdfUrl = `/api/review/${encodeURIComponent(token)}/pdf`
  // Suppress the browser's built-in PDF toolbar and thumbnail panel
  const pdfEmbedUrl = `${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0`

  // ── Load review data ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        setError(null)
        const res = await fetch(`/api/review/${encodeURIComponent(token)}`, { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || 'Failed to load review link')
        if (!cancelled) {
          setPayload(data as ReviewPayload)
        }
        await fetch(`/api/review/${encodeURIComponent(token)}/view`, { method: 'POST' }).catch(() => null)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load review link')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [token])

  // ── Signature pad setup ─────────────────────────────────────────────────────
  useEffect(() => {
    if (loading || error || !payload) return

    let cancelled = false
    let pad: SignaturePad | null = null
    let ro: ResizeObserver | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    // Sync the canvas *drawing buffer* to its CSS pixel dimensions.
    // We intentionally avoid DPR scaling here because SignaturePad v5
    // measures pointer positions in CSS pixels (clientX/clientY minus
    // getBoundingClientRect), so the buffer must be 1:1 with CSS pixels;
    // any scaling in the 2D context would offset every stroke.
    const syncSize = (canvas: HTMLCanvasElement): boolean => {
      const w = canvas.offsetWidth
      const h = canvas.offsetHeight
      if (!w || !h) return false
      if (canvas.width !== w || canvas.height !== h) {
        const prev = pad && !pad.isEmpty() ? pad.toData() : null
        canvas.width = w
        canvas.height = h
        pad?.clear()
        if (prev) pad?.fromData(prev)
      }
      return true
    }

    const init = () => {
      if (cancelled) return
      const canvas = canvasRef.current
      if (!canvas) return

      // Give the flex layout a chance to resolve before measuring.
      if (!canvas.offsetWidth || !canvas.offsetHeight) {
        retryTimer = setTimeout(init, 50)
        return
      }

      pad = new SignaturePad(canvas, {
        minWidth: 1.2,
        maxWidth: 2.4,
        penColor: '#0f172a',
        throttle: 0,
        velocityFilterWeight: 0.2,
        backgroundColor: 'rgba(0,0,0,0)',
      })
      signaturePadRef.current = pad
      syncSize(canvas)

      const onEndStroke = () => {
        const p = signaturePadRef.current
        if (!p) return
        setSignatureUrl(p.isEmpty() ? null : p.toDataURL('image/png'))
      }
      pad.addEventListener('endStroke', onEndStroke)

      const onResize = () => syncSize(canvas)
      window.addEventListener('resize', onResize)

      ro = new ResizeObserver(onResize)
      ro.observe(canvas)

      // Override teardown to capture the right closures.
      teardownRef.current = () => {
        pad?.removeEventListener('endStroke', onEndStroke)
        window.removeEventListener('resize', onResize)
        ro?.disconnect()
        pad?.off()
        signaturePadRef.current = null
      }
    }

    // Small initial delay so the two-column flex layout has fully painted.
    retryTimer = setTimeout(init, 60)

    return () => {
      cancelled = true
      if (retryTimer !== null) clearTimeout(retryTimer)
      teardownRef.current?.()
      teardownRef.current = null
    }
  }, [loading, error, payload, token])

  const isPending = payload?.reviewStatus.state === 'pending'

  const canSubmitActions = useMemo(
    () => isPending && typedName.trim().length > 0 && !submitting,
    [isPending, submitting, typedName]
  )

  function clearSignature() {
    signaturePadRef.current?.clear()
    setSignatureUrl(null)
  }

  async function submitDecision(nextDecision: 'approve' | 'reject') {
    if (!canSubmitActions) return
    try {
      setSubmitting(true)
      setSubmitMessage(null)
      const res = await fetch('/api/review/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token,
          decision: nextDecision === 'approve' ? 'approved' : 'rejected',
          notes: notes.trim() || undefined,
          signature_name: typedName.trim(),
          signature_image: signatureUrl || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to submit review')
      setSubmitMessage('Review submitted successfully.')
      setPayload((prev) =>
        prev
          ? {
              ...prev,
              reviewStatus: {
                ...prev.reviewStatus,
                state: 'submitted',
                decision: nextDecision,
                decided_at: new Date().toISOString(),
                message: 'This review has already been submitted.',
              },
            }
          : prev
      )
    } catch (e) {
      setSubmitMessage(e instanceof Error ? e.message : 'Failed to submit review')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Loading / error states ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-700" />
          <p className="text-sm text-slate-500">Loading review request…</p>
        </div>
      </div>
    )
  }

  if (error || !payload) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-md rounded-2xl border border-red-100 bg-white p-8 shadow-md text-center">
          <XCircle className="mx-auto mb-4 h-12 w-12 text-red-400" />
          <h1 className="text-xl font-semibold text-slate-900">Unable to open review link</h1>
          <p className="mt-2 text-sm text-red-600">{error || 'Invalid review link'}</p>
        </div>
      </div>
    )
  }

  const docTypeLabel = DOC_TYPE_LABELS[payload.documentContent.type] ?? payload.documentContent.type
  const alreadyDecided = payload.reviewStatus.state === 'submitted'
  const isExpired = payload.reviewStatus.state === 'expired'

  // ── Full layout ─────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen flex-col overflow-hidden">

      {/* ── FULL-WIDTH HEADER ── */}
      <div className="shrink-0 bg-[#1a1a2e] px-8 py-4 flex items-center justify-between gap-6">
        <div className="min-w-0">
          <span className="inline-block rounded-full border border-slate-600 px-3 py-0.5 text-xs font-semibold uppercase tracking-widest text-slate-300">
            {docTypeLabel}
          </span>
          <h1 className="mt-1.5 truncate text-xl font-bold text-white leading-snug">
            {payload.documentContent.title}
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">{payload.documentContent.projectName}</p>
        </div>
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 flex items-center gap-1.5 rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:border-slate-400 hover:bg-slate-700 transition-colors"
        >
          <Download className="h-4 w-4" />
          Download PDF
        </a>
      </div>

      {/* ── BODY: 50/50 split ── */}
      <div className="flex flex-1 overflow-hidden bg-slate-100">

        {/* ── LEFT: PDF pane (white background) ── */}
        <div className="relative flex w-1/2 shrink-0 flex-col border-r border-slate-200 bg-white">
          {/* PDF iframe — padded so the document floats on the white surround */}
          <div className="relative flex-1 overflow-hidden px-6 py-5">
            {!pdfLoaded && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-600" />
                <p className="text-sm text-slate-400">Loading PDF…</p>
              </div>
            )}
            <iframe
              src={pdfEmbedUrl}
              title="Document PDF"
              onLoad={() => setPdfLoaded(true)}
              className="h-full w-full rounded-lg border-0 shadow-lg"
            />
          </div>
        </div>

        {/* ── RIGHT: Review pane ── */}
        <div className="flex w-1/2 flex-col overflow-y-auto bg-slate-50">

        <div className="flex flex-1 flex-col gap-6 p-6">

          {/* Status banner */}
          {alreadyDecided && (
            <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
              payload.reviewStatus.decision === 'approve'
                ? 'border-emerald-200 bg-emerald-50'
                : 'border-red-200 bg-red-50'
            }`}>
              {payload.reviewStatus.decision === 'approve' ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              ) : (
                <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
              )}
              <div>
                <p className={`text-sm font-semibold ${payload.reviewStatus.decision === 'approve' ? 'text-emerald-800' : 'text-red-800'}`}>
                  {payload.reviewStatus.decision === 'approve' ? 'Approved' : 'Rejected'}
                </p>
                <p className={`text-xs mt-0.5 ${payload.reviewStatus.decision === 'approve' ? 'text-emerald-700' : 'text-red-700'}`}>
                  {payload.reviewStatus.message || 'This review has already been submitted.'}
                </p>
              </div>
            </div>
          )}

          {isExpired && !alreadyDecided && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <p className="text-sm text-amber-800">{payload.reviewStatus.message || 'This review link has expired.'}</p>
            </div>
          )}

          {/* Attachments */}
          {payload.attachments && payload.attachments.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-800">Attachments</h3>
              </div>
              <ul className="divide-y divide-slate-100">
                {payload.attachments.map((att) => {
                  const href = `/api/review/${encodeURIComponent(token)}/attachments/${encodeURIComponent(att.id)}`
                  return (
                    <li key={att.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500">
                          <Paperclip className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800">{att.file_name}</p>
                          <p className="text-xs text-slate-400">{formatSize(att.size_bytes)}</p>
                        </div>
                      </div>
                      <a
                        href={href}
                        download={att.file_name}
                        className="shrink-0 flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </a>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {/* Review form */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-md">
            <div className="border-b border-slate-100 px-7 py-6">
              <h2 className="text-xl font-bold text-slate-900">Submit Review</h2>
              <p className="mt-1 text-sm text-slate-500">Add notes and sign if needed, then approve or reject.</p>
            </div>

            <div className="px-7 py-7 space-y-7">

              {/* Notes */}
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-400">
                  Reviewer Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  disabled={!isPending}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm leading-relaxed outline-none ring-blue-400 placeholder:text-slate-400 focus:ring-2 disabled:bg-slate-50 disabled:text-slate-400"
                  placeholder="Add any context for your decision…"
                />
              </div>

              {/* Email (readonly) */}
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-400">
                  Reviewer Email
                </label>
                <input
                  value={payload.reviewerEmail}
                  readOnly
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500"
                />
              </div>

              {/* Typed name */}
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-400">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  disabled={!isPending}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none ring-blue-400 placeholder:text-slate-400 focus:ring-2 disabled:bg-slate-50 disabled:text-slate-400"
                  placeholder="Type your full name"
                />
              </div>

              {/* Drawn signature */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    Drawn Signature{' '}
                    <span className="font-normal normal-case text-slate-400">(optional)</span>
                  </label>
                  <button
                    type="button"
                    onClick={clearSignature}
                    disabled={!isPending}
                    className="text-sm font-medium text-blue-600 hover:underline disabled:opacity-40"
                  >
                    Clear
                  </button>
                </div>
                <canvas
                  ref={canvasRef}
                  className="h-36 w-full rounded-xl border border-slate-300 bg-white touch-none"
                />
                <p className="mt-2 text-xs text-slate-400">Draw your signature using your mouse or touchscreen.</p>
              </div>

              {/* Approve / Reject — submit immediately */}
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => void submitDecision('approve')}
                  disabled={!canSubmitActions}
                  className="flex items-center justify-center gap-2.5 rounded-2xl bg-emerald-600 py-4 text-base font-semibold text-white transition-all hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  {submitting ? 'Submitting…' : 'Approve'}
                </button>
                <button
                  type="button"
                  onClick={() => void submitDecision('reject')}
                  disabled={!canSubmitActions}
                  className="flex items-center justify-center gap-2.5 rounded-2xl bg-red-600 py-4 text-base font-semibold text-white transition-all hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <XCircle className="h-5 w-5 shrink-0" />
                  {submitting ? 'Submitting…' : 'Reject'}
                </button>
              </div>

              {submitMessage && (
                <p className={`rounded-xl px-4 py-3 text-sm ${
                  submitMessage.toLowerCase().includes('success')
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'bg-red-50 text-red-700'
                }`}>
                  {submitMessage}
                </p>
              )}
            </div>
          </div>

        </div>
        </div>
      </div>
    </div>
  )
}
