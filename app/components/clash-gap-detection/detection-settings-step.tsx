'use client'

import type { DetectionSettings } from '@/lib/clash-gap-types'
import { formatSettingsStepLabel } from '@/lib/clash-gap-step-labels'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SlidersHorizontal } from 'lucide-react'

export function DetectionSettingsStep(props: {
  settings: DetectionSettings
  onSettingsChange: (settings: DetectionSettings) => void
}) {
  const { settings, onSettingsChange } = props
  const patch = (partial: Partial<DetectionSettings>) =>
    onSettingsChange({ ...settings, ...partial })

  return (
    <div className="flex flex-col gap-6">
      <Card className="rounded-2xl border-[#e2e8f0] shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-3 text-lg">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-100">
              <SlidersHorizontal
                className="h-[22px] w-[22px] text-orange-500"
                strokeWidth={2.25}
                aria-hidden
              />
            </span>
            Detection settings
          </CardTitle>
          <p className="text-sm text-[#64748b]">
            Choose what to scan for and how strictly the AI flags potential issues. You can change
            these anytime before running detection.
          </p>
        </CardHeader>
        <CardContent className="grid gap-6 px-6 pb-6 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label className="text-[11px] font-bold uppercase tracking-[0.12em] text-orange-600">
              What to detect
            </Label>
            <Select
              value={settings.mode}
              onValueChange={(v) =>
                patch({ mode: v as DetectionSettings['mode'] })
              }
            >
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="both">Gaps and conflicts</SelectItem>
                <SelectItem value="gaps">Gaps only</SelectItem>
                <SelectItem value="conflicts">Conflicts only</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-[#64748b]">
              Gaps compare drawings to specs; conflicts find coordination problems between sheets.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-[11px] font-bold uppercase tracking-[0.12em] text-orange-600">
              Sensitivity
            </Label>
            <Select
              value={settings.sensitivity}
              onValueChange={(v) =>
                patch({ sensitivity: v as DetectionSettings['sensitivity'] })
              }
            >
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low — fewer, higher-confidence flags</SelectItem>
                <SelectItem value="medium">Medium — balanced</SelectItem>
                <SelectItem value="high">High — more thorough review</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-[11px] font-bold uppercase tracking-[0.12em] text-orange-600">
              Scope
            </Label>
            <Select
              value={settings.scope}
              onValueChange={(v) =>
                patch({ scope: v as DetectionSettings['scope'] })
              }
            >
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="entire_project">Entire project</SelectItem>
                <SelectItem value="selected_trades">Selected trades only</SelectItem>
                <SelectItem value="selected_documents">Selected documents only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-[11px] font-bold uppercase tracking-[0.12em] text-orange-600">
              RFI draft length
            </Label>
            <Select
              value={settings.rfiFormat}
              onValueChange={(v) =>
                patch({ rfiFormat: v as DetectionSettings['rfiFormat'] })
              }
            >
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="short">Short</SelectItem>
                <SelectItem value="detailed">Detailed</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-[#64748b]">
              Default wording when you generate an RFI from a detected issue.
            </p>
          </div>
        </CardContent>
      </Card>

      <p className="rounded-xl border border-[#e2e8f0] bg-white px-4 py-3 text-sm text-[#475569]">
        <span className="font-medium text-[#0f172a]">Current summary:</span>{' '}
        {formatSettingsStepLabel(settings)}
      </p>
    </div>
  )
}
