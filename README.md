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
  - `GET /auth/google/start` (web OAuth entrypoint)
  - `GET /auth/google/callback` (Google OAuth callback)
  - `POST /auth/refresh`
  - `POST /auth/logout`
  - `GET /auth/me`

Required API env vars:
- `JWT_ACCESS_SECRET`
- `JWT_ACCESS_EXPIRES_IN_SECONDS` (default `900`)
- `REFRESH_TOKEN_TTL_DAYS` (default `30`)
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` (e.g. `http://localhost:4000/auth/google/callback`)
- `WEB_AUTH_SUCCESS_REDIRECT` (e.g. `http://localhost:3000/auth/callback`)
- `WEB_AUTH_FAILURE_REDIRECT` (e.g. `http://localhost:3000/login`)

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
