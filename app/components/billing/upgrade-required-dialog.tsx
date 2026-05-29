'use client'

import Link from 'next/link'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export function UpgradeRequiredDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  message: string
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upgrade required</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-600">{props.message}</p>
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Not now
          </Button>
          <Button asChild className="bg-violet-600 text-white hover:bg-violet-700">
            <Link href="/billing">View plans</Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

