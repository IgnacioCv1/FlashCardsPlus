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

## Google OAuth setup (web)
1. Copy env template:
   - `cp apps/web/.env.example apps/web/.env`
2. Set values in `apps/web/.env`:
   - `DATABASE_URL="file:./dev.db"`
   - `AUTH_SECRET` (generate with `openssl rand -hex 32`)
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
3. Generate Prisma client and migrate auth schema:
   - `npm run prisma:generate -w @flashcards/web`
   - `npm run prisma:migrate -w @flashcards/web`
4. In Google Cloud Console OAuth client, add redirect URI:
   - `http://localhost:3000/api/auth/callback/google`
