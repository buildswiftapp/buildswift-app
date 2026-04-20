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
  reviewers: z.array(z.string().email()).min(1),
  resend: z.boolean().optional().default(false),
})

export const reviewDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  decision_notes: z.string().max(3000).optional(),
  full_name: z.string().trim().min(1),
  signature_url: z.string().url().optional(),
})

export const aiGenerateSchema = z.object({
  documentType: z.enum(['RFI', 'ChangeOrder', 'Submittal']),
  description: z.string().trim().min(1).max(6000),
  additionalSystemPrompt: z.string().trim().min(1).max(6000).optional(),
})

/** POST /api/ai/missing-scope */
export const missingScopeAiSchema = z.object({
  type: z.enum(['RFI', 'Submittal', 'Change Order']),
  content: z.string().trim().min(1).max(150_000),
  initialDescription: z.preprocess(
    (value) => (typeof value === 'string' ? value : undefined),
    z.string().trim().min(1).max(6000).optional()
  ),
})
