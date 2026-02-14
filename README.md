# Flashcards Monorepo

## Apps
- `apps/web`: Next.js frontend
- `apps/api`: Express API + Prisma + SQLite

## Packages
- `packages/shared`: Shared Zod schemas and TypeScript types

## Quick start
1. Install dependencies:
   - `npm install`
2. Generate Prisma client:
   - `npm run prisma:generate -w @flashcards/api`
3. Create SQLite DB + apply schema:
   - `npm run prisma:migrate -w @flashcards/api`
4. Run apps:
   - API: `npm run dev:api`
   - Web: `npm run dev:web`

## API auth (current)
- `apps/api` now owns auth and validates bearer access tokens on protected routes.
- Protected routes:
  - `/decks/*`
  - `/cards/*`
- Auth endpoints:
  - `POST /auth/dev-login` (development only)
  - `POST /auth/dev-set-plan` (development only)
  - `GET /auth/google/start` (web OAuth entrypoint)
  - `GET /auth/google/callback` (Google OAuth callback)
  - `POST /auth/refresh`
  - `POST /auth/logout`
  - `GET /auth/me`
  - `POST /ingest/generate-preview` (upload PDF/DOCX and create draft preview)
  - `GET /ingest/previews/:previewId` (load pending draft preview)
  - `POST /ingest/previews/:previewId/commit` (commit reviewed cards to deck)
  - `DELETE /ingest/previews/:previewId` (discard draft preview)
  - `POST /ingest/generate-cards` (legacy alias to `generate-preview`)
  - `GET /ai/settings` (current plan, model mapping, monthly limits, usage)

Required API env vars:
- `JWT_ACCESS_SECRET`
- `JWT_ACCESS_EXPIRES_IN_SECONDS` (default `900`)
- `REFRESH_TOKEN_TTL_DAYS` (default `30`)
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` (e.g. `http://localhost:4000/auth/google/callback`)
- `WEB_AUTH_SUCCESS_REDIRECT` (e.g. `http://localhost:3000/auth/callback`)
- `WEB_AUTH_FAILURE_REDIRECT` (e.g. `http://localhost:3000/login`)
- `INGEST_DRAFT_CLEANUP_INTERVAL_MINUTES` (default `60`, auto-deletes expired drafts)
- `AI_INGEST_PROVIDER` (`gemini` or `mock`)
- `GEMINI_API_KEY` (required when `AI_INGEST_PROVIDER=gemini`)

Current plan tiers:
- `FREE`: document generation model `gemini-2.5-flash-lite`, up to 3 document generations/month
- `PRO`: document generation model `gemini-2.5-flash`, up to 20 document generations/month
- Grading/chat model mapping is exposed via `GET /ai/settings`

## Google OAuth setup (API-first)
1. Copy API env template:
   - `cp apps/api/.env.example apps/api/.env`
2. Configure Google credentials and redirect URI in `apps/api/.env`.
3. In Google Cloud Console OAuth client, add redirect URI:
   - `http://localhost:4000/auth/google/callback`
4. Start login from web by redirecting to:
   - `http://localhost:4000/auth/google/start?client=web`

## Web auth client setup
1. Copy web env template:
   - `cp apps/web/.env.example apps/web/.env`
2. Set API base URL:
   - `NEXT_PUBLIC_API_BASE_URL="http://localhost:4000"`
3. Web auth state is managed in `apps/web/components/auth-provider.tsx` and refreshed from API (`/auth/refresh` + `/auth/me`).
