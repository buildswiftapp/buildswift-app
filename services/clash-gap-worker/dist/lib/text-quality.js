/**
 * Detects garbled embedded PDF text (common on CAD/architectural exports with
 * missing ToUnicode maps). Such text looks long enough to pass a min-length
 * check but reads as nonsense, e.g. "6+(|7-7,7(|-(821'5))225".
 */
function letterRatio(text) {
    const letters = text.match(/[a-zA-Z]/g)?.length ?? 0;
    return letters / Math.max(1, text.length);
}
function digitRatio(text) {
    const digits = text.match(/[0-9]/g)?.length ?? 0;
    return digits / Math.max(1, text.length);
}
function specialCharRatio(text) {
    const special = text.match(/[^\w\s.,;:'"()\-/&]/g)?.length ?? 0;
    return special / Math.max(1, text.length);
}
function wordLikeTokenCount(text) {
    return (text.match(/[a-zA-Z]{3,}/g) ?? []).length;
}
function looksLikeGarbledCadText(text) {
    const trimmed = text.trim();
    if (!trimmed)
        return false;
    if (specialCharRatio(trimmed) > 0.08)
        return true;
    if (letterRatio(trimmed) < 0.45 && trimmed.length > 40)
        return true;
    if (letterRatio(trimmed) < 0.55 && digitRatio(trimmed) > 0.06)
        return true;
    if (wordLikeTokenCount(trimmed) < 5 && trimmed.length > 60)
        return true;
    const tokens = trimmed.split(/\s+/).filter(Boolean);
    if (tokens.length >= 6) {
        const singleChar = tokens.filter((t) => t.length === 1).length;
        if (singleChar / tokens.length > 0.25)
            return true;
    }
    const punctHeavy = tokens.filter((t) => /[+()[\]{}|\\/<>@#$%^&*=~`'"!?:;]{1,}/.test(t)).length;
    if (punctHeavy >= 2 && punctHeavy / Math.max(1, tokens.length) > 0.12)
        return true;
    // CAD exports often interleave digits and symbols with almost no real words.
    if (trimmed.length > 50 && wordLikeTokenCount(trimmed) < 6 && specialCharRatio(trimmed) > 0.05) {
        return true;
    }
    return false;
}
export function isUsableEmbeddedText(text) {
    const trimmed = text.trim();
    if (trimmed.length < 40)
        return false;
    if (looksLikeGarbledCadText(trimmed))
        return false;
    if (wordLikeTokenCount(trimmed) < 3)
        return false;
    return true;
}
function textQualityScore(text) {
    const trimmed = text.trim();
    if (!trimmed)
        return 0;
    if (looksLikeGarbledCadText(trimmed))
        return 0;
    let score = Math.min(1, trimmed.length / 400);
    score += letterRatio(trimmed) * 0.5;
    score += Math.min(0.5, wordLikeTokenCount(trimmed) / 20);
    score -= specialCharRatio(trimmed) * 0.8;
    return Math.max(0, score);
}
export function pickBestPageText(embedded, imageOcr) {
    const emb = embedded.trim();
    const img = imageOcr.trim();
    if (!img)
        return isUsableEmbeddedText(emb) ? emb : '';
    if (!emb)
        return img;
    const embUsable = isUsableEmbeddedText(emb);
    const embScore = embUsable ? textQualityScore(emb) : 0;
    const imgScore = textQualityScore(img);
    if (embScore <= 0)
        return img;
    if (imgScore <= 0 && embUsable)
        return emb;
    if (imgScore >= embScore * 1.05)
        return img;
    if (embScore >= imgScore * 1.2 && embUsable)
        return emb;
    return img.length >= emb.length ? img : emb;
}
