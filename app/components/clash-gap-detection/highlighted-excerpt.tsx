'use client'

import { cn } from '@/lib/utils'

export function HighlightedExcerpt(props: {
  text: string
  highlight?: string
  variant?: 'amber' | 'fuchsia' | 'red'
}) {
  const { text, highlight, variant = 'amber' } = props
  if (!highlight?.length) return <>{text}</>
  const i = text.indexOf(highlight)
  if (i < 0) return <>{text}</>
  const markClass =
    variant === 'red'
      ? 'rounded-sm bg-red-100 px-0.5 text-red-950 dark:bg-red-950/45 dark:text-red-50'
      : variant === 'fuchsia'
        ? 'rounded-sm bg-fuchsia-100 px-0.5 text-foreground dark:bg-fuchsia-950/55'
        : 'rounded-sm bg-amber-200/90 px-0.5 text-foreground dark:bg-amber-900/45'
  return (
    <>
      {text.slice(0, i)}
      <mark className={cn(markClass)}>{highlight}</mark>
      {text.slice(i + highlight.length)}
    </>
  )
}
