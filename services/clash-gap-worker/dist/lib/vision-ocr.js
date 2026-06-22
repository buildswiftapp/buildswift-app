import { ImageAnnotatorClient } from '@google-cloud/vision';
import { normalizeOcrText } from './text-normalize.js';
let client = null;
function getClient() {
    if (!client)
        client = new ImageAnnotatorClient();
    return client;
}
function boxTopLeft(box) {
    const v = box?.vertices?.[0];
    return { y: v?.y ?? 0, x: v?.x ?? 0 };
}
function paragraphText(paragraph) {
    const words = [];
    for (const word of paragraph.words ?? []) {
        const symbols = word.symbols ?? [];
        const wordText = symbols.map((s) => s.text ?? '').join('');
        if (wordText)
            words.push(wordText);
    }
    return words.join(' ');
}
function blocksFromAnnotation(annotation) {
    const blocks = [];
    let index = 0;
    for (const page of annotation.pages ?? []) {
        for (const block of page.blocks ?? []) {
            const lines = [];
            for (const paragraph of block.paragraphs ?? []) {
                const line = paragraphText(paragraph).trim();
                if (line)
                    lines.push(line);
            }
            if (!lines.length)
                continue;
            const pos = boxTopLeft(block.boundingBox);
            index += 1;
            blocks.push({
                label: `block_${index}`,
                text: lines.join('\n'),
                y: pos.y,
                x: pos.x,
            });
        }
    }
    blocks.sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
    return blocks;
}
function textFromBlocks(blocks) {
    return blocks.map((b) => b.text).join('\n\n');
}
function parseAnnotation(annotation) {
    if (!annotation)
        return { text: '', blocks: [] };
    const visionBlocks = blocksFromAnnotation(annotation);
    if (visionBlocks.length) {
        return {
            text: normalizeOcrText(textFromBlocks(visionBlocks)),
            blocks: visionBlocks,
        };
    }
    const flat = normalizeOcrText(annotation.text ?? '');
    if (!flat)
        return { text: '', blocks: [] };
    return {
        text: flat,
        blocks: [{ label: 'full_page', text: flat, y: 0, x: 0 }],
    };
}
export async function ocrImageWithVisionDetailed(imageBuffer) {
    const [result] = await getClient().documentTextDetection({
        image: { content: imageBuffer },
        imageContext: { languageHints: ['en'] },
    });
    const parsed = parseAnnotation(result.fullTextAnnotation);
    if (parsed.text)
        return parsed;
    const fallback = (result.textAnnotations?.[0]?.description ?? '').trim();
    if (!fallback)
        return { text: '', blocks: [] };
    const text = normalizeOcrText(fallback);
    return { text, blocks: [{ label: 'full_page', text, y: 0, x: 0 }] };
}
export async function ocrImageWithVision(imageBuffer) {
    const result = await ocrImageWithVisionDetailed(imageBuffer);
    return result.text;
}
export function visionOcrStatus() {
    return {
        configured: true,
        engine: 'google-cloud-vision-document-text',
    };
}
