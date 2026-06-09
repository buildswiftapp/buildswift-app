# Clash/Gap Worker

Handles pipeline **steps 1 and 2** (local dev or Cloud Run):

1. **Chunk** — PDF → JPEG page images (Supabase Storage, for UI preview)
2. **OCR** — Google Document AI → `ocr_text` → merged `raw_text`

Step **3 (Detect)** runs on the main Next.js app with the OpenAI INSIGHT engine.

## Prerequisites

- Supabase project (URL + service role key)
- Google Cloud project with **Document AI API** enabled
- A **Document OCR** processor (`DOCUMENT_OCR_PROCESSOR`)
- Service account with **Document AI API User** role

## Local dev

```bash
cp .env.example .env
# Fill SUPABASE_*, WORKER_SECRET, DOCUMENT_AI_*, GOOGLE_APPLICATION_CREDENTIALS

npm install
npm run dev
```

From repo root: `npm run dev:worker` (Terminal 1) + `npm run dev` (Terminal 2).

App `.env.local` must include `CLASH_GAP_WORKER_URL=http://localhost:8080` and matching `CLASH_GAP_WORKER_SECRET`.

Verify: `curl http://localhost:8080/health` → `"ocr": "document-ai"`.

## Deploy to Cloud Run

Attach a service account with `roles/documentai.apiUser`. Set env vars — no credentials file needed on Cloud Run.

```bash
gcloud run deploy clash-gap-worker \
  --source . \
  --region us-central1 \
  --memory 2Gi \
  --cpu 2 \
  --timeout 3600 \
  --service-account=buildswift-worker@PROJECT.iam.gserviceaccount.com \
  --set-env-vars SUPABASE_URL=...,SUPABASE_SERVICE_ROLE_KEY=...,WORKER_SECRET=...,DOCUMENT_AI_PROJECT_ID=...,DOCUMENT_AI_PROCESSOR_ID=...,DOCUMENT_AI_LOCATION=us
```

See [docs/clash-gap-gcp-architecture.md](../../docs/clash-gap-gcp-architecture.md).
