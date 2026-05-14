import type {
  ClashGapIssue,
  DetectionSettings,
  DocumentUploadRow,
  IssueType,
} from '@/lib/clash-gap-types'

function hashSeed(input: string): number {
  let h = 0
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(31, h) + input.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

function pick<T>(seed: number, items: readonly T[]): T {
  return items[seed % items.length]
}

/** Stub page counts from filename / fake parse */
export function stubPagesForFilename(name: string): number {
  const base = hashSeed(name.toLowerCase())
  return 4 + (base % 45)
}

function issueShouldInclude(type: IssueType, settings: DetectionSettings): boolean {
  if (settings.mode === 'both') return true
  if (settings.mode === 'gaps') return type === 'missing' || type === 'verified'
  return type === 'conflict' || type === 'verified'
}

const DISCIPLINES = ['Structural', 'Architectural', 'MEP', 'Civil', 'General'] as const
const CATEGORIES = [
  'Concrete',
  'Waterproofing',
  'Coordination',
  'Fire protection',
  'Envelope',
  'Finishes',
  'Metal',
  'Wood/plastic',
  'Electrical',
  'Mechanical',
] as const

type Template = Omit<
  ClashGapIssue,
  'id' | 'relatedIssueIds' | 'discipline' | 'category' | 'rationale'
> & {
  discipline: (typeof DISCIPLINES)[number]
  category: (typeof CATEGORIES)[number]
  rationale: string
}

function templatesFromContext(
  planLabel: string,
  specLabel: string,
  addendumLabel: string,
  sensitivityNote: string,
  s: number,
  rows: DocumentUploadRow[],
  settings: DetectionSettings,
): { conflict: Template[]; missing: Template[]; verified: Template[] } {
  const strip = (fn: string) => fn.replace(/\.[^.]+$/, '')

  const conflict: Template[] = [
    {
      type: 'conflict',
      title: 'Slab thickness conflict',
      summary: `Specification and drawing narrative differ on slab thickness. ${sensitivityNote}`,
      confidence: pick(s++, ['high', 'medium'] as const),
      severity: 'high',
      discipline: 'Structural',
      category: 'Concrete',
      rationale:
        'Numerical requirements for the same assembly differ between the referenced spec section and the structural detail. Request a single governing dimension for construction.',
      sources: [
        {
          documentLabel: strip(specLabel),
          page: pick(s++, [14, 16, 18]),
          excerpt:
            'Minimum slab thickness shall be 8 inches for level 3 elevated slabs unless noted otherwise on structural drawings.',
          highlight: '8 inches',
        },
        {
          documentLabel: `Detail sheet (${strip(planLabel)})`,
          page: pick(s++, ['S3.1', 'S3.2', 12]),
          excerpt:
            'TYP SLAB SECTION: STRUCTURAL SLAB 10 in. THICK AT GRIDLINE C–D PER COORDINATION WITH ARCH.',
          highlight: '10 in.',
        },
      ],
    },
    {
      type: 'conflict',
      title: 'Reinforcement cover vs clear span note',
      summary: 'Spec minimum cover conflicts with note on drawing grid D-E regarding bar placement at supports.',
      confidence: 'medium',
      severity: 'medium',
      discipline: 'Structural',
      category: 'Concrete',
      rationale:
        'Conflicting minimum cover and support zone notes can change lap lengths and chair spacing. Confirm coordinated reinforcement requirements.',
      sources: [
        {
          documentLabel: strip(specLabel),
          page: pick(s++, [20, 21]),
          excerpt: 'Concrete cover to reinforcement shall be **1-1/2 in.** minimum unless detail shows otherwise.',
          highlight: '1-1/2 in.',
        },
        {
          documentLabel: strip(planLabel),
          page: pick(s++, ['S4.2', 15]),
          excerpt: 'At drop panels use **2 in.** min cover to satisfy fire rating coordination per arch RFI-112.',
          highlight: '2 in.',
        },
      ],
    },
    {
      type: 'conflict',
      title: 'Slab opening mesh vs deck joint',
      summary: 'Drawing implies continuous deck; spec requires mesh at openings not shown on structural plan.',
      confidence: 'medium',
      severity: 'high',
      discipline: 'Structural',
      category: 'Coordination',
      rationale:
        'Field layout depends on whether supplementary mesh is required at MEP sleeves. Align drawing and spec language.',
      sources: [
        { documentLabel: strip(planLabel), page: 7, excerpt: 'Deck as shown; no additional mesh at slab openings.' },
        {
          documentLabel: strip(specLabel),
          page: 34,
          excerpt: 'Provide mesh **per 03 20 00** at all openings > 12 in.',
          highlight: 'all openings',
        },
      ],
    },
    {
      type: 'conflict',
      title: 'Anchorage embed depth',
      summary: 'Handrail embed schedule shows 5 in. embed; spec table requires 6 in. for seismic applications.',
      confidence: 'high',
      severity: 'medium',
      discipline: 'Architectural',
      category: 'Metal',
      rationale:
        'Seismic anchorage is code-sensitive. Harmonize schedule and spec table before shop drawing review.',
      sources: [
        {
          documentLabel: strip(planLabel),
          page: 'A801',
          excerpt: 'HANDRAIL POST EMBED **5 in.** TYP INTO CONCRETE CURB.',
          highlight: '5 in.',
        },
        {
          documentLabel: `${strip(specLabel)} (refs)`,
          page: pick(s++, [55, 56]),
          excerpt: 'Posts in SDC C or higher: **minimum 6-inch** embed unless approved anchor calc on file.',
          highlight: 'minimum 6-inch',
        },
      ],
    },
    {
      type: 'conflict',
      title: 'Curtain wall sill pan slope',
      summary: 'Elevation shows level sill; waterproofing details require 1/4 in. per ft slope to weeps.',
      confidence: 'medium',
      severity: 'medium',
      discipline: 'Architectural',
      category: 'Envelope',
      rationale:
        'Drainage performance depends on coordinated sill geometry. Resolve level line vs sloped pan detail.',
      sources: [
        { documentLabel: strip(planLabel), page: 'A301', excerpt: 'CURTAIN WALL SILL **LEVEL** TO MATCH INTERIOR FFL.' },
        {
          documentLabel: strip(specLabel),
          page: 92,
          excerpt: 'Sill pans shall slope **not less than 1/4 in. per foot** toward weep locations.',
          highlight: '1/4 in. per foot',
        },
      ],
    },
    {
      type: 'conflict',
      title: 'Ventilation CFM vs diffuser count',
      summary: 'Mechanical schedule total CFM exceeds sum implied by reflected ceiling plan diffuser layout.',
      confidence: pick(s++, ['low', 'medium'] as const),
      severity: 'low',
      discipline: 'MEP',
      category: 'Mechanical',
      rationale:
        'Air balance and ceiling coordination need matching device counts. Confirm final CFM allocation per zone.',
      sources: [
        {
          documentLabel: 'Mechanical schedules (from bundle)',
          page: pick(s++, [3, 4]),
          excerpt: 'TOTAL SUPPLY **12,400 CFM** for Level 2 west zone.',
          highlight: '12,400 CFM',
        },
        {
          documentLabel: strip(planLabel),
          page: 'Reflected ceiling',
          excerpt: 'Eighteen (18) diffusers shown; typical device **600 CFM max** per schedule footnote.',
          highlight: '600 CFM max',
        },
      ],
    },
  ]

  const missing: Template[] = [
    {
      type: 'missing',
      title: 'Vapor retarder continuity',
      summary:
        'Spec calls for vapor retarder below slab-on-grade but reviewed sheets do not depict lap at footing.',
      confidence: 'high',
      severity: 'medium',
      discipline: 'Structural',
      category: 'Concrete',
      rationale:
        'Without a detail, field crews cannot verify laps and transitions. Request a footing/slab interface detail.',
      sources: [
        {
          documentLabel: strip(specLabel),
          page: pick(s++, [22, 24]),
          excerpt: 'Vapor retarder shall be continuous under all slabs-on-grade… lap minimum 6 in. sealed per manufacturer.',
        },
        {
          documentLabel: strip(planLabel),
          page: pick(s++, [6, 'A501']),
          excerpt: '(No vapor retarder lap or footing transition detail located in reviewed sheets.)',
        },
      ],
    },
    {
      type: 'missing',
      title: 'Firestopping at MEP bundle',
      summary: 'Specifier references tested system at sleeve bundle; no detail at grid intersection on sheets.',
      confidence: 'medium',
      severity: 'high',
      discipline: 'MEP',
      category: 'Fire protection',
      rationale:
        'UL system selection requires geometry and packing details. Add a typical large-opening firestop detail.',
      sources: [
        {
          documentLabel: 'Life safety notes',
          page: 2,
          excerpt: 'Provide **UL-listed** firestopping at penetrations; refer to arch for rated walls.',
          highlight: 'UL-listed',
        },
        { documentLabel: strip(planLabel), page: 14, excerpt: '(Penetration cluster at Grid 4/D not detailed.)' },
      ],
    },
    {
      type: 'missing',
      title: 'Roof drain leader routing',
      summary: 'Structural roof plan shows drain locations; no interior leader path on reviewed arch sheets.',
      confidence: 'medium',
      severity: 'medium',
      discipline: 'Architectural',
      category: 'Envelope',
      rationale:
        'Plumbing rough-in needs coordinated horizontal leader routing above ceiling. Missing path may drive conflicts in MEP rack.',
      sources: [
        {
          documentLabel: strip(planLabel),
          page: 'SD-01',
          excerpt: 'PRIMARY DRAINS AS SCHEDULED.',
        },
        { documentLabel: 'Arch interior plans', page: 21, excerpt: '(No leader routing callout for drains 1–6 located.)' },
      ],
    },
    {
      type: 'missing',
      title: 'Control joint spacing — interior slab',
      summary: 'Structural general notes require joints; finish floor plan lacks joint layout for polished areas.',
      confidence: 'high',
      severity: 'low',
      discipline: 'Architectural',
      category: 'Finishes',
      rationale:
        'Polished concrete requires coordinated joint pattern. Request joint layout or defer to structural release.',
      sources: [
        {
          documentLabel: strip(specLabel),
          page: 61,
          excerpt: 'Provide control joints per ACI 302; **max spacing 15 ft** unless calc on file.',
          highlight: 'max spacing 15 ft',
        },
        { documentLabel: strip(planLabel), page: 18, excerpt: '(Interior FF plan does not show slab control joints.)' },
      ],
    },
    {
      type: 'missing',
      title: 'GFCI protection — spec vs panel schedule',
      summary: 'Spec lists additional GFCI locations beyond those noted on panel schedule excerpt.',
      confidence: 'medium',
      severity: 'low',
      discipline: 'MEP',
      category: 'Electrical',
      rationale:
        'Code minimums and owner standards may differ. Clarify which device count governs bid and submittal.',
      sources: [
        {
          documentLabel: 'Electrical specs (excerpt)',
          page: 104,
          excerpt: 'GFCI protection at **all wet walls** and mop sinks per NEC and local amendment.',
          highlight: 'all wet walls',
        },
        { documentLabel: 'Panel schedule (upload)', page: 'E2.1', excerpt: 'GFCI noted at selected breakers only.' },
      ],
    },
    {
      type: 'missing',
      title: 'Expansion joint cover — fire rating',
      summary: 'Architectural finish spec references rated cover; structural joint index lists non-rated assembly.',
      confidence: 'medium',
      severity: 'high',
      discipline: 'Architectural',
      category: 'Coordination',
      rationale:
        'Rated expansion joint covers affect cost and lead time. Confirm rated assembly for rated barrier line.',
      sources: [
        {
          documentLabel: strip(specLabel),
          page: 118,
          excerpt: 'Joint covers at rated walls shall maintain **fire rating** continuity.',
          highlight: 'fire rating',
        },
        {
          documentLabel: strip(planLabel),
          page: 'J-Index',
          excerpt: 'Joint J-12: **nominal non-rated** cover per manufacturer cut sheet (pre-bid).',
          highlight: 'non-rated',
        },
      ],
    },
    {
      type: 'missing',
      title: 'Temporary shoring release agent',
      summary: 'Structural note references release agent; finish spec prohibits residue on exposed soffit.',
      confidence: 'low',
      severity: 'low',
      discipline: 'General',
      category: 'Concrete',
      rationale:
        'Conflict can affect exposed concrete appearance. Clarify acceptable product and cleaning method.',
      sources: [
        { documentLabel: strip(planLabel), page: 'GN-3', excerpt: 'Approved form release per **structural notes**.' },
        {
          documentLabel: strip(specLabel),
          page: 44,
          excerpt: 'Exposed soffits shall be **free of form release residue** visible at 10 ft.',
          highlight: 'free of form release residue',
        },
      ],
    },
    {
      type: 'missing',
      title: 'Thermal barrier at foam plastic',
      summary: 'Envelope detail shows continuous insulation; referenced section omits thermal barrier note at corner.',
      confidence: 'medium',
      severity: 'medium',
      discipline: 'Architectural',
      category: 'Envelope',
      rationale:
        'Code-triggered thermal barrier requirements for foam plastic may be missing at building corner condition.',
      sources: [
        {
          documentLabel: strip(planLabel),
          page: 'A602',
          excerpt: 'CI as shown; refer to specifications for fire/thermal requirements.',
        },
        { documentLabel: strip(specLabel), page: 137, excerpt: '(Corner condition not explicitly detailed in reviewed pages.)' },
      ],
    },
    {
      type: 'missing',
      title: 'Seismic restraint — cable tray',
      summary: 'Mechanical spec requires restraint; tray route on plan shows long unsupported span callout missing.',
      confidence: 'medium',
      severity: 'medium',
      discipline: 'MEP',
      category: 'Mechanical',
      rationale:
        'Seismic bracing shop drawings need anchor points. Request typical restraint detail for cable tray runs.',
      sources: [
        {
          documentLabel: 'Mechanical spec excerpt',
          page: 28,
          excerpt: 'Restrain **all cable trays** ≥6 in. wide per ASCE 7 bracing requirements.',
          highlight: 'all cable trays',
        },
        { documentLabel: strip(planLabel), page: 41, excerpt: '(Tray run B-12 to B-18: no restraint notation on plan.)' },
      ],
    },
    {
      type: 'missing',
      title: 'Window washing tie-off',
      summary: 'Roof plan shows davit locations; safety spec requires certified tie-off detail at each location.',
      confidence: 'high',
      severity: 'low',
      discipline: 'Architectural',
      category: 'Coordination',
      rationale:
        'Fall protection during maintenance needs engineered tie-off. Add detail or reference approved system.',
      sources: [
        { documentLabel: 'Roof plan', page: 'SD-04', excerpt: 'Davits as scheduled; refer to spec.' },
        {
          documentLabel: strip(specLabel),
          page: 201,
          excerpt: 'Provide **engineered** tie-offs at all roof equipment and davit locations.',
          highlight: 'engineered',
        },
      ],
    },
    {
      type: 'missing',
      title: 'Selected-documents-only scope caveat',
      summary:
        settings.scope === 'selected_documents'
          ? 'Issues are limited to labeled uploads only; other contract documents were not scanned.'
          : 'Cross-discipline narrative checked across uploaded bundles in this workspace.',
      confidence: 'high',
      severity: 'low',
      discipline: 'General',
      category: 'Coordination',
      rationale:
        settings.scope === 'selected_documents'
          ? 'This entry records the analysis boundary so reviewers know what was excluded from the scan.'
          : 'Confirms the run included all uploaded bundles for basic cross-reference alignment.',
      sources: rows.slice(0, Math.min(2, rows.length)).map((r, i) => ({
        documentLabel: `${r.filename} (${r.type.replace(/_/g, ' ')})`,
        page: stubPagesForFilename(r.filename),
        excerpt:
          i === 0
            ? 'Referenced as primary basis for contradiction checks in this run.'
            : 'Included for specification and drawing crossover.',
      })),
    },
  ]

  const verified: Template[] = [
    {
      type: 'verified',
      title: `${strip(addendumLabel)} aligns with waterproofing notes`,
      summary:
        'Addendum updates membrane; drawings reference revised product line consistently on reviewed sheets.',
      confidence: 'high',
      severity: 'low',
      discipline: 'Architectural',
      category: 'Waterproofing',
      rationale:
        'No actionable conflict detected in reviewed excerpts: addendum change is echoed in drawing notes.',
      sources: [
        {
          documentLabel: addendumLabel,
          page: 3,
          excerpt: 'Replace Section 071216 fluid-applied membrane with Approved Equal List Item W-07.',
        },
        {
          documentLabel: strip(planLabel),
          page: pick(s++, [9, 11]),
          excerpt: 'WATERPROOFING: FLUID-APPLIED SYSTEM PER ADDENDUM W-07 MANUFACTURER SUBMITTAL.',
          highlight: 'ADDENDUM W-07',
        },
      ],
    },
    {
      type: 'verified',
      title: 'Structural load path callouts match general notes',
      summary: 'Brace frame designations on plan match legend and general structural notes index.',
      confidence: 'high',
      severity: 'low',
      discipline: 'Structural',
      category: 'Coordination',
      rationale:
        'Reviewed identifiers are internally consistent between plan graphics and note block references.',
      sources: [
        {
          documentLabel: strip(planLabel),
          page: 2,
          excerpt: 'Brace frame type **BF-1** typical as defined in structural general notes.',
          highlight: 'BF-1',
        },
        {
          documentLabel: strip(planLabel),
          page: pick(s++, ['S1.0', 3]),
          excerpt: 'Legend: BF-1 corresponds to detail **S8.1** for connection typology.',
          highlight: 'S8.1',
        },
      ],
    },
    {
      type: 'verified',
      title: 'Door hardware set schedule cross-check',
      summary: 'Hardware sets cited on door schedule match index in specifications for reviewed door types.',
      confidence: 'medium',
      severity: 'low',
      discipline: 'Architectural',
      category: 'Finishes',
      rationale:
        'Matched hardware group references between schedule and spec tables for the sampled door types.',
      sources: [
        {
          documentLabel: 'Door schedule',
          page: pick(s++, ['A501', 44]),
          excerpt: 'Door Type **A-101**: HW Group **3**.',
          highlight: 'HW Group 3',
        },
        {
          documentLabel: strip(specLabel),
          page: 167,
          excerpt: 'Group 3 includes mortise lockset and closer as tabulated for Group 3.',
          highlight: 'Group 3',
        },
      ],
    },
    {
      type: 'verified',
      title: 'Commissioning scope references aligned',
      summary: 'Mechanical drawing note references CX spec section that appears in uploaded spec bundle.',
      confidence: 'medium',
      severity: 'low',
      discipline: 'MEP',
      category: 'Mechanical',
      rationale:
        'Cross-reference strings match between drawing note block and specification section identifier.',
      sources: [
        {
          documentLabel: 'Mechanical plans',
          page: 6,
          excerpt: 'Commissioning per **Section 23 08 00** prior to substantial completion.',
          highlight: 'Section 23 08 00',
        },
        {
          documentLabel: strip(specLabel),
          page: pick(s++, [210, 212]),
          excerpt: 'SECTION 23 08 00 COMMISSIONING OF HVAC – scope as shown.',
          highlight: 'COMMISSIONING',
        },
      ],
    },
    {
      type: 'verified',
      title: 'Lighting fixture type tags consistent',
      summary: 'RCP tags reference fixture types that match electrical fixture schedule symbols.',
      confidence: 'high',
      severity: 'low',
      discipline: 'MEP',
      category: 'Electrical',
      rationale:
        'Sampled fixture tags on ceiling plan align with type codes in fixture schedule header.',
      sources: [
        {
          documentLabel: 'RC plan excerpt',
          page: 12,
          excerpt: 'Fixture type **L2A** at open office zones as scheduled.',
          highlight: 'L2A',
        },
        {
          documentLabel: 'Fixture schedule',
          page: 'E3.0',
          excerpt: 'Type L2A: 2x4 LED troffer, performance as specified.',
          highlight: 'L2A',
        },
      ],
    },
    {
      type: 'verified',
      title: 'Occupant load factors footnote',
      summary: 'Architectural life-safety plan footnote matches building code summary occupant load assumptions.',
      confidence: 'medium',
      severity: 'low',
      discipline: 'Architectural',
      category: 'Coordination',
      rationale:
        'Net vs gross area factors for assembly spaces are stated consistently in sampled notes.',
      sources: [
        {
          documentLabel: strip(planLabel),
          page: 'LS-1',
          excerpt: 'Occupant loads calculated per **Chapter 10** factors for assembly use.',
          highlight: 'Chapter 10',
        },
        {
          documentLabel: 'Code summary sheet',
          page: 1,
          excerpt: 'Assembly areas per Table 1004.5 as noted on life-safety plans.',
          highlight: 'Table 1004.5',
        },
      ],
    },
    {
      type: 'verified',
      title: 'Elevator machine room ventilation note',
      summary: 'Architectural room data matches mechanical note for minimum outdoor air at machine room.',
      confidence: 'high',
      severity: 'low',
      discipline: 'MEP',
      category: 'Coordination',
      rationale:
        'Ventilation note values align between architectural equipment schedule and mechanical outdoor air table.',
      sources: [
        {
          documentLabel: 'Room finishes schedule',
          page: 30,
          excerpt: 'Elevator machine room: ventilation per **mechanical drawing M-501**.',
          highlight: 'M-501',
        },
        {
          documentLabel: 'Ventilation table',
          page: 'M-501',
          excerpt: 'EMR: OA **150 CFM minimum** continuous.',
          highlight: '150 CFM',
        },
      ],
    },
  ]

  // Clean accidental markdown in excerpts
  const clean = (t: Template[]) =>
    t.map((x) => ({
      ...x,
      sources: x.sources.map((src) => ({
        ...src,
        excerpt: src.excerpt.replace(/\*\*/g, ''),
      })),
    }))

  return {
    conflict: clean(conflict),
    missing: clean(missing),
    verified: clean(verified),
  }
}

/** Deterministic mock issues from uploads + settings (replace with API later). ~23 issues for UI density. */
export function generateMockIssues(
  rows: DocumentUploadRow[],
  settings: DetectionSettings
): ClashGapIssue[] {
  if (!rows.length) return []

  const seedStr =
    rows.map((r) => `${r.id}:${r.filename}:${r.type}`).join('|') +
    JSON.stringify(settings)
  let s = hashSeed(seedStr)

  const plans = rows.find((r) => r.type === 'plans')
  const specs = rows.find((r) => r.type === 'specs')
  const addenda = rows.find((r) => r.type === 'addenda')

  const planLabel = plans?.filename ?? 'Structural Drawings.pdf'
  const specLabel = specs?.filename ?? 'Spec 03 30 00 Cast-in-Place Concrete.pdf'
  const addendumLabel = addenda?.filename ?? 'Addendum 02.pdf'

  const sensitivityNote =
    settings.sensitivity === 'high'
      ? 'High sensitivity scan surfaced additional wording variance.'
      : settings.sensitivity === 'low'
        ? 'Review flagged only high-confidence inconsistencies.'
        : 'Medium sensitivity balancing recall and precision.'

  const { conflict, missing, verified } = templatesFromContext(
    planLabel,
    specLabel,
    addendumLabel,
    sensitivityNote,
    s,
    rows,
    settings,
  )

  const picks: Template[] = [
    ...conflict.slice(0, 6),
    ...missing.slice(0, 11),
    ...verified.slice(0, 6),
  ]

  const ids = picks.map((_, i) => `iss-${s % 100000}-${i}`)
  const raw: ClashGapIssue[] = picks.map((tpl, i) => ({
    ...tpl,
    id: ids[i],
    discipline: tpl.discipline,
    category: tpl.category,
    rationale: tpl.rationale,
  }))

  const withRelated = raw.map((issue, i) => ({
    ...issue,
    relatedIssueIds: [
      ids[(i + 1) % ids.length],
      ids[(i + 7) % ids.length],
    ].filter((id) => id !== issue.id),
  }))

  return withRelated.filter((issue) => issueShouldInclude(issue.type, settings))
}
