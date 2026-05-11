export type ScheduleUnit = 'days' | 'weeks'
export type DayType = 'calendar' | 'business'
export type CostImpactType = 'increase' | 'decrease' | 'none'

function formatUsd(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function parseMoneyInput(raw: string): number {
  const n = parseFloat(String(raw).replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export type ChangeOrderScheduleState = {
  enabled: boolean
  /** Keep as string in UI; validated/parses to whole number. */
  duration: string
  unit: ScheduleUnit
  /** Required only when unit is 'days' (UI stores '' when unset). */
  dayType: DayType | ''
}

export type ChangeOrderBaselineState = {
  /** Keep as string in UI; validated/parses to whole number. */
  value: string
  unit: ScheduleUnit
  /** Required only when unit is 'days' (UI stores '' when unset). */
  dayType: DayType | ''
}

export type ChangeOrderCostState = {
  type: CostImpactType
  labor: string
  materials: string
  equipment: string
  subcontractor: string
  other: string
  /** Optional percent as string. */
  markupPercent: string
  /** Required when type is 'none'. */
  justificationNote: string
}

export type ChangeOrderImpactDerived = {
  scheduleDaysTotal: number
  baselineDaysTotal: number
  revisedDaysTotal: number | null
  costSubtotal: number
  /** Unsigned total after markup */
  costTotal: number
  /** Signed total per impact type */
  signedCostImpact: number
  revisedContractAmount: number | null
}

export type ChangeOrderImpactValidationErrors = Partial<{
  scheduleDuration: string
  scheduleDayType: string
  baselineDuration: string
  baselineDayType: string
  costAtLeastOne: string
  costJustification: string
}>

export function parseDurationDigits(raw: string): number {
  const t = String(raw ?? '').trim()
  if (!t) return Number.NaN
  const n = Number.parseInt(t.replace(/[^0-9]/g, ''), 10)
  return Number.isFinite(n) ? n : Number.NaN
}

export function normalizeDays(valueWhole: number, unit: ScheduleUnit): number {
  const v = Number.isFinite(valueWhole) ? Math.max(0, Math.floor(valueWhole)) : 0
  return unit === 'weeks' ? v * 7 : v
}

export function computeSchedule(state: ChangeOrderScheduleState): { scheduleDaysTotal: number; valid: boolean } {
  if (!state.enabled) return { scheduleDaysTotal: 0, valid: true }
  const dur = parseDurationDigits(state.duration)
  if (!Number.isFinite(dur) || dur <= 0) return { scheduleDaysTotal: 0, valid: false }
  if (state.unit === 'days' && !state.dayType) return { scheduleDaysTotal: 0, valid: false }
  return { scheduleDaysTotal: normalizeDays(dur, state.unit), valid: true }
}

export function computeBaseline(state: ChangeOrderBaselineState): { baselineDaysTotal: number; valid: boolean } {
  const dur = parseDurationDigits(state.value)
  if (!Number.isFinite(dur) || dur <= 0) return { baselineDaysTotal: 0, valid: false }
  if (state.unit === 'days' && !state.dayType) return { baselineDaysTotal: 0, valid: false }
  return { baselineDaysTotal: normalizeDays(dur, state.unit), valid: true }
}

/** Collapse legacy weeks/business-day baseline into canonical calendar-days input for the simplified CO form UI. */
export function coerceBaselineToNormalizedCalendarInput(
  baseline: ChangeOrderBaselineState,
): ChangeOrderBaselineState {
  const c = computeBaseline(baseline)
  if (!c.valid) {
    return {
      value: String(baseline.value ?? '').trim(),
      unit: 'days',
      dayType: baseline.dayType || 'calendar',
    }
  }
  return {
    value: String(c.baselineDaysTotal),
    unit: 'days',
    dayType: 'calendar',
  }
}

function parsePercent(raw: string): number | null {
  const t = String(raw ?? '').trim()
  if (!t) return null
  const n = Number.parseFloat(t.replace(/[^0-9.]/g, ''))
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

function asMoney(raw: string): number {
  const n = parseMoneyInput(raw)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function computeCost(state: ChangeOrderCostState): {
  costSubtotal: number
  costTotal: number
  signedCostImpact: number
  valid: boolean
} {
  if (state.type === 'none') {
    return {
      costSubtotal: 0,
      costTotal: 0,
      signedCostImpact: 0,
      valid: Boolean(state.justificationNote.trim()),
    }
  }

  const costSubtotal =
    asMoney(state.labor) +
    asMoney(state.materials) +
    asMoney(state.equipment) +
    asMoney(state.subcontractor) +
    asMoney(state.other)

  const markupPercent = parsePercent(state.markupPercent) ?? 0
  const costTotal = costSubtotal * (1 + markupPercent / 100)
  const signedCostImpact = state.type === 'decrease' ? -costTotal : costTotal

  const hasSomeCost = costTotal > 0.000001
  return { costSubtotal, costTotal, signedCostImpact, valid: hasSomeCost }
}

export function computeDerived(args: {
  schedule: ChangeOrderScheduleState
  baseline: ChangeOrderBaselineState
  cost: ChangeOrderCostState
  originalContractAmountRaw: string
}): ChangeOrderImpactDerived {
  const sched = computeSchedule(args.schedule)
  const base = computeBaseline(args.baseline)
  const cost = computeCost(args.cost)

  const revisedDaysTotal =
    base.valid && sched.valid ? base.baselineDaysTotal + sched.scheduleDaysTotal : null

  const originalContractAmount = parseMoneyInput(args.originalContractAmountRaw)
  const revisedContractAmount =
    Number.isFinite(originalContractAmount) && base.valid
      ? originalContractAmount + cost.signedCostImpact
      : Number.isFinite(originalContractAmount)
        ? originalContractAmount + cost.signedCostImpact
        : null

  return {
    scheduleDaysTotal: sched.scheduleDaysTotal,
    baselineDaysTotal: base.baselineDaysTotal,
    revisedDaysTotal,
    costSubtotal: cost.costSubtotal,
    costTotal: cost.costTotal,
    signedCostImpact: cost.signedCostImpact,
    revisedContractAmount,
  }
}

export function validateChangeOrderImpact(args: {
  schedule: ChangeOrderScheduleState
  baseline: ChangeOrderBaselineState
  cost: ChangeOrderCostState
}): { ok: boolean; errors: ChangeOrderImpactValidationErrors } {
  const errors: ChangeOrderImpactValidationErrors = {}

  // Baseline always required
  {
    const dur = parseDurationDigits(args.baseline.value)
    if (!Number.isFinite(dur) || dur <= 0) errors.baselineDuration = 'Enter a duration greater than 0.'
    else if (args.baseline.unit === 'days' && !args.baseline.dayType)
      errors.baselineDayType = 'Select calendar or business days.'
  }

  // Schedule only when enabled
  if (args.schedule.enabled) {
    const dur = parseDurationDigits(args.schedule.duration)
    if (!Number.isFinite(dur) || dur <= 0) errors.scheduleDuration = 'Enter a duration greater than 0.'
    else if (args.schedule.unit === 'days' && !args.schedule.dayType)
      errors.scheduleDayType = 'Select calendar or business days.'
  }

  // Cost only per type
  if (args.cost.type === 'none') {
    if (!args.cost.justificationNote.trim())
      errors.costJustification = 'Provide a justification note for no cost impact.'
  } else {
    const c = computeCost(args.cost)
    if (!c.valid) errors.costAtLeastOne = 'Enter at least one cost amount (or a non-zero total).'
  }

  return { ok: Object.keys(errors).length === 0, errors }
}

export function formatSignedUsd(unsignedTotal: number, type: CostImpactType): string {
  const n = Number.isFinite(unsignedTotal) ? unsignedTotal : 0
  if (type === 'none') return '$0.00'
  if (type === 'decrease') return `($${formatUsd(n)} credit)`
  return `$${formatUsd(n)}`
}

export function formatScheduleLabel(schedule: ChangeOrderScheduleState): string {
  if (!schedule.enabled) return 'No Impact'
  const dur = parseDurationDigits(schedule.duration)
  if (!Number.isFinite(dur) || dur <= 0) return '—'
  if (schedule.unit === 'weeks') {
    const w = Math.max(1, Math.floor(dur))
    return `+ ${w} week${w === 1 ? '' : 's'}`
  }
  const d = Math.max(1, Math.floor(dur))
  const dt = schedule.dayType || 'calendar'
  return `+ ${d} ${dt} day${d === 1 ? '' : 's'}`
}

function pickString(meta: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = meta[k]
    if (typeof v === 'string' && v.trim()) return v
  }
  return ''
}

function pickNumber(meta: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = meta[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim()) {
      const n = Number.parseFloat(v.replace(/[^0-9.-]/g, ''))
      if (Number.isFinite(n)) return n
    }
  }
  return null
}

function inferScheduleFromLegacyText(scheduleImpactRaw: string): {
  enabled: boolean
  duration: string
  unit: ScheduleUnit
  dayType: DayType | ''
} {
  const t = (scheduleImpactRaw || '').trim()
  const l = t.toLowerCase()
  if (!l || l.includes('no impact') || l === 'none') {
    return { enabled: false, duration: '', unit: 'days', dayType: '' }
  }

  // Prefer explicit weeks first.
  const w = t.match(/(\d+)\s*week/i)
  if (w?.[1]) return { enabled: true, duration: w[1], unit: 'weeks', dayType: '' }

  const m = t.match(/(\d+)\s*(?:calendar\s*)?day/i) || t.match(/^\+?\s*(\d+)\s*$/i)
  const duration = m?.[1] || ''
  const dayType: DayType =
    /\bbusiness\b/i.test(t) ? 'business' : 'calendar'
  return { enabled: true, duration, unit: 'days', dayType }
}

export function deserializeChangeOrderImpactFromMetadata(meta: Record<string, unknown>): {
  schedule: ChangeOrderScheduleState
  baseline: ChangeOrderBaselineState
  cost: ChangeOrderCostState
} {
  const scheduleEnabled =
    typeof meta.schedule_impact_enabled === 'boolean'
      ? meta.schedule_impact_enabled
      : null

  const scheduleUnitRaw = pickString(meta, 'schedule_unit')
  const scheduleUnit: ScheduleUnit =
    scheduleUnitRaw === 'weeks' ? 'weeks' : 'days'

  const scheduleDayTypeRaw = pickString(meta, 'schedule_day_type')
  const scheduleDayType: DayType | '' =
    scheduleDayTypeRaw === 'business' ? 'business' : scheduleDayTypeRaw === 'calendar' ? 'calendar' : ''

  const scheduleDurationN = pickNumber(meta, 'schedule_duration')
  const scheduleDuration = scheduleDurationN !== null ? String(Math.max(0, Math.floor(scheduleDurationN))) : ''

  const legacyScheduleImpact = pickString(meta, 'scheduleImpact', 'schedule_impact', 'scheduleImpactText', 'scheduleImpactLabel')
  const legacySchedule = inferScheduleFromLegacyText(legacyScheduleImpact)

  const schedule: ChangeOrderScheduleState =
    scheduleEnabled === null
      ? legacySchedule
      : {
          enabled: scheduleEnabled,
          duration: scheduleDuration,
          unit: scheduleUnit,
          dayType: scheduleUnit === 'weeks' ? '' : scheduleDayType,
        }

  const baselineUnitRaw = pickString(meta, 'original_duration_unit')
  const baselineUnit: ScheduleUnit = baselineUnitRaw === 'weeks' ? 'weeks' : 'days'
  const baselineDayTypeRaw = pickString(meta, 'original_day_type')
  const baselineDayType: DayType | '' =
    baselineDayTypeRaw === 'business' ? 'business' : baselineDayTypeRaw === 'calendar' ? 'calendar' : ''
  const baselineValueN = pickNumber(meta, 'original_duration_value')
  const baselineValue =
    baselineValueN !== null
      ? String(Math.max(0, Math.floor(baselineValueN)))
      : (() => {
          const legacy = pickNumber(meta, 'originalProjectDurationDays', 'original_duration_days')
          return legacy !== null ? String(Math.max(0, Math.floor(legacy))) : ''
        })()

  const baseline: ChangeOrderBaselineState = {
    value: baselineValue,
    unit: baselineUnit,
    dayType: baselineUnit === 'weeks' ? '' : baselineDayType,
  }

  const typeRaw = pickString(meta, 'cost_impact_type')
  const costImpactType: CostImpactType =
    typeRaw === 'decrease' ? 'decrease' : typeRaw === 'none' ? 'none' : 'increase'

  const labor = pickNumber(meta, 'labor_cost', 'laborCost')
  const materials = pickNumber(meta, 'materials_cost', 'materialCost', 'materialsCost')
  const equipment = pickNumber(meta, 'equipment_cost', 'equipmentCost')
  const subcontractor = pickNumber(meta, 'subcontractor_cost', 'subcontractorCost')
  const other = pickNumber(meta, 'other_cost', 'overheadProfit')

  const markupPercent = pickNumber(meta, 'markup_percent', 'markupPercent')

  // If new typed impact is missing, infer from legacy numeric presence.
  const inferredType: CostImpactType = (() => {
    if (typeRaw === 'increase' || typeRaw === 'decrease' || typeRaw === 'none') return costImpactType
    const subtotal =
      (labor ?? 0) + (materials ?? 0) + (equipment ?? 0) + (subcontractor ?? 0) + (other ?? 0)
    if (subtotal > 0) return 'increase'
    const proposedAmount = pickNumber(meta, 'proposedAmount')
    if (proposedAmount !== null && proposedAmount > 0) return 'increase'
    if (Array.isArray(meta.costBreakdownItems) && meta.costBreakdownItems.length) return 'increase'
    return 'none'
  })()

  const otherFromLegacy: number | null = (() => {
    if (other !== null) return other
    const proposedAmount = pickNumber(meta, 'proposedAmount')
    if (proposedAmount !== null && proposedAmount > 0) return proposedAmount
    if (Array.isArray(meta.costBreakdownItems)) {
      const rows = meta.costBreakdownItems as Array<Record<string, unknown>>
      const sum = rows.reduce((acc, r) => {
        const t = typeof r.total === 'number' ? r.total : typeof r.total === 'string' ? Number.parseFloat(r.total) : 0
        return acc + (Number.isFinite(t) ? t : 0)
      }, 0)
      if (sum > 0) return sum
    }
    return null
  })()

  const justification = pickString(meta, 'justification_note', 'justificationNote')

  const cost: ChangeOrderCostState = {
    type: inferredType,
    labor: labor !== null ? String(labor) : '',
    materials: materials !== null ? String(materials) : '',
    equipment: equipment !== null ? String(equipment) : '',
    subcontractor: subcontractor !== null ? String(subcontractor) : '',
    other: otherFromLegacy !== null ? String(otherFromLegacy) : '',
    markupPercent: markupPercent !== null ? String(markupPercent) : '',
    justificationNote: justification,
  }

  return { schedule, baseline, cost }
}

export function serializeChangeOrderImpactToMetadata(args: {
  schedule: ChangeOrderScheduleState
  baseline: ChangeOrderBaselineState
  cost: ChangeOrderCostState
  derived: ChangeOrderImpactDerived
  originalContractAmount: string
}): Record<string, unknown> {
  const scheduleDurWhole = args.schedule.enabled ? parseDurationDigits(args.schedule.duration) : 0
  const scheduleDuration = Number.isFinite(scheduleDurWhole) ? Math.max(0, Math.floor(scheduleDurWhole)) : 0

  const baselineWhole = parseDurationDigits(args.baseline.value)
  const baselineDuration = Number.isFinite(baselineWhole) ? Math.max(0, Math.floor(baselineWhole)) : 0

  const markupPercent = parsePercent(args.cost.markupPercent)

  const labor = asMoney(args.cost.labor)
  const materials = asMoney(args.cost.materials)
  const equipment = asMoney(args.cost.equipment)
  const subcontractor = asMoney(args.cost.subcontractor)
  const other = asMoney(args.cost.other)

  const scheduleDayType = args.schedule.unit === 'days' ? (args.schedule.dayType || null) : null
  const baselineDayType = args.baseline.unit === 'days' ? (args.baseline.dayType || null) : null

  const costType = args.cost.type
  const unsignedTotalCostImpact = args.derived.costTotal

  const originalContractAmount = args.originalContractAmount.trim()
    ? parseMoneyInput(args.originalContractAmount)
    : null
  const updatedContractValue =
    originalContractAmount !== null && Number.isFinite(originalContractAmount)
      ? originalContractAmount + args.derived.signedCostImpact
      : null

  const scheduleImpactLabel = formatScheduleLabel(args.schedule)

  return {
    // Canonical keys (snake_case)
    schedule_impact_enabled: args.schedule.enabled,
    schedule_duration: args.schedule.enabled ? scheduleDuration : 0,
    schedule_unit: args.schedule.unit,
    schedule_day_type: scheduleDayType,
    schedule_days_total: args.derived.scheduleDaysTotal,

    original_duration_value: baselineDuration || null,
    original_duration_unit: args.baseline.unit,
    original_day_type: baselineDayType,
    original_duration_days: args.derived.baselineDaysTotal,

    cost_impact_type: costType,
    labor_cost: labor,
    materials_cost: materials,
    equipment_cost: equipment,
    subcontractor_cost: subcontractor,
    other_cost: other,
    markup_percent: markupPercent,
    cost_subtotal: args.derived.costSubtotal,
    total_cost_impact: unsignedTotalCostImpact,
    justification_note: costType === 'none' ? args.cost.justificationNote.trim() : null,

    // Legacy dual-write keys used by current PDF + route mapping
    scheduleImpact: scheduleImpactLabel,
    scheduleDays: args.derived.scheduleDaysTotal,
    originalProjectDurationDays: args.derived.baselineDaysTotal,
    revisedProjectDurationDays: args.derived.revisedDaysTotal ?? undefined,

    primeContractValue: originalContractAmount ?? undefined,
    updatedContractValue: updatedContractValue ?? undefined,

    proposedAmount: costType === 'decrease' ? -unsignedTotalCostImpact : unsignedTotalCostImpact,

    // Existing PDF route already forwards these names.
    laborCost: labor,
    materialCost: materials,
    equipmentCost: equipment,
    subcontractorCost: subcontractor,
    overheadProfit: other,
  }
}

