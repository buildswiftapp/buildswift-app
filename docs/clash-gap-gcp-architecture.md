# Clash/Gap Detection — Worker Architecture

BuildSwift runs on **Google Cloud** with **Supabase Pro** as the database, auth, and file store.

Chunk and OCR run on the **clash-gap worker** — locally (`http://localhost:8080`) or on **Cloud Run** in production. OCR uses **Google Document AI** only.

## 3-step pipeline

| Step | Name | Where it runs | Engine |
|------|------|---------------|--------|
| **1** | **Chunk** | Worker | PDF.js + canvas → JPEG per page (UI preview) |
| **2** | **OCR** | Worker | **Google Document AI** (+ embedded PDF text when available) |
| **3** | **Detect** | Next.js app (Cloud Run) | **OpenAI** INSIGHT AI Review Engine |

```
Upload → [1 Chunk] → [2 OCR] → [3 Detect] → Results
              ↓              ↓            ↓
         Worker         Worker      Next.js app
         (JPEG)    (Document AI)    (OpenAI)
              ↓              ↓            ↓
         Supabase Storage + Postgres (stages, sheets, issues)
```

## OCR logic

For each PDF file:

1. **Embedded text** — if a page has enough selectable text (≥120 chars), use it directly (fast, free).
2. **Document AI** — one API call per PDF for remaining pages; extracts blocks, paragraphs, and tables (legends, schedules).
3. **Merge** — combine embedded + Document AI text per page → store in `ocr_text` and `raw_text`.

Image uploads (non-PDF) are sent to Document AI one image at a time.

## Services

### 1. Next.js app

- Triggers worker for chunk + OCR via `lib/server/clash-gap/worker-client.ts`
- Runs detect with INSIGHT prompt

### 2. Clash/Gap worker (`services/clash-gap-worker/`)

- `POST /chunk` — render PDF pages, upload JPEGs
- `POST /ocr` — Document AI → `ocr_text` → merge `raw_text`
- `GET /health` — confirms Document AI configuration

### 3. Supabase Pro

- Postgres + Storage bucket `document-attachments`

---

## Setup checklist

### One-time (Google Cloud)

```bash
# 1. Enable API
gcloud services enable documentai.googleapis.com

# 2. Create processor
gcloud documentai processors create \
  --location=us \
  --display-name="BuildSwift Construction OCR" \
  --type=DOCUMENT_OCR_PROCESSOR

# Note the processor ID from output (last path segment)

# 3. Service account + role
gcloud iam service-accounts create buildswift-worker \
  --display-name="BuildSwift Clash/Gap Worker"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:buildswift-worker@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/documentai.apiUser"

# 4. Key for local dev only
gcloud iam service-accounts keys create ~/buildswift-worker-key.json \
  --iam-account=buildswift-worker@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

### Local dev

**Terminal 1 — worker** (`services/clash-gap-worker/.env`):

```bash
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # service_role key
WORKER_SECRET=dev-secret-123
CLASH_GAP_BUCKET=document-attachments

DOCUMENT_AI_PROJECT_ID=your-gcp-project-id
DOCUMENT_AI_LOCATION=us
DOCUMENT_AI_PROCESSOR_ID=your-processor-id
GOOGLE_APPLICATION_CREDENTIALS=/path/to/buildswift-worker-key.json

npm run dev:worker
```

**Terminal 2 — app** (`.env.local`):

```bash
CLASH_GAP_WORKER_URL=http://localhost:8080
CLASH_GAP_WORKER_SECRET=dev-secret-123   # must match WORKER_SECRET
```

**Verify:**

```bash
curl http://localhost:8080/health
# → { "status": "ok", "ocr": "document-ai", "document_ai": { "configured": true, ... } }
```

**Run pipeline:** Upload PDF → Run chunking → Run OCR → Run detect.

> **Note:** Document AI is a cloud API. “Local” means the worker runs on your machine but still calls Google Cloud — you need network access and valid GCP credentials.

### Production (Cloud Run)

Deploy worker with the service account attached (no `GOOGLE_APPLICATION_CREDENTIALS` file):

```bash
gcloud run deploy clash-gap-worker \
  --source services/clash-gap-worker \
  --region us-central1 \
  --memory 2Gi \
  --cpu 2 \
  --timeout 3600 \
  --service-account=buildswift-worker@YOUR_PROJECT_ID.iam.gserviceaccount.com \
  --set-env-vars SUPABASE_URL=...,SUPABASE_SERVICE_ROLE_KEY=...,WORKER_SECRET=...,DOCUMENT_AI_PROJECT_ID=...,DOCUMENT_AI_PROCESSOR_ID=...,DOCUMENT_AI_LOCATION=us
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
| `CLASH_GAP_WORKER_SECRET` | Shared secret for `/chunk` and `/ocr` |
| `CLASH_GAP_BUCKET` | Supabase storage bucket |
| `OPENAI_API_KEY` | Detect stage (step 3) |

### Worker

| Variable | Required | Purpose |
|----------|----------|---------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key |
| `WORKER_SECRET` | Yes | Auth header `X-Worker-Secret` |
| `DOCUMENT_AI_PROJECT_ID` | Yes | GCP project ID |
| `DOCUMENT_AI_PROCESSOR_ID` | Yes | Processor ID from gcloud create |
| `DOCUMENT_AI_LOCATION` | Yes | e.g. `us` or `eu` |
| `GOOGLE_APPLICATION_CREDENTIALS` | Local only | Path to service account JSON |
| `OCR_WORKERS` | No | Parallel files (default 4) |
| `OCR_EMBEDDED_MIN_LEN` | No | Skip Document AI when embedded text ≥ this (default 120) |

---

## Re-run OCR after config changes

Existing analyses keep old `ocr_text`. To refresh:

1. Clear `ocr_text` on sheets (or start a new analysis)
2. Run the OCR stage again from the UI

---

## Database migrations

Run in Supabase SQL editor (in order):

1. `migrations/2026-06-clash-gap-insight-engine.sql`
2. `migrations/2026-06-clash-gap-insight-workflow.sql`
3. `migrations/2026-06-clash-gap-file-chunk-status.sql`
