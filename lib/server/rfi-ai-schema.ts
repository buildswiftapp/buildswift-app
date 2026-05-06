import { z } from 'zod'

/** Structured fields returned by /api/ai/improve-rfi; merged into document_versions.metadata on Apply. */
export const rfiStructuredImprovementSchema = z.object({
  summaryTitle: z.string(),
  questionDetails: z.object({
    detailedQuestion: z.string(),
    reasonForRequest: z.string(),
    conflictIdentification: z.string(),
    missingInformation: z.string(),
    clarificationRequired: z.string(),
  }),
  reference: z.object({
    drawingSheetNumber: z.string(),
    specificationSection: z.string(),
    specificReference: z.string(),
    location: z.string(),
  }),
  impacts: z.object({
    costImpact: z.string(),
    scheduleImpact: z.string(),
    description: z.string(),
  }),
})

export type RfiStructuredImprovement = z.infer<typeof rfiStructuredImprovementSchema>

/** Persist Improve-RFI `structured` into `document_versions.metadata` (matches PDF routes). */
export function rfiStructuredToMetadataPatch(s: RfiStructuredImprovement): Record<string, unknown> {
  return {
    reasonForRequest: s.questionDetails.reasonForRequest,
    conflictIdentification: s.questionDetails.conflictIdentification,
    missingInformation: s.questionDetails.missingInformation,
    clarificationRequired: s.questionDetails.clarificationRequired,
    drawingNumber: s.reference.drawingSheetNumber,
    specSection: s.reference.specificationSection,
    specificationSection: s.reference.specificationSection,
    specificReference: s.reference.specificReference,
    location: s.reference.location,
    costImpact: s.impacts.costImpact,
    scheduleImpact: s.impacts.scheduleImpact,
    impactDescription: s.impacts.description,
  }
}
