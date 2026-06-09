import { DocumentProcessorServiceClient } from '@google-cloud/documentai';
import { config, isDocumentAiConfigured } from '../config.js';
let client = null;
function getClient() {
    if (!client)
        client = new DocumentProcessorServiceClient();
    return client;
}
function processorName() {
    return `projects/${config.documentAiProjectId}/locations/${config.documentAiLocation}/processors/${config.documentAiProcessorId}`;
}
function textFromAnchor(fullText, anchor) {
    if (!anchor?.textSegments?.length)
        return '';
    return anchor.textSegments
        .map((seg) => {
        const start = Number(seg.startIndex ?? 0);
        const end = Number(seg.endIndex ?? fullText.length);
        return fullText.slice(start, end);
    })
        .join('');
}
function extractTablesFromPage(fullText, page) {
    if (!page?.tables?.length)
        return '';
    const sections = [];
    for (const table of page.tables) {
        const rows = [];
        const allRows = [...(table.headerRows ?? []), ...(table.bodyRows ?? [])];
        for (const row of allRows) {
            const cells = row.cells?.map((cell) => textFromAnchor(fullText, cell.layout?.textAnchor).trim()) ?? [];
            if (cells.some((c) => c.length > 0))
                rows.push(cells.join(' | '));
        }
        if (rows.length)
            sections.push(`[TABLE]\n${rows.join('\n')}`);
    }
    return sections.join('\n\n');
}
function extractPageText(document, pageIndex) {
    const fullText = document.text ?? '';
    const page = document.pages?.[pageIndex];
    if (!page)
        return fullText.trim();
    const parts = [];
    for (const block of page.blocks ?? []) {
        const text = textFromAnchor(fullText, block.layout?.textAnchor).trim();
        if (text)
            parts.push(text);
    }
    if (!parts.length) {
        for (const paragraph of page.paragraphs ?? []) {
            const text = textFromAnchor(fullText, paragraph.layout?.textAnchor).trim();
            if (text)
                parts.push(text);
        }
    }
    const tables = extractTablesFromPage(fullText, page);
    if (tables)
        parts.push(tables);
    return parts.join('\n\n').trim();
}
function pageTextsFromDocument(document) {
    const out = new Map();
    const pageCount = document.pages?.length ?? 0;
    for (let i = 0; i < pageCount; i++) {
        const text = extractPageText(document, i);
        if (text)
            out.set(i, text);
    }
    return out;
}
async function processRawDocument(content, mimeType) {
    if (!isDocumentAiConfigured()) {
        throw new Error('Document AI is not configured');
    }
    const [result] = await getClient().processDocument({
        name: processorName(),
        rawDocument: { content, mimeType },
    });
    if (!result.document)
        throw new Error('Document AI returned no document');
    return result.document;
}
export async function processPdfWithDocumentAi(pdfBuffer) {
    const document = await processRawDocument(pdfBuffer, 'application/pdf');
    return pageTextsFromDocument(document);
}
export async function processImageWithDocumentAi(imageBuffer, mimeType) {
    const document = await processRawDocument(imageBuffer, mimeType);
    const pages = pageTextsFromDocument(document);
    if (pages.has(0))
        return pages.get(0);
    return (document.text ?? '').trim();
}
export function documentAiStatus() {
    if (!isDocumentAiConfigured())
        return { configured: false };
    return { configured: true, processor: processorName() };
}
