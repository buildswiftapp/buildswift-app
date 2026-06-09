function normalizeWhitespace(text) {
    return text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
function tokenize(text) {
    const tokens = new Set();
    const lower = text.toLowerCase();
    const re = /[a-z0-9][a-z0-9\-./]{2,}/gi;
    let match;
    while ((match = re.exec(lower)) !== null) {
        tokens.add(match[0]);
    }
    return tokens;
}
function jaccardSimilarity(a, b) {
    if (a.size === 0 && b.size === 0)
        return 1;
    if (a.size === 0 || b.size === 0)
        return 0;
    let intersection = 0;
    for (const token of a) {
        if (b.has(token))
            intersection++;
    }
    const union = a.size + b.size - intersection;
    return union > 0 ? intersection / union : 0;
}
export function mergePageText(params) {
    const embeddedText = normalizeWhitespace(params.embedded.fullText);
    const ocrText = normalizeWhitespace(params.ocr.text);
    const hasEmbedded = embeddedText.length > 0;
    const hasOcr = ocrText.length > 0;
    let rawText = '';
    if (hasEmbedded && hasOcr) {
        const embeddedTokens = tokenize(embeddedText);
        const ocrTokens = tokenize(ocrText);
        const similarity = jaccardSimilarity(embeddedTokens, ocrTokens);
        if (similarity > 0.7) {
            rawText = embeddedText.length >= ocrText.length ? embeddedText : ocrText;
        }
        else {
            const ocrOnlyTokens = [];
            for (const token of ocrTokens) {
                if (!embeddedTokens.has(token))
                    ocrOnlyTokens.push(token);
            }
            const ocrAddsNewContent = ocrOnlyTokens.length / Math.max(1, ocrTokens.size) > 0.2;
            rawText = ocrAddsNewContent
                ? `${embeddedText}\n\n--- OCR supplement ---\n${ocrText}`
                : embeddedText;
        }
    }
    else if (hasEmbedded) {
        rawText = embeddedText;
    }
    else if (hasOcr) {
        rawText = ocrText;
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
