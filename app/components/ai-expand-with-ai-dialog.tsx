'use client'

import { useEffect, useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'

export type AiExpandDocumentType = 'RFI' | 'ChangeOrder' | 'Submittal'

type AiGenerateResponse = { generatedContent: string; usageCountThisPeriod?: number | null }

export function AiExpandWithAiDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  documentType: AiExpandDocumentType
  initialDescription: string
  onApply: (generatedText: string) => void
}) {
  const { open, onOpenChange, documentType, initialDescription, onApply } = props
  const [draftDescription, setDraftDescription] = useState('')
  const [preview, setPreview] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)

  useEffect(() => {
    if (open) {
      setDraftDescription(initialDescription)
      setPreview('')
    }
  }, [open, initialDescription])

  const runGenerate = async () => {
    if (!draftDescription.trim()) {
      toast.error('Add a description to expand')
      return
    }
    setIsGenerating(true)
    try {
      const data = await apiFetch<AiGenerateResponse>('/api/ai/generate', {
        method: 'POST',
        json: {
          documentType,
          description: draftDescription.trim(),
        },
      })
      setPreview(data.generatedContent?.trim() || '')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'AI generation temporarily unavailable. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleApply = () => {
    if (!preview.trim()) {
      toast.error('Generate content first')
      return
    }
    onApply(preview)
    onOpenChange(false)
    toast.success('Description updated')
  }

  return (
    <Drawer direction="right" open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="ml-auto flex h-full max-w-[95vw] flex-col overflow-hidden p-0 data-[vaul-drawer-direction=right]:w-[640px] sm:data-[vaul-drawer-direction=right]:max-w-none">
        <DrawerHeader className="relative border-b border-border px-6 py-4 text-left">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-4 top-4 h-8 w-8"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
          <DrawerTitle>Generate with AI</DrawerTitle>
          <DrawerDescription>
            Review or edit your draft, then generate polished body text. You can regenerate, apply it to your form,
            or cancel.
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <Textarea
              value={draftDescription}
              onChange={(e) => setDraftDescription(e.target.value)}
              rows={5}
              className="resize-none text-[15px] leading-relaxed"
              disabled={isGenerating}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void runGenerate()} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Spinner className="mr-2" />
                  Generating…
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate
                </>
              )}
            </Button>
            {preview ? (
              <Button type="button" variant="secondary" onClick={() => void runGenerate()} disabled={isGenerating}>
                Regenerate
              </Button>
            ) : null}
          </div>
          {preview ? (
            <div className="space-y-2">
              <label className="text-sm font-medium">Generated preview</label>
              <div className="max-h-48 overflow-y-auto rounded-md border border-border bg-muted/40 px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">
                {preview}
              </div>
            </div>
          ) : null}
        </div>
        <DrawerFooter className="flex-row items-center justify-end gap-3 border-t border-border px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>
            Cancel
          </Button>
          <Button type="button" onClick={handleApply} disabled={isGenerating || !preview.trim()}>
            Apply
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
