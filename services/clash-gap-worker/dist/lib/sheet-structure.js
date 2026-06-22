const SHEET_ID_RE = /\b([ASMEPC])[\s-]?(\d{1,3}(?:\.\d{1,2})?)\b/gi;
export function detectSheetIdHint(text) {
    const head = text.slice(0, 2500);
    const matches = [...head.matchAll(SHEET_ID_RE)];
    if (!matches.length)
        return null;
    const m = matches[0];
    return `${m[1].toUpperCase()}${m[2]}`;
}
export function buildStructuredFromRegions(params) {
    const { regions, fullText } = params;
    const titleBlock = regions.title_block?.trim() || null;
    const legendNotes = regions.legend_notes?.trim() || null;
    const planParts = [
        regions.plan_top_left,
        regions.plan_top_right,
        regions.plan_bottom_left,
        regions.plan_bottom_right,
    ]
        .filter(Boolean)
        .join('\n\n')
        .trim();
    const blocks = Object.entries(regions)
        .filter(([, text]) => text.trim())
        .map(([label, text]) => ({ label, text: text.trim() }));
    const sheetHint = detectSheetIdHint(titleBlock ?? '') ||
        detectSheetIdHint(legendNotes ?? '') ||
        detectSheetIdHint(fullText);
    return {
        source: 'google-vision',
        ocr_engine: 'region',
        sheet_id_hint: sheetHint,
        regions,
        blocks,
        title_block: titleBlock,
        legend_notes: legendNotes,
        plan_areas: planParts || null,
    };
}
export function buildStructuredFromBlocks(params) {
    const blocks = params.blocks
        .filter((b) => b.text.trim())
        .map((b) => ({ label: b.label, text: b.text.trim() }));
    return {
        source: 'google-vision',
        ocr_engine: 'full_page',
        sheet_id_hint: detectSheetIdHint(params.fullText),
        regions: {},
        blocks,
        title_block: null,
        legend_notes: null,
        plan_areas: null,
    };
}
export function structuredForEmbeddedText(text) {
    return {
        source: 'google-vision',
        ocr_engine: 'embedded',
        sheet_id_hint: detectSheetIdHint(text),
        regions: {},
        blocks: text.trim() ? [{ label: 'embedded', text: text.trim() }] : [],
        title_block: null,
        legend_notes: null,
        plan_areas: null,
    };
}
