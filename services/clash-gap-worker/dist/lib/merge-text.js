import { isUsableEmbeddedText, pickBestPageText } from './text-quality.js';
function normalizeWhitespace(text) {
    return text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
export function mergePageText(params) {
    const embeddedText = normalizeWhitespace(params.embedded.fullText);
    const ocrText = normalizeWhitespace(params.ocr.text);
    const hasEmbedded = embeddedText.length > 0;
    const hasOcr = ocrText.length > 0;
    let rawText = '';
    if (hasEmbedded && hasOcr) {
        if (!isUsableEmbeddedText(embeddedText)) {
            rawText = ocrText;
        }
        else {
            rawText = pickBestPageText(embeddedText, ocrText);
        }
    }
    else if (hasEmbedded && isUsableEmbeddedText(embeddedText)) {
        rawText = embeddedText;
    }
    else if (hasOcr) {
        rawText = ocrText;
    }
    else if (hasEmbedded) {
        rawText = embeddedText;
    }
    return {
        pageIndex: params.pageIndex,
        rawText,
        embeddedTextLength: embeddedText.length,
        ocrTextLength: ocrText.length,
        hasEmbedded,
        hasOcr,
    };
}
