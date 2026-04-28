import * as React from 'react'

import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-10 min-h-10 w-full min-w-0 rounded-xl border border-border bg-white px-3.5 py-2 text-sm leading-normal text-[#374151] shadow-none outline-none transition-[color,box-shadow,border-color]',
        'placeholder:text-[#9ca3af]',
        'selection:bg-primary selection:text-primary-foreground',
        'file:inline-flex file:h-7 file:border-0 file:bg-transparent file:pr-3 file:text-sm file:font-medium file:text-foreground',
        'focus-visible:border-primary/45 focus-visible:ring-2 focus-visible:ring-primary/20',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        'dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-400 dark:focus-visible:ring-[#60a5fa]/25',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
