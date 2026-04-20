import * as React from 'react'

import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content min-h-[4.5rem] w-full rounded-[6px] border border-[#DEE2E6] bg-[#E9ECEF] px-4 py-2.5 text-sm leading-relaxed text-[#495057] shadow-none outline-none transition-[color,box-shadow,border-color]',
        'placeholder:text-[#6C757D]',
        'focus-visible:border-[#adb5bd] focus-visible:ring-2 focus-visible:ring-[#2563eb]/20',
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
