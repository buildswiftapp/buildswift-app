import Fastify from 'fastify';
import { assertConfig, config } from './config.js';
import { runChunkJob } from './jobs/chunk.js';
import { runOcrJob } from './jobs/ocr.js';
import { documentAiStatus } from './lib/document-ai.js';
const app = Fastify({ logger: true });
const chunkQueues = new Map();
function enqueueChunkJob(input, log) {
    const key = input.analysisId;
    const tail = chunkQueues.get(key) ?? Promise.resolve();
    const job = tail
        .then(() => runChunkJob(input))
        .catch((e) => {
        log.error({ err: e, analysisId: input.analysisId, fileId: input.fileId }, 'chunk job failed');
    });
    chunkQueues.set(key, job);
    void job.finally(() => {
        if (chunkQueues.get(key) === job)
            chunkQueues.delete(key);
    });
}
async function healthPayload() {
    return {
        status: 'ok',
        service: 'clash-gap-worker',
        ocr: 'document-ai',
        document_ai: documentAiStatus(),
    };
}
app.get('/health', async () => healthPayload());
app.get('/api/health', async () => healthPayload());
app.addHook('preHandler', async (req, reply) => {
    if (req.method === 'GET' && (req.url === '/health' || req.url === '/api/health'))
        return;
    const secret = req.headers['x-worker-secret'];
    if (secret !== config.workerSecret) {
        return reply.code(401).send({ error: 'Unauthorized' });
    }
});
async function handleChunk(req, reply) {
    const body = req.body;
    const { analysis_id, file_id, pdf_storage_path, account_id } = body;
    if (!analysis_id || !file_id || !pdf_storage_path || !account_id) {
        return reply.code(400).send({ error: 'analysis_id, file_id, pdf_storage_path, account_id required' });
    }
    const input = {
        analysisId: analysis_id,
        fileId: file_id,
        pdfStoragePath: pdf_storage_path,
        accountId: account_id,
    };
    setImmediate(() => enqueueChunkJob(input, app.log));
    return reply.code(202).send({ status: 'accepted', analysis_id });
}
app.post('/chunk', handleChunk);
app.post('/api/chunk', handleChunk);
async function handleOcr(req, reply) {
    const body = req.body;
    const analysis_id = body?.analysis_id;
    if (!analysis_id)
        return reply.code(400).send({ error: 'analysis_id required' });
    setImmediate(() => {
        runOcrJob(analysis_id).catch((e) => {
            app.log.error({ err: e, analysisId: analysis_id }, 'ocr job failed');
        });
    });
    return reply.code(202).send({ status: 'accepted', analysis_id });
}
app.post('/ocr', handleOcr);
app.post('/api/ocr', handleOcr);
async function main() {
    assertConfig();
    await app.listen({ host: '0.0.0.0', port: config.port });
}
async function shutdown() {
    await app.close();
    process.exit(0);
}
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
