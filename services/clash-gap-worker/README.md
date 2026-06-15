# Clash/Gap Worker

Handles pipeline **steps 1 and 2** (local dev or Cloud Run):

1. **Chunk** — PDF → JPEG page images (Supabase Storage, for UI preview)
2. **OCR** — Google Cloud Vision → `ocr_text` → merged `raw_text`

Step **3 (Detect)** runs on the main Next.js app with the OpenAI INSIGHT engine.

## OCR routing

| Document role | Strategy |
|---------------|----------|
| **Specs / addenda** | Use embedded PDF text when good; otherwise Vision OCR at 250 DPI |
| **Plans / drawings** | Vision OCR at 400 DPI; tiled regions if quality is low |

Chunk uses **180 DPI** preview images for speed. OCR re-renders at higher DPI only when needed.

## Prerequisites

- Supabase project (URL + service role key)
- Google Cloud project with **Cloud Vision API** enabled
- Service account with **Cloud Vision API User** (`roles/vision.apiUser`)

## Local dev

```bash
cp .env.example .env
# Fill SUPABASE_*, WORKER_SECRET, GOOGLE_CLOUD_PROJECT, GOOGLE_APPLICATION_CREDENTIALS

npm install
npm run dev
```

From repo root: `npm run dev:worker` (Terminal 1) + `npm run dev` (Terminal 2).

App `.env.local` must include `CLASH_GAP_WORKER_URL=http://localhost:8080` and matching `CLASH_GAP_WORKER_SECRET`.

Verify: `curl http://localhost:8080/health` → `"ocr": "google-vision"`.

## Deploy to Cloud Run

Attach a service account with `roles/vision.apiUser`. Set env vars — no credentials file needed on Cloud Run.

```bash
gcloud run deploy clash-gap-worker \
  --source . \
  --region us-central1 \
  --memory 2Gi \
  --cpu 2 \
  --timeout 3600 \
  --service-account=buildswift-worker@PROJECT.iam.gserviceaccount.com \
  --set-env-vars SUPABASE_URL=...,SUPABASE_SERVICE_ROLE_KEY=...,WORKER_SECRET=...,GOOGLE_CLOUD_PROJECT=...
```

See [docs/clash-gap-gcp-architecture.md](../../docs/clash-gap-gcp-architecture.md).
