# Clash/Gap Detection — Worker Architecture

BuildSwift runs on **Google Cloud** with **Supabase Pro** as the database, auth, and file store.

Chunk and OCR run on the **clash-gap worker** — locally (`http://localhost:8080`) or on **Cloud Run** in production. OCR uses **Google Cloud Vision API**.

## 3-step pipeline

| Step | Name | Where it runs | Engine |
|------|------|---------------|--------|
| **1** | **Chunk** | Worker | PDF.js + canvas → JPEG per page (UI preview, 180 DPI) |
| **2** | **OCR** | Worker | **Google Cloud Vision** (+ embedded PDF text when available) |
| **3** | **Detect** | Next.js app (Cloud Run) | **OpenAI** INSIGHT AI Review Engine |

```
Upload → [1 Chunk] → [2 OCR] → [3 Detect] → Results
              ↓              ↓            ↓
         Worker         Worker      Next.js app
      (preview JPEG)  (Vision OCR)    (OpenAI)
              ↓              ↓            ↓
         Supabase Storage + Postgres (stages, sheets, issues)
```

## OCR routing (hybrid)

For each page, the worker picks **one primary path**:

1. **Specs / addenda with good embedded text** — use embedded PDF text directly (no Vision call).
2. **Specs / addenda (scanned or weak embedded)** — Vision `documentTextDetection` at 250 DPI.
3. **Plans / drawings** — Vision at 400 DPI; if quality gate fails, **tiled OCR** (top + bottom regions).
4. **Merge** — combine embedded + Vision text → store in `ocr_text` and `raw_text`.

## Services

### 1. Next.js app

- Triggers worker for chunk + OCR via `lib/server/clash-gap/worker-client.ts`
- Runs detect with INSIGHT prompt (OpenAI)

### 2. Clash/Gap worker (`services/clash-gap-worker/`)

- `POST /chunk-stage` — render PDF pages, upload JPEGs
- `POST /ocr` — Vision OCR → `ocr_text` → merge `raw_text`
- `GET /health` — confirms worker is running

### 3. Supabase Pro

- Postgres + Storage bucket `document-attachments`

---

## Setup checklist

### One-time (Google Cloud)

```bash
# 1. Enable API
gcloud services enable vision.googleapis.com

# 2. Service account + role
gcloud iam service-accounts create buildswift-worker \
  --display-name="BuildSwift Clash/Gap Worker"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:buildswift-worker@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/vision.apiUser"

# 3. Key for local dev only
gcloud iam service-accounts keys create ~/buildswift-worker-key.json \
  --iam-account=buildswift-worker@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

### Local dev

**Terminal 1 — worker** (`services/clash-gap-worker/.env`):

```bash
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
WORKER_SECRET=dev-secret-123
CLASH_GAP_BUCKET=document-attachments

GOOGLE_CLOUD_PROJECT=your-gcp-project-id
GOOGLE_APPLICATION_CREDENTIALS=/path/to/buildswift-worker-key.json

npm run dev:worker
```

**Terminal 2 — app** (`.env.local`):

```bash
CLASH_GAP_WORKER_URL=http://localhost:8080
CLASH_GAP_WORKER_SECRET=dev-secret-123
```

**Verify:**

```bash
curl http://localhost:8080/health
# → { "status": "ok", "ocr": "google-vision", ... }
```

**Run pipeline:** Upload PDF → Run chunking → Run OCR → Run detect.

### Production (Cloud Run)

```bash
gcloud run deploy clash-gap-worker \
  --source services/clash-gap-worker \
  --region us-central1 \
  --memory 2Gi \
  --cpu 2 \
  --timeout 3600 \
  --service-account=buildswift-worker@YOUR_PROJECT_ID.iam.gserviceaccount.com \
  --set-env-vars SUPABASE_URL=...,SUPABASE_SERVICE_ROLE_KEY=...,WORKER_SECRET=...,GOOGLE_CLOUD_PROJECT=...
```

Set on the Next.js app:

```bash
CLASH_GAP_WORKER_URL=https://clash-gap-worker-xxxxx.run.app
CLASH_GAP_WORKER_SECRET=<same as WORKER_SECRET>
```

---

## Environment variables

### Next.js app

| Variable | Purpose |
|----------|---------|
| `CLASH_GAP_WORKER_URL` | Worker URL (local or Cloud Run) |
| `CLASH_GAP_WORKER_SECRET` | Shared secret for worker endpoints |
| `OPENAI_API_KEY` | Detect stage (step 3) only |

### Worker

| Variable | Required | Purpose |
|----------|----------|---------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key |
| `WORKER_SECRET` | Yes | Auth header `X-Worker-Secret` |
| `GOOGLE_CLOUD_PROJECT` | Local dev | GCP project ID |
| `GOOGLE_APPLICATION_CREDENTIALS` | Local only | Path to service account JSON |
| `CHUNK_DPI` | No | Preview DPI (default 180) |
| `OCR_SPEC_DPI` | No | Vision DPI for specs (default 250) |
| `OCR_PLAN_DPI` | No | Vision DPI for plans (default 400) |
| `OCR_PAGE_WORKERS` | No | Parallel pages (default 8) |

---

## Re-run OCR after config changes

Existing analyses keep old `ocr_text`. To refresh:

1. Re-run the OCR stage from the UI (clears and re-processes pages)

---

## Database migrations

Run in Supabase SQL editor (in order):

1. `migrations/2026-06-clash-gap-insight-engine.sql`
2. `migrations/2026-06-clash-gap-insight-workflow.sql`
3. `migrations/2026-06-clash-gap-file-chunk-status.sql`
