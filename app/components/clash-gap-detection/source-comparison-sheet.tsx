'use client'

import type { ClashGapIssue } from '@/lib/clash-gap-types'
import { HighlightedExcerpt } from '@/app/components/clash-gap-detection/highlighted-excerpt'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

export function SourceComparisonSheet(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  issue: ClashGapIssue | null
}) {
  const { open, onOpenChange, issue } = props

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-3xl">
        <SheetHeader className="border-b border-border p-6">
          <SheetTitle>Source comparison</SheetTitle>
          <SheetDescription>
            Side-by-side excerpts from your uploaded documents. No model coordinates — review is
            text-forward only.
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-0 overflow-auto p-6">
          {!issue ? (
            <p className="text-muted-foreground text-sm">Select an issue to compare sources.</p>
          ) : (
            <>
              <p className="mb-4 text-sm font-medium text-foreground">{issue.title}</p>
              <div
                className={cn(
                  'grid gap-4',
                  issue.sources.length > 1 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1',
                )}
              >
                {issue.sources.map((src, idx) => (
                  <div
                    key={`${src.documentLabel}-${String(src.page)}-${idx}`}
                    className="flex flex-col gap-2 rounded-xl border border-border bg-muted/40 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] dark:bg-muted/20"
                  >
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Source {idx + 1}
                    </div>
                    <div className="text-sm font-semibold text-foreground">{src.documentLabel}</div>
                    <div className="text-muted-foreground text-xs">Page {src.page}</div>
                    <p className="text-sm leading-relaxed text-foreground">
                      <HighlightedExcerpt
                        text={src.excerpt}
                        highlight={src.highlight}
                        variant={idx % 2 === 0 ? 'amber' : 'red'}
                      />
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
