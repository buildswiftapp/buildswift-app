import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { config } from '../config.js';
const mapProto = Map.prototype;
if (!mapProto.getOrInsertComputed) {
    mapProto.getOrInsertComputed = function (key, cb) {
        if (this.has(key))
            return this.get(key);
        const v = cb();
        this.set(key, v);
        return v;
    };
}
export async function openPdfDocument(buffer) {
    return getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
}
function viewportForPage(page, dpi) {
    let scale = dpi / 72;
    let viewport = page.getViewport({ scale });
    const maxWidth = config.chunkMaxImageWidth;
    if (viewport.width > maxWidth) {
        scale *= maxWidth / viewport.width;
        viewport = page.getViewport({ scale });
    }
    return viewport;
}
function canvasToJpeg(canvas) {
    const quality = Math.min(1, Math.max(0.5, config.chunkJpegQuality / 100));
    return canvas.toBuffer('image/jpeg', quality);
}
export async function renderPageToJpeg(doc, pageIndex, dpi) {
    const page = await doc.getPage(pageIndex + 1);
    const viewport = viewportForPage(page, dpi);
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext('2d');
    await page.render({
        canvas: canvas,
        canvasContext: ctx,
        viewport,
    }).promise;
    return canvasToJpeg(canvas);
}
