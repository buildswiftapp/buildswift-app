import { config } from '../config.js';
import { isUsableEmbeddedText } from './text-quality.js';
export function normalizeFileRole(role) {
    const r = (role ?? 'plans').toLowerCase();
    if (r === 'specs' || r === 'addenda' || r === 'plans')
        return r;
    return 'other';
}
export function resolvePageKind(fileRole, embeddedText) {
    const emb = embeddedText.trim();
    const embUsable = isUsableEmbeddedText(emb);
    if (fileRole === 'specs' || fileRole === 'addenda') {
        if (embUsable && emb.length >= config.ocrEmbeddedMinLen)
            return 'TEXT';
        return 'TEXT_SCAN';
    }
    if (embUsable && emb.length >= config.ocrPlanEmbeddedMinLen)
        return 'MIXED';
    return 'DRAWING';
}
export function minTextLengthForKind(kind) {
    switch (kind) {
        case 'TEXT':
            return config.ocrEmbeddedMinLen;
        case 'TEXT_SCAN':
            return config.ocrSpecMinLen;
        case 'DRAWING':
        case 'MIXED':
            return config.ocrPlanMinLen;
    }
}
export function ocrDpiForKind(kind) {
    switch (kind) {
        case 'TEXT':
            return config.ocrSpecDpi;
        case 'TEXT_SCAN':
            return config.ocrSpecDpi;
        case 'DRAWING':
        case 'MIXED':
            return config.ocrPlanDpi;
    }
}
export function shouldRunTiledEscalation(kind) {
    return kind === 'DRAWING' || kind === 'MIXED';
}
export function shouldUseRegionOcr(fileRole, kind) {
    return fileRole === 'plans' && (kind === 'DRAWING' || kind === 'MIXED');
}
