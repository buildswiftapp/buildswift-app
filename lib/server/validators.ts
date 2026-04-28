import { z } from 'zod'

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  client_owner: z.string().trim().max(200).optional().nullable(),
})

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  client_owner: z.string().trim().max(200).optional().nullable(),
  status: z.enum(['active', 'archived', 'deleted']).optional(),
})

export const createDocumentSchema = z.object({
  project_id: z.string().uuid(),
  doc_type: z.enum(['rfi', 'submittal', 'change_order']),
  doc_number: z.string().trim().max(120).optional().nullable(),
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().min(1),
  due_date: z.string().optional().nullable(),
  metadata: z.record(z.any()).optional().default({}),
  save_as_draft: z.boolean().optional().default(true),
})

export const updateDocumentSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  doc_number: z.string().trim().max(120).optional().nullable(),
  description: z.string().trim().min(1).optional(),
  internal_status: z
    .enum([
      'draft',
      'in_review',
      'pending_reviewer',
      'revising',
      'approved',
      'rejected',
      'answered',
      'closed',
      'pending_execution',
    ])
    .optional(),
  external_status: z
    .enum(['draft', 'sent', 'viewed', 'approved', 'rejected', 'pending_reviewer'])
    .optional(),
  metadata: z.record(z.any()).optional(),
  increment_version: z.boolean().optional().default(false),
})

export const sendForReviewSchema = z.object({
  reviewers: z
    .array(z.string().trim().toLowerCase().email())
    .min(1)
    .transform((reviewers) => Array.from(new Set(reviewers))),
  /** When true, only refresh tokens for reviewers on the latest open review cycle (expired links only). */
  resend: z.boolean().optional().default(false),
  /** Link lifetime for new tokens (days). Default 7. */
  expires_in_days: z.coerce
    .number()
    .int()
    .refine((n): n is 3 | 7 | 14 => [3, 7, 14].includes(n), { message: 'expires_in_days must be 3, 7, or 14' })
    .optional()
    .default(7),
})

export const reviewDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  decision_notes: z.string().max(3000).optional(),
  full_name: z.string().trim().min(1),
  signature_url: z.string().url().optional(),
})

export const reviewSubmitSchema = z.object({
  token: z.string().trim().min(16).max(512),
  decision: z.enum(['approved', 'rejected']),
  notes: z.string().max(3000).optional(),
  signature_name: z.string().trim().min(1).max(200),
  signature_image: z.string().min(1).max(2_000_000).optional(),
})

const aiDescriptionInputSchema = z.string().trim().min(10).max(6000)
const aiOptionalNotesSchema = z.preprocess(
  (value) => (typeof value === 'string' ? value : undefined),
  z.string().trim().min(1).max(6000).optional()
)

export const improveRfiSchema = z.object({
  description: aiDescriptionInputSchema,
  notes: aiOptionalNotesSchema,
})

export const improveSubmittalSchema = z.object({
  description: aiDescriptionInputSchema,
  notes: aiOptionalNotesSchema,
})

export const analyzeChangeOrderSchema = z.object({
  description: aiDescriptionInputSchema,
  notes: aiOptionalNotesSchema,
})

/** POST /api/documents/:id/activity — user-visible comment on document timeline */
export const documentActivityCommentSchema = z.object({
  body: z.string().trim().min(1).max(5000),
})

export const accountBrandingUpsertSchema = z.object({
  company_name: z.string().trim().max(200).optional().nullable(),
  primary_color: z
    .string()
    .trim()
    .max(32)
    .optional()
    .nullable()
    .refine((v) => v == null || v === undefined || v === '' || /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v), {
      message: 'Invalid hex color',
    }),
  clear_logo: z.boolean().optional(),
})

export const updateProfileSchema = z.object({
  full_name: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email().max(320),
  company_name: z.string().trim().min(1).max(200),
})

export const updateCompanySchema = z.object({
  name: z.string().trim().min(1).max(200),
  industry: z.string().trim().max(200).optional().nullable(),
  website: z.string().trim().max(500).optional().nullable(),
  phone: z.string().trim().max(60).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
})
