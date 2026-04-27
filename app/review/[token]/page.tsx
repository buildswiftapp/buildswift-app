'use client'

import { use, useEffect, useMemo, useRef, useState } from 'react'
import SignaturePad from 'signature_pad'
import { Download, Paperclip } from 'lucide-react'

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

export default function ReviewTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payload, setPayload] = useState<ReviewPayload | null>(null)
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null)
  const [notes, setNotes] = useState('')
  const [typedName, setTypedName] = useState('')
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitMessage, setSubmitMessage] = useState<string | null>(null)
  const [openingPreview, setOpeningPreview] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const signaturePadRef = useRef<SignaturePad | null>(null)

  const { token } = use(params)

  const formatAttachmentSize = (bytes: number | null) => {
    if (bytes == null || bytes < 0) return '—'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

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
          setTypedName((data as ReviewPayload).reviewerEmail || '')
          setDecision((data as ReviewPayload).reviewStatus.decision)
        }

        await fetch(`/api/review/${encodeURIComponent(token)}/view`, { method: 'POST' }).catch(() => null)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load review link')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    // Canvas only mounts after load succeeds; deps must re-run when it appears.
    if (loading || error || !payload) return

    let cancelled = false
    let signaturePad: SignaturePad | null = null
    let resizeCanvas: (() => void) | null = null
    let onEndStroke: (() => void) | null = null
    let ro: ResizeObserver | null = null

    const raf = requestAnimationFrame(() => {
      if (cancelled) return
      const canvas = canvasRef.current
      if (!canvas) return

      signaturePad = new SignaturePad(canvas, {
        minWidth: 1.2,
        maxWidth: 2.4,
        penColor: '#0f172a',
        throttle: 0,
        velocityFilterWeight: 0.2,
        backgroundColor: 'rgba(0,0,0,0)',
      })
      signaturePadRef.current = signaturePad

      resizeCanvas = () => {
        const currentCanvas = canvasRef.current
        const currentPad = signaturePadRef.current
        if (!currentCanvas || !currentPad) return
        const ratio = Math.max(window.devicePixelRatio || 1, 1)
        const rect = currentCanvas.getBoundingClientRect()
        const previousData = currentPad.isEmpty() ? null : currentPad.toData()

        currentCanvas.width = Math.max(1, Math.floor(rect.width * ratio))
        currentCanvas.height = Math.max(1, Math.floor(rect.height * ratio))

        const ctx = currentCanvas.getContext('2d')
        if (!ctx) return
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.scale(ratio, ratio)

        currentPad.clear()
        if (previousData && previousData.length > 0) {
          currentPad.fromData(previousData)
        }
      }

      resizeCanvas()
      onEndStroke = () => {
        const pad = signaturePadRef.current
        if (!pad) return
        setSignatureUrl(pad.isEmpty() ? null : pad.toDataURL('image/png'))
      }
      signaturePad.addEventListener('endStroke', onEndStroke)

      window.addEventListener('resize', resizeCanvas)
      ro = new ResizeObserver(() => {
        resizeCanvas?.()
      })
      ro.observe(canvas)

      if (cancelled) {
        signaturePad.removeEventListener('endStroke', onEndStroke)
        signaturePad.off()
        signaturePadRef.current = null
        ro.disconnect()
        window.removeEventListener('resize', resizeCanvas)
      }
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      if (resizeCanvas) window.removeEventListener('resize', resizeCanvas)
      ro?.disconnect()
      if (signaturePad && onEndStroke) {
        signaturePad.removeEventListener('endStroke', onEndStroke)
      }
      signaturePad?.off()
      signaturePadRef.current = null
    }
  }, [loading, error, payload, token])

  const canSubmit = useMemo(() => {
    return (
      payload?.reviewStatus.state === 'pending' &&
      !!decision &&
      typedName.trim().length > 0 &&
      !submitting
    )
  }, [decision, payload?.reviewStatus.state, submitting, typedName])
  const previewDisabled = payload?.reviewStatus.state !== 'pending' || openingPreview

  function clearSignature() {
    const pad = signaturePadRef.current
    if (!pad) return
    pad.clear()
    setSignatureUrl(null)
  }

  async function submitDecision() {
    if (!canSubmit || !decision) return
    try {
      setSubmitting(true)
      setSubmitMessage(null)
      const res = await fetch('/api/review/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token,
          decision: decision === 'approve' ? 'approved' : 'rejected',
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
                decision,
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

  function openPdfPreview() {
    if (previewDisabled) return
    setOpeningPreview(true)
    const url = `/api/review/${encodeURIComponent(token)}/pdf`
    const opened = window.open(url, '_blank', 'noopener,noreferrer')
    if (!opened) {
      setSubmitMessage('Popup blocked. Please allow popups and try PDF Preview again.')
    }
    window.setTimeout(() => setOpeningPreview(false), 500)
  }

  if (loading) {
    return <main className="app-page max-w-3xl text-sm text-slate-600">Loading review request...</main>
  }
  if (error || !payload) {
    return (
      <main className="app-page max-w-3xl">
        <h1 className="text-2xl font-semibold text-slate-900">Unable to open review link</h1>
        <p className="mt-2 text-sm text-red-600">{error || 'Invalid review link'}</p>
      </main>
    )
  }

  return (
    <main className="app-page max-w-3xl">
      <h1 className="text-2xl font-semibold text-slate-900">Document Review</h1>
      <p className="mt-1 text-sm text-slate-600">{payload.documentContent.projectName}</p>

      <section className="app-surface relative mt-6 overflow-hidden">
        <div
          className="h-72 w-full bg-cover bg-center"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1600' height='900'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1' y1='0' y2='1'%3E%3Cstop stop-color='%23f8fafc'/%3E%3Cstop offset='1' stop-color='%23e2e8f0'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1600' height='900' fill='url(%23g)'/%3E%3Crect x='180' y='90' width='1240' height='720' rx='20' fill='%23ffffff' stroke='%23cbd5e1' stroke-width='8'/%3E%3Crect x='250' y='170' width='460' height='36' rx='8' fill='%232563eb' fill-opacity='0.18'/%3E%3Crect x='250' y='230' width='1100' height='18' rx='6' fill='%2394a3b8' fill-opacity='0.3'/%3E%3Crect x='250' y='268' width='980' height='18' rx='6' fill='%2394a3b8' fill-opacity='0.3'/%3E%3Crect x='250' y='306' width='1080' height='18' rx='6' fill='%2394a3b8' fill-opacity='0.3'/%3E%3Crect x='250' y='344' width='920' height='18' rx='6' fill='%2394a3b8' fill-opacity='0.3'/%3E%3Crect x='250' y='420' width='700' height='18' rx='6' fill='%2394a3b8' fill-opacity='0.3'/%3E%3C/svg%3E\")",
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center bg-white/35 backdrop-blur-[2px]">
          <button
            type="button"
            onClick={openPdfPreview}
            className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={previewDisabled}
          >
            {openingPreview ? 'Opening...' : 'PDF Preview'}
          </button>
        </div>
      </section>

      <section className="app-surface mt-6 p-5">
        <h2 className="text-lg font-semibold text-slate-900">{payload.documentContent.title}</h2>
        <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
          {payload.documentContent.type.replace('_', ' ')}
        </p>
        <p className="mt-4 text-sm text-slate-600">
          For a structured reading experience, click <strong>PDF Preview</strong> above.
        </p>
      </section>

      {payload.attachments && payload.attachments.length > 0 ? (
        <section className="app-surface mt-6 p-5">
          <h3 className="text-base font-semibold text-slate-900">Attachments</h3>
          <p className="mt-1 text-sm text-slate-600">
            Files included with this document. Download copies for your records.
          </p>
          <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-100 bg-slate-50/60">
            {payload.attachments.map((att) => {
              const href = `/api/review/${encodeURIComponent(token)}/attachments/${encodeURIComponent(att.id)}`
              return (
                <li
                  key={att.id}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500">
                      <Paperclip className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{att.file_name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{formatAttachmentSize(att.size_bytes)}</p>
                    </div>
                  </div>
                  <a
                    href={href}
                    download={att.file_name}
                    className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 sm:self-center"
                  >
                    <Download className="h-4 w-4" aria-hidden />
                    Download
                  </a>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {payload.reviewStatus.message ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {payload.reviewStatus.message}
        </div>
      ) : null}

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="text-base font-semibold text-slate-900">Submit Review</h3>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => setDecision('approve')}
            disabled={payload.reviewStatus.state !== 'pending'}
            className={`rounded-md px-4 py-2 text-sm font-medium ${
              decision === 'approve' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-800'
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => setDecision('reject')}
            disabled={payload.reviewStatus.state !== 'pending'}
            className={`rounded-md px-4 py-2 text-sm font-medium ${
              decision === 'reject' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-800'
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            Reject
          </button>
        </div>

        <label className="mt-5 block text-sm font-medium text-slate-800">Reviewer Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          disabled={payload.reviewStatus.state !== 'pending'}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
          placeholder="Add any context for your decision."
        />

        <label className="mt-5 block text-sm font-medium text-slate-800">Reviewer Email</label>
        <input
          value={payload.reviewerEmail}
          readOnly
          className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
        />

        <label className="mt-5 block text-sm font-medium text-slate-800">Typed Name (required)</label>
        <input
          value={typedName}
          onChange={(e) => setTypedName(e.target.value)}
          disabled={payload.reviewStatus.state !== 'pending'}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
          placeholder="Type your full name"
        />

        <div className="mt-5 flex items-center justify-between">
          <label className="block text-sm font-medium text-slate-800">Drawn Signature (optional)</label>
          <button
            type="button"
            onClick={clearSignature}
            disabled={payload.reviewStatus.state !== 'pending'}
            className="text-sm text-slate-600 underline disabled:opacity-60"
          >
            Clear
          </button>
        </div>
        <canvas
          ref={canvasRef}
          className="mt-1 h-36 w-full rounded-md border border-slate-300 bg-white touch-none"
        />

        <button
          type="button"
          onClick={() => void submitDecision()}
          disabled={!canSubmit}
          className="mt-6 rounded-md bg-slate-900 px-5 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Submitting...' : 'Submit Review'}
        </button>
        {submitMessage ? <p className="mt-3 text-sm text-slate-700">{submitMessage}</p> : null}
      </section>
    </main>
  )
}
