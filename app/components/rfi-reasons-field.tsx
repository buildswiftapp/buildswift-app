'use client'

import * as React from 'react'
import { ChevronDown, X } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { RFI_REASON_OPTIONS, RFI_REASON_OTHER_LABEL } from '@/lib/rfi-reasons'

const labelClass =
  'mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748b]'

/**
 * Multi-select dropdown for "Reason for Request". Renders as a Select-style
 * trigger button that opens a popover containing checkboxes for each canonical
 * reason plus an "Other (specify)" row that reveals a free-text input. The
 * trigger summarizes the selection ("Select reasons...", "Drawing Conflict",
 * or "N selected") so the field stays a single row in the form.
 */
export function RfiReasonsField(props: {
  selected: string[]
  other: string
  onSelectedChange: (next: string[]) => void
  onOtherChange: (next: string) => void
  className?: string
  showLabel?: boolean
}) {
  const { selected, other, onSelectedChange, onOtherChange, className, showLabel = true } = props
  const [open, setOpen] = React.useState(false)
  const otherChecked = selected.includes(RFI_REASON_OTHER_LABEL)

  const toggle = (label: string, checked: boolean) => {
    if (checked) {
      if (!selected.includes(label)) onSelectedChange([...selected, label])
    } else {
      onSelectedChange(selected.filter((l) => l !== label))
      if (label === RFI_REASON_OTHER_LABEL) onOtherChange('')
    }
  }

  const triggerSummary = (() => {
    if (selected.length === 0) return 'Select reasons...'
    if (selected.length === 1) {
      const only = selected[0]
      if (only === RFI_REASON_OTHER_LABEL && other.trim()) return `Other: ${other.trim()}`
      return only
    }
    return `${selected.length} selected`
  })()

  const clearAll = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onSelectedChange([])
    onOtherChange('')
  }

  const hasSelection = selected.length > 0

  return (
    <div className={cn('w-full', className)}>
      {showLabel ? (
        <label className={labelClass}>Reason for request (mark all that apply)</label>
      ) : null}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={open}
            className={cn(
              'flex h-10 min-h-10 w-full items-center justify-between gap-2 rounded-xl border border-border bg-white px-3.5 py-2 text-sm shadow-none outline-none transition-[color,box-shadow,border-color]',
              'hover:bg-muted',
              'focus-visible:border-primary/45 focus-visible:ring-2 focus-visible:ring-primary/20',
              hasSelection ? 'text-[#374151]' : 'text-[#9ca3af]'
            )}
          >
            <span className="line-clamp-1 text-left">{triggerSummary}</span>
            <span className="flex shrink-0 items-center gap-1 text-[#9ca3af]">
              {hasSelection ? (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="Clear selected reasons"
                  onClick={clearAll}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') clearAll(e)
                  }}
                  className="rounded p-0.5 hover:bg-[#f1f5f9] hover:text-[#374151]"
                >
                  <X className="size-4" />
                </span>
              ) : null}
              <ChevronDown className="size-4" />
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="z-50 w-[var(--radix-popover-trigger-width)] min-w-[280px] p-2"
        >
          <div
            role="group"
            aria-label="Reason for request — mark all that apply"
            className="space-y-0.5"
          >
            {RFI_REASON_OPTIONS.map((opt) => {
              const isChecked = selected.includes(opt.label)
              const id = `rfi-reason-${opt.value}`
              return (
                <label
                  key={opt.value}
                  htmlFor={id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm leading-tight text-[#0f172a] hover:bg-[#f1f5f9]"
                >
                  <Checkbox
                    id={id}
                    checked={isChecked}
                    onCheckedChange={(c) => toggle(opt.label, c === true)}
                  />
                  <span>{opt.label}</span>
                </label>
              )
            })}
            <label
              htmlFor="rfi-reason-other"
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm leading-tight text-[#0f172a] hover:bg-[#f1f5f9]"
            >
              <Checkbox
                id="rfi-reason-other"
                checked={otherChecked}
                onCheckedChange={(c) => toggle(RFI_REASON_OTHER_LABEL, c === true)}
              />
              <span>Other (specify)</span>
            </label>
            {otherChecked ? (
              <div className="mt-1 px-1.5 pb-0.5">
                <Input
                  value={other}
                  onChange={(e) => onOtherChange(e.target.value)}
                  placeholder="Describe the reason"
                  className="h-8 w-full text-xs"
                />
              </div>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
