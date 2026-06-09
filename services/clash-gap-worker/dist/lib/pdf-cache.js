import { openPdfDocument } from './pdf.js';
import { sb } from '../supabase.js';
import { config } from '../config.js';
export class PdfCache {
    cache = new Map();
    loading = new Map();
    async get(fileId, storagePath) {
        const hit = this.cache.get(fileId);
        if (hit)
            return hit;
        const pending = this.loading.get(fileId);
        if (pending)
            return pending;
        const promise = (async () => {
            const { data: blob, error } = await sb()
                .storage.from(config.storageBucket)
                .download(storagePath);
            if (error || !blob)
                throw new Error(error?.message || `PDF download failed: ${storagePath}`);
            const buffer = Buffer.from(await blob.arrayBuffer());
            const doc = await openPdfDocument(buffer);
            const entry = { doc, buffer };
            this.cache.set(fileId, entry);
            return entry;
        })();
        this.loading.set(fileId, promise);
        try {
            return await promise;
        }
        finally {
            this.loading.delete(fileId);
        }
    }
    async destroyAll() {
        await Promise.all([...this.cache.values()].map(({ doc }) => doc.destroy().catch(() => { })));
        this.cache.clear();
    }
}
