# BuildSwift App

## Backend MVP Infrastructure

This project now includes a backend MVP stack built on:

- Next.js Route Handlers (`app/api/*`)
- Supabase Auth + Postgres
- OpenAI for AI-assisted description improvements and scope analysis
- Stripe webhook processing for billing status synchronization

### 1) Database

Apply the migration:

- `supabase/migrations/20260415_000001_mvp_workflow_schema.sql`

This creates the workflow tables for:

- accounts, members, subscriptions, monthly usage
- projects, documents, document versions, review cycles/requests
- exports and audit logs

### 2) Environment

Copy `.env.example` to `.env.local` and configure:

- Supabase URL/keys
- OpenAI API key/model
- Stripe secret + webhook secret

### 3) API Endpoints

Core endpoints implemented:

- Projects: `GET/POST /api/projects`, `PATCH/DELETE /api/projects/:id`
- Documents: `GET/POST /api/documents`, `GET/PATCH/DELETE /api/documents/:id`
- Reviews:
  - `POST /api/documents/:id/send-for-review`
  - `POST /api/review/:token/view`
  - `POST /api/review/:token/decision`
  - `POST /api/review/requests/:requestId/override`
- AI:
  - `POST /api/ai/improve-rfi`
  - `POST /api/ai/improve-submittal`
  - `POST /api/ai/analyze-change-order`
- Billing:
  - `POST /api/billing/webhook`
  - `GET /api/billing/status`
- Activity:
  - `GET /api/documents/:id/activity`

### 4) Frontend Wiring

Key dashboard pages are wired to these APIs for create/list/edit flows:

- Project creation/list/update/delete
- Document creation/list/edit/delete
- Type-specific AI improve/analyze actions for descriptions
- Send-for-review from document details

### 5) Smoke Testing

Use the smoke script after running `npm run dev`:

- `node scripts/api-smoke.mjs`

It verifies major API routes respond with expected auth/validation behavior.
