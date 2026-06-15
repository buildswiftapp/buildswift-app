import { createCanvas, loadImage } from '@napi-rs/canvas';
import pLimit from 'p-limit';
import { ocrImageWithVision } from './vision-ocr.js';
import { mergePageTexts } from './text-quality.js';
function tileRegions(width, height) {
    const midX = Math.floor(width / 2);
    const topH = Math.floor(height * 0.38);
    const bottomH = height - topH;
    return [
        { x: 0, y: 0, w: width, h: topH, label: 'top' },
        { x: 0, y: topH, w: midX, h: bottomH, label: 'bottom-left' },
        { x: midX, y: topH, w: width - midX, h: bottomH, label: 'bottom-right' },
    ];
}
async function cropTile(imageBuffer, region) {
    const img = await loadImage(imageBuffer);
    const canvas = createCanvas(region.w, region.h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h);
    return canvas.toBuffer('image/jpeg', 95);
}
export async function ocrImageWithVisionTiles(imageBuffer, concurrency = 3) {
    const img = await loadImage(imageBuffer);
    const regions = tileRegions(img.width, img.height);
    const limit = pLimit(concurrency);
    const parts = await Promise.all(regions.map((region) => limit(async () => {
        try {
            const tile = await cropTile(imageBuffer, region);
            const text = (await ocrImageWithVision(tile)).trim();
            return text ? `[${region.label}]\n${text}` : '';
        }
        catch {
            return '';
        }
    })));
    return mergePageTexts(...parts);
}
