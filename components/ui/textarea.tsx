import * as React from 'react'

import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content min-h-[4.5rem] w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm leading-relaxed text-[#374151] shadow-none outline-none transition-[color,box-shadow,border-color]',
        'placeholder:text-[#9ca3af]',
        'focus-visible:border-primary/45 focus-visible:ring-2 focus-visible:ring-primary/20',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-400 dark:focus-visible:ring-[#60a5fa]/25',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
