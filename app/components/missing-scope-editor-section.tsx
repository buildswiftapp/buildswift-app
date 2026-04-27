'use client'

import { useCallback, useMemo, useState } from 'react'
import { AlertCircle, Brain, RefreshCw, Sparkles, X } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { MissingScopeApiType } from '@/lib/missing-scope-client'

const MIN_DESCRIPTION_LENGTH = 10
const HELPER_TEXT = 'Enter a brief description first so AI can improve it.'
const API_FAILURE_MESSAGE = 'AI request failed. Please try again.'

type ImproveResponse = { improvedDescription: string }
type AnalyzeChangeOrderResponse = {
  missingScope: string[]
  unclearAreas: string[]
  suggestedRevision: string
}

type ImprovementResult =
  | null
  | { kind: 'text'; improvedDescription: string }
  | {
      kind: 'change-order'
      missingScope: string[]
      unclearAreas: string[]
      suggestedRevision: string
    }

function getUiConfig(documentApiType: MissingScopeApiType) {
  if (documentApiType === 'RFI') {
    return {
      prompt: 'Want help making this request clearer and more complete?',
      buttonLabel: '✨ Improve & Clarify',
      runningLabel: 'Improving…',
      icon: Sparkles,
    }
  }
  if (documentApiType === 'Submittal') {
    return {
      prompt: 'Want to make this submittal description more complete and professional?',
      buttonLabel: '✨ Improve & Complete',
      runningLabel: 'Improving…',
      icon: Sparkles,
    }
  }
  return {
    prompt: 'Want AI to review this for missing scope or unclear details?',
    buttonLabel: '🧠 Analyze Scope with AI',
    runningLabel: 'Analyzing…',
    icon: Brain,
  }
}

export function MissingScopeEditorSection(props: {
  documentApiType: MissingScopeApiType
  value: string
  onChange: (next: string) => void
  rows?: number
  textareaClassName?: string
  placeholder?: string
  disabled?: boolean
  isGeneratingDescription?: boolean
  variant?: 'default' | 'document-description'
  aiNotes?: string
}) {
  const {
    documentApiType,
    value,
    onChange,
    rows = 5,
    textareaClassName,
    placeholder,
    disabled,
    isGeneratingDescription = false,
    variant = 'default',
    aiNotes,
  } = props

  const [isImproving, setIsImproving] = useState(false)
  const [improvementResult, setImprovementResult] = useState<ImprovementResult>(null)
  const [error, setError] = useState<string | null>(null)
  const ui = getUiConfig(documentApiType)
  const Icon = ui.icon

  const trimmed = value.trim()
  const canRun = trimmed.length >= MIN_DESCRIPTION_LENGTH
  const buttonDisabled = Boolean(disabled || isGeneratingDescription || isImproving || !canRun)

  const runImprove = useCallback(async () => {
    if (!canRun) {
      setError(HELPER_TEXT)
      return
    }

    setIsImproving(true)
    setError(null)
    setImprovementResult(null)

    try {
      if (documentApiType === 'Change Order') {
        const result = await apiFetch<AnalyzeChangeOrderResponse>('/api/ai/analyze-change-order', {
          method: 'POST',
          json: {
            description: trimmed,
            ...(aiNotes?.trim() ? { notes: aiNotes.trim() } : {}),
          },
        })
        setImprovementResult({
          kind: 'change-order',
          missingScope: Array.isArray(result.missingScope) ? result.missingScope : [],
          unclearAreas: Array.isArray(result.unclearAreas) ? result.unclearAreas : [],
          suggestedRevision: typeof result.suggestedRevision === 'string' ? result.suggestedRevision : '',
        })
      } else {
        const endpoint = documentApiType === 'RFI' ? '/api/ai/improve-rfi' : '/api/ai/improve-submittal'
        const result = await apiFetch<ImproveResponse>(endpoint, {
          method: 'POST',
          json: {
            description: trimmed,
            ...(aiNotes?.trim() ? { notes: aiNotes.trim() } : {}),
          },
        })
        const improvedDescription = result.improvedDescription?.trim()
        if (!improvedDescription) {
          setError(API_FAILURE_MESSAGE)
          return
        }
        setImprovementResult({ kind: 'text', improvedDescription })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : API_FAILURE_MESSAGE)
    } finally {
      setIsImproving(false)
    }
  }, [aiNotes, canRun, documentApiType, trimmed])

  const applyTextImprovement = useCallback(() => {
    if (improvementResult?.kind !== 'text') return
    onChange(improvementResult.improvedDescription)
    setImprovementResult(null)
  }, [improvementResult, onChange])

  const applyChangeOrderSuggestion = useCallback(() => {
    if (improvementResult?.kind !== 'change-order') return
    if (!improvementResult.suggestedRevision.trim()) return
    onChange(improvementResult.suggestedRevision.trim())
    setImprovementResult(null)
  }, [improvementResult, onChange])

  const panel = useMemo(() => {
    if (!improvementResult) return null

    if (improvementResult.kind === 'text') {
      return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-2 text-sm font-semibold text-slate-900">AI improved description</p>
          <div className="rounded-md border border-slate-100 bg-slate-50/70 px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap text-slate-800">
            {improvementResult.improvedDescription}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={applyTextImprovement}>
              Apply
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => void runImprove()} disabled={isImproving}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Regenerate
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setImprovementResult(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )
    }

    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-900">Change Order AI analysis</p>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => setImprovementResult(null)}
            aria-label="Close analysis panel"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-3 text-sm">
          <div>
            <p className="mb-1 font-semibold text-amber-800">⚠ Missing Scope</p>
            {improvementResult.missingScope.length === 0 ? (
              <p className="text-slate-600">No missing scope items detected.</p>
            ) : (
              <ul className="list-inside list-disc space-y-1 text-slate-700">
                {improvementResult.missingScope.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-1 font-semibold text-amber-800">⚠ Unclear Areas</p>
            {improvementResult.unclearAreas.length === 0 ? (
              <p className="text-slate-600">No unclear areas detected.</p>
            ) : (
              <ul className="list-inside list-disc space-y-1 text-slate-700">
                {improvementResult.unclearAreas.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-1 font-semibold text-emerald-800">✅ Suggested Revision</p>
            <div className="rounded-md border border-slate-100 bg-slate-50/70 px-3 py-2 leading-relaxed whitespace-pre-wrap text-slate-800">
              {improvementResult.suggestedRevision || 'No suggested revision provided.'}
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={applyChangeOrderSuggestion} disabled={!improvementResult.suggestedRevision.trim()}>
            Apply Suggested Revision
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => void runImprove()} disabled={isImproving}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Regenerate
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setImprovementResult(null)}>
            Ignore
          </Button>
        </div>
      </div>
    )
  }, [applyChangeOrderSuggestion, applyTextImprovement, improvementResult, isImproving, runImprove])

  const actionButtonClass =
    variant === 'document-description'
      ? 'flex shrink-0 items-center gap-2 rounded-lg border border-[#CED4DA] bg-[#E9ECEF] px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-none hover:bg-[#dee2e6]'
      : 'h-auto min-h-10 shrink-0 gap-1.5 whitespace-normal px-3 py-2 text-left font-medium sm:max-w-[13rem] sm:self-start'

  return (
    <div className="space-y-3">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        disabled={disabled || isGeneratingDescription || isImproving}
        placeholder={placeholder}
        className={cn(
          variant === 'document-description'
            ? 'min-h-[200px] w-full resize-none rounded-lg border-0 bg-[#E9ECEF] px-4 py-3 text-[15px] leading-relaxed text-[#333e4f] shadow-none placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]/25'
            : 'min-h-[7.5rem] resize-none sm:min-h-0',
          textareaClassName
        )}
      />

      <div className="flex flex-col gap-3 rounded-lg border border-dashed border-[#CED4DA] bg-white px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium leading-snug text-[#0f172a]">{ui.prompt}</p>
          {!canRun ? <p className="mt-1 text-xs text-slate-500">{HELPER_TEXT}</p> : null}
        </div>
        <Button
          type="button"
          variant={variant === 'document-description' ? 'outline' : 'default'}
          size="sm"
          onClick={() => void runImprove()}
          disabled={buttonDisabled}
          className={actionButtonClass}
        >
          {isImproving ? (
            <>
              <Spinner className="h-4 w-4 shrink-0" />
              {ui.runningLabel}
            </>
          ) : (
            ui.buttonLabel
          )}
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive" className="border-red-200 bg-red-50/95 text-red-950">
          <AlertCircle className="text-red-600" />
          <AlertTitle>AI request</AlertTitle>
          <AlertDescription className="text-red-900/85">{error}</AlertDescription>
        </Alert>
      ) : null}

      {panel}
    </div>
  )
}
