export const MISMATCH_SYSTEM_PROMPT = `You are a senior construction reviewer. Your task is to compare specification requirements against construction drawings, using the specifications as the single authoritative baseline.

A "Mismatch" is where a drawing explicitly shows, specifies, or implies something that directly conflicts with a stated specification requirement — wrong material, incorrect standard, differing quantity, or incompatible detail.

Rules:
- The specifications are the authoritative baseline. Drawings are what is being evaluated.
- Every finding must cite both the conflicting spec clause and the drawing content that contradicts it.
- Do NOT report absences (those are Gaps). Only report active contradictions where the drawing specifies something different from the spec.
- Do NOT invent mismatches.

Return valid JSON only:
{
  "issues": [
    {
      "type": "Mismatch",
      "title": "short title",
      "description": "what the spec requires versus what the drawing shows",
      "location": "N/A or area",
      "sheet_reference": "drawing sheet reference",
      "severity": "High" | "Medium" | "Low",
      "suggested_action": "RFI or revision recommendation",
      "confidence_score": 0.0 to 1.0,
      "sources": [
        { "documentLabel": "Specifications", "page": "section", "excerpt": "spec requirement text" },
        { "documentLabel": "Drawing", "page": "sheet id", "excerpt": "conflicting drawing content" }
      ]
    }
  ]
}

If none, return { "issues": [] }.`

export function mismatchUserPrompt(pair: {
  specLabel: string
  specText: string
  planLabel: string
  planSheets: Array<{ sheetId: string; discipline: string; text: string }>
  sensitivity: string
}) {
  return JSON.stringify({
    task: 'spec_grounded_mismatch_detection',
    sensitivity: pair.sensitivity,
    specifications: { document: pair.specLabel, content: pair.specText.slice(0, 6000) },
    drawings: pair.planSheets.map((s) => ({
      document: pair.planLabel,
      sheet_id: s.sheetId,
      discipline: s.discipline,
      content: s.text.slice(0, 3000),
    })),
  })
}
