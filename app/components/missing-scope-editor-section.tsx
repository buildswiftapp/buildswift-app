'use client'

import { useCallback, useState } from 'react'
import { AlertCircle, Brain, CheckCircle2, Loader2, RefreshCw, Sparkles, X } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import {
  getMissingScopeSeed,
  type MissingScopeApiResponse,
  type MissingScopeApiType,
} from '@/lib/missing-scope-client'

const API_FAILURE_MESSAGE = 'Analysis failed. Please try again.'

type AiGenerateResponse = { generatedContent: string }

function toAiGenerateDocumentType(type: MissingScopeApiType): 'RFI' | 'ChangeOrder' | 'Submittal' {
  if (type === 'RFI') return 'RFI'
  if (type === 'Submittal') return 'Submittal'
  return 'ChangeOrder'
}

function getScopePromptByType(type: MissingScopeApiType) {
  if (type === 'RFI') {
    return {
      prompt: 'Would you like to make this request clearer and more complete?',
      buttonLabel: 'Improve & Clarify',
      Icon: Sparkles,
    }
  }
  if (type === 'Submittal') {
    return {
      prompt: 'Would you like to make this submittal description more complete and professional?',
      buttonLabel: 'Improve & Refine',
      Icon: Sparkles,
    }
  }
  return {
    prompt: 'Would you like AI to review this for missing scope items or unclear details?',
    buttonLabel: 'Analyze Scope with AI',
    Icon: Brain,
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
  /**
   * `default`: textarea + Check Missing Scope beside (legacy).
   * `document-description`: full-width gray textarea + dashed white info strip (new document layout).
   */
  variant?: 'default' | 'document-description'
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
  } = props
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isApplyingSuggestion, setIsApplyingSuggestion] = useState(false)
  const [applyingSuggestionIndex, setApplyingSuggestionIndex] = useState<number | null>(null)
  const [appliedSuggestionIndexes, setAppliedSuggestionIndexes] = useState<Set<number>>(new Set())
  const [ignoredSuggestionIndexes, setIgnoredSuggestionIndexes] = useState<Set<number>>(new Set())
  const [analysisResult, setAnalysisResult] = useState<MissingScopeApiResponse | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const scopePrompt = getScopePromptByType(documentApiType)

  const runAnalyze = useCallback(async () => {
    if (!value.trim()) {
      setAnalysisError('Add document body text before running missing scope analysis.')
      return
    }
    setIsAnalyzing(true)
    setAnalysisResult(null)
    setAnalysisError(null)
    setApplyingSuggestionIndex(null)
    setAppliedSuggestionIndexes(new Set())
    setIgnoredSuggestionIndexes(new Set())
    try {
      const initialDescription = getMissingScopeSeed(documentApiType)
      const result = await apiFetch<MissingScopeApiResponse>('/api/ai/missing-scope', {
        method: 'POST',
        json: {
          type: documentApiType,
          content: value,
          ...(initialDescription ? { initialDescription } : {}),
        },
      })
      setAnalysisResult({
        issues: Array.isArray(result.issues) ? result.issues : [],
        suggestions: Array.isArray(result.suggestions) ? result.suggestions : [],
      })
    } catch {
      setAnalysisError(API_FAILURE_MESSAGE)
    } finally {
      setIsAnalyzing(false)
    }
  }, [documentApiType, value])

  const closePanel = useCallback(() => {
    setAnalysisResult(null)
    setAnalysisError(null)
  }, [])

  const insertSuggestion = useCallback(
    async (suggestion: string, suggestionIndex: number) => {
      if (!value.trim()) {
        setAnalysisError('Add document body text before applying a suggestion.')
        return
      }
      const trimmedSuggestion = suggestion.trim()
      if (!trimmedSuggestion) return

      setIsApplyingSuggestion(true)
      setApplyingSuggestionIndex(suggestionIndex)
      setAnalysisError(null)
      try {
        const data = await apiFetch<AiGenerateResponse>('/api/ai/generate', {
          method: 'POST',
          json: {
            documentType: toAiGenerateDocumentType(documentApiType),
            description: value.trim(),
            additionalSystemPrompt: [
              'You must incorporate the following required improvement suggestion into the rewritten body text.',
              `Required improvement suggestion: ${trimmedSuggestion}`,
              'Keep all user-provided facts accurate, and integrate this naturally without adding unrelated details.',
            ].join('\n'),
          },
        })
        const generated = data.generatedContent?.trim()
        if (!generated) {
          setAnalysisError('AI regeneration returned empty content. Please try again.')
          return
        }
        onChange(generated)
        setAppliedSuggestionIndexes((prev) => {
          const next = new Set(prev)
          next.add(suggestionIndex)
          return next
        })
      } catch {
        setAnalysisError(API_FAILURE_MESSAGE)
      } finally {
        setIsApplyingSuggestion(false)
        setApplyingSuggestionIndex(null)
      }
    },
    [documentApiType, onChange, value]
  )

  const ignoreSuggestion = useCallback((suggestionIndex: number) => {
    setIgnoredSuggestionIndexes((prev) => {
      const next = new Set(prev)
      next.add(suggestionIndex)
      return next
    })
  }, [])

  const checkButtonDefault = (
    <Button
      type="button"
      variant="default"
      size="sm"
      onClick={() => void runAnalyze()}
      disabled={disabled || isAnalyzing || isApplyingSuggestion}
      className="h-auto min-h-10 shrink-0 gap-1.5 whitespace-normal px-3 py-2 text-left font-medium sm:max-w-[11rem] sm:self-start"
    >
      {isAnalyzing ? (
        <>
          <Spinner className="h-4 w-4 shrink-0" />
          Analyzing…
        </>
      ) : (
        <>
          <scopePrompt.Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
          {scopePrompt.buttonLabel}
        </>
      )}
    </Button>
  )

  const checkButtonDocDescription = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => void runAnalyze()}
      disabled={disabled || isAnalyzing || isApplyingSuggestion}
      className="flex shrink-0 items-center gap-2 rounded-lg border border-[#CED4DA] bg-[#E9ECEF] px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-none hover:bg-[#dee2e6]"
    >
      {isAnalyzing ? (
        <>
          <Spinner className="h-4 w-4 shrink-0" />
          Analyzing…
        </>
      ) : (
        <>
          <scopePrompt.Icon className="h-4 w-4 shrink-0 text-slate-700" strokeWidth={2} />
          {scopePrompt.buttonLabel}
        </>
      )}
    </Button>
  )

  if (variant === 'document-description') {
    const showOverlay = isAnalyzing || isGeneratingDescription
    return (
      <div className="space-y-3">
        <div className="relative min-w-0">
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={rows}
            disabled={disabled || isAnalyzing || isApplyingSuggestion || isGeneratingDescription}
            placeholder={
              placeholder ?? 'Describe the conflict, observation, or clarification needed...'
            }
            className={cn(
              'min-h-[200px] w-full resize-none rounded-lg border-0 bg-[#E9ECEF] px-4 py-3 text-[15px] leading-relaxed text-[#333e4f] shadow-none placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]/25',
              textareaClassName
            )}
          />
          {showOverlay ? (
            <div
              className="absolute inset-0 z-[1] flex items-center justify-center rounded-lg border border-slate-200/80 bg-[#E9ECEF]/90 backdrop-blur-[1px]"
              aria-busy="true"
              aria-live="polite"
            >
              <div className="flex max-w-sm flex-col items-center gap-2 px-4 text-center text-sm text-slate-600">
                {isGeneratingDescription ? (
                  <Loader2 className="h-7 w-7 animate-spin text-[#1d4ed8]" />
                ) : (
                  <Spinner className="h-6 w-6" />
                )}
                <span>
                  {isGeneratingDescription
                    ? 'Generating AI description...'
                    : 'Analyzing document for missing scope…'}
                </span>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-dashed border-[#CED4DA] bg-white px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#38bdf8] text-[11px] font-bold text-white shadow-sm"
              aria-hidden
            >
              i
            </span>
            <span className="text-sm font-medium leading-snug text-[#0f172a]">
              {scopePrompt.prompt}
            </span>
          </div>
          {checkButtonDocDescription}
        </div>

        {analysisError ? (
          <Alert variant="destructive" className="border-red-200 bg-red-50/95 text-red-950">
            <AlertCircle className="text-red-600" />
            <AlertTitle>Missing scope analysis</AlertTitle>
            <AlertDescription className="text-red-900/85">{analysisError}</AlertDescription>
            <div className="col-span-2 mt-3 flex flex-wrap gap-2 sm:col-start-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => void runAnalyze()}>
                Retry
              </Button>
              <Button type="button" size="sm" variant="ghost" className="text-red-900" onClick={() => setAnalysisError(null)}>
                Dismiss
              </Button>
            </div>
          </Alert>
        ) : null}

        {!isAnalyzing && analysisResult ? (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-4 border-b border-slate-100 px-4 py-5 sm:px-6 sm:py-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-1">
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                    Scope of Work AI Assistant
                  </h2>
                  <p className="text-sm text-slate-500">
                    AI-powered analysis to identify potential gaps in your scope of work
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => void runAnalyze()}
                    disabled={isApplyingSuggestion}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Regenerate
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-slate-500"
                    onClick={closePanel}
                    aria-label="Close analysis panel"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-4 px-4 py-4">
              <div>
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-900/90">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                  Potential Issues
                </p>
                {analysisResult.issues.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No issues reported for this text.</p>
                ) : (
                  <ul className="list-inside list-disc space-y-1.5 text-sm leading-relaxed text-red-950/90">
                    {analysisResult.issues.map((issue, i) => (
                      <li key={i}>{issue}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="border-t border-slate-100 pt-4">
                <p className="mb-2 text-sm font-semibold text-slate-800">Suggested Additions</p>
                {analysisResult.suggestions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No suggested text returned.</p>
                ) : (
                  <ul className="space-y-3">
                    {analysisResult.suggestions.map((suggestion, i) => (
                      ignoredSuggestionIndexes.has(i) ? null : (
                      <li
                        key={i}
                        className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50/80 p-3 sm:flex-row sm:items-start sm:justify-between"
                      >
                        <p className="min-w-0 flex-1 text-sm leading-relaxed text-slate-800">{suggestion}</p>
                        {appliedSuggestionIndexes.has(i) ? (
                          <div className="flex items-center self-start rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700 sm:self-center">
                            <CheckCircle2 className="h-7 w-7" />
                          </div>
                        ) : (
                          <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="shrink-0"
                              onClick={() => void insertSuggestion(suggestion, i)}
                              disabled={isApplyingSuggestion}
                            >
                              {isApplyingSuggestion && applyingSuggestionIndex === i ? (
                                <>
                                  <Spinner className="mr-2 h-4 w-4" />
                                  Applying…
                                </>
                              ) : (
                                'Apply'
                              )}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="shrink-0"
                              onClick={() => ignoreSuggestion(i)}
                              disabled={isApplyingSuggestion}
                            >
                              Ignore
                            </Button>
                          </div>
                        )}
                      </li>
                      )
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <div className="relative min-w-0 flex-1">
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={rows}
            disabled={disabled || isAnalyzing || isApplyingSuggestion || isGeneratingDescription}
            placeholder={placeholder}
            className={cn('min-h-[7.5rem] resize-none sm:min-h-0', textareaClassName)}
          />
          {isAnalyzing || isGeneratingDescription ? (
            <div
              className="absolute inset-0 z-[1] flex items-center justify-center rounded-lg border border-slate-200/80 bg-background/85 backdrop-blur-[1px]"
              aria-busy="true"
              aria-live="polite"
            >
              <div className="flex max-w-sm flex-col items-center gap-2 px-4 text-center text-sm text-muted-foreground">
                {isGeneratingDescription ? (
                  <Loader2 className="h-7 w-7 animate-spin text-primary" />
                ) : (
                  <Spinner className="h-6 w-6" />
                )}
                <span>
                  {isGeneratingDescription
                    ? 'Generating AI description...'
                    : 'Analyzing document for missing scope…'}
                </span>
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 sm:items-start">{checkButtonDefault}</div>
      </div>

      {analysisError ? (
        <Alert variant="destructive" className="border-red-200 bg-red-50/95 text-red-950">
          <AlertCircle className="text-red-600" />
          <AlertTitle>Missing scope analysis</AlertTitle>
          <AlertDescription className="text-red-900/85">{analysisError}</AlertDescription>
          <div className="col-span-2 mt-3 flex flex-wrap gap-2 sm:col-start-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => void runAnalyze()}>
              Retry
            </Button>
            <Button type="button" size="sm" variant="ghost" className="text-red-900" onClick={() => setAnalysisError(null)}>
              Dismiss
            </Button>
          </div>
        </Alert>
      ) : null}

      {!isAnalyzing && analysisResult ? (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-100 px-4 py-5 sm:px-6 sm:py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-1">
                <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                  Scope of Work AI Assistant
                </h2>
                <p className="text-sm text-slate-500">
                  AI-powered analysis to identify potential gaps in your scope of work
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => void runAnalyze()}
                  disabled={isApplyingSuggestion}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Regenerate
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-slate-500"
                  onClick={closePanel}
                  aria-label="Close analysis panel"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-4 px-4 py-4">
            <div>
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-900/90">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                Potential Issues
              </p>
              {analysisResult.issues.length === 0 ? (
                <p className="text-sm text-muted-foreground">No issues reported for this text.</p>
              ) : (
                <ul className="list-inside list-disc space-y-1.5 text-sm leading-relaxed text-red-950/90">
                  {analysisResult.issues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-slate-100 pt-4">
              <p className="mb-2 text-sm font-semibold text-slate-800">Suggested Additions</p>
              {analysisResult.suggestions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No suggested text returned.</p>
              ) : (
                <ul className="space-y-3">
                  {analysisResult.suggestions.map((suggestion, i) => (
                    ignoredSuggestionIndexes.has(i) ? null : (
                    <li
                      key={i}
                      className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50/80 p-3 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <p className="min-w-0 flex-1 text-sm leading-relaxed text-slate-800">{suggestion}</p>
                      {appliedSuggestionIndexes.has(i) ? (
                        <div className="flex items-center self-start rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700 sm:self-center">
                          <CheckCircle2 className="h-7 w-7" />
                        </div>
                      ) : (
                        <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="shrink-0"
                            onClick={() => void insertSuggestion(suggestion, i)}
                            disabled={isApplyingSuggestion}
                          >
                            {isApplyingSuggestion && applyingSuggestionIndex === i ? (
                              <>
                                <Spinner className="mr-2 h-4 w-4" />
                                Applying…
                              </>
                            ) : (
                              'Apply'
                            )}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="shrink-0"
                            onClick={() => ignoreSuggestion(i)}
                            disabled={isApplyingSuggestion}
                          >
                            Ignore
                          </Button>
                        </div>
                      )}
                    </li>
                    )
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
