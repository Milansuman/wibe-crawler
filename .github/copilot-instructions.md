# GitHub Copilot Instructions

## Architecture Overview

This is a full-stack TypeScript monorepo with a **Bun runtime** throughout. The architecture consists of:

- **Backend** ([backend/](backend/)): Hono server with oRPC endpoints, Better Auth authentication, and Drizzle ORM
- **Frontend** ([frontend/](frontend/)): SvelteKit 5 application with TanStack Query via oRPC client
- **Database**: PostgreSQL 16 running in Docker

### Tech Stack

- **Runtime**: Bun (not Node.js) - all scripts use `bun` commands
- **Backend**: Hono + oRPC server + Better Auth + Drizzle ORM + PostgreSQL
- **Frontend**: SvelteKit 5 + Svelte 5 (runes API) + TailwindCSS 4 + bits-ui
- **Type Safety**: Full end-to-end type safety via oRPC shared router

## Critical Workflows

### Development Setup

1. Start PostgreSQL: `docker compose up` (from project root)
2. Backend setup:
   ```bash
   cd backend
   bun install
   bun db:push          # Sync schema to database via Drizzle
   bun dev              # Starts on :3000 with --hot reload
   ```
3. Frontend setup:
   ```bash
   cd frontend
   bun install
   bun dev              # Starts on :5173
   ```

### Environment Configuration

Backend ([backend/.env](backend/.env)):
```dotenv
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/wibe_crawler
BETTER_AUTH_SECRET=your-secret-key
BETTER_AUTH_URL=http://localhost:3000
```

Frontend ([frontend/.env](frontend/.env)):
```dotenv
BACKEND_URL=http://localhost:3000
```

### Database Schema Changes

Use Drizzle Kit workflow:
1. Modify [backend/lib/db/schema.ts](backend/lib/db/schema.ts)
2. Run `bun db:push` to sync changes to database
3. Schema uses Better Auth tables: `user`, `session`, `account`, `verification`

## Project-Specific Patterns

### oRPC Communication Pattern

**Backend** defines RPC procedures in [backend/src/router.ts](backend/src/router.ts)

**Frontend** imports backend router for type safety in [frontend/src/lib/api-client.ts](frontend/src/lib/api-client.ts):
```typescript
import router from "../../../backend/src/router";
const client: RouterClient<typeof router> = createORPCClient(link);
export const orpc = createTanstackQueryUtils(client);
```

This enables **full type safety across client/server boundary** without code generation.

### Authentication Flow

Better Auth is configured in [backend/lib/auth.ts](backend/lib/auth.ts) with:
- Email/password authentication enabled
- Drizzle adapter for PostgreSQL persistence
- Trusted origin: `http://localhost:5173`

Frontend uses Better Auth Svelte client in [frontend/src/lib/auth-client.ts](frontend/src/lib/auth-client.ts).

Auth endpoints mounted at `/api/auth/*` in [backend/src/index.ts](backend/src/index.ts).

### CORS Configuration

**Two separate CORS setups** in [backend/src/index.ts](backend/src/index.ts):
1. **oRPC endpoints** (`/rpc/*`): Use CORSPlugin with `origin: "localhost:5173"`
2. **Better Auth endpoints** (`/api/auth/*`): Use Hono CORS middleware with `credentials: true`

### UI Components

Follow **shadcn-svelte** pattern in [frontend/src/lib/components/ui/](frontend/src/lib/components/ui/):
- Each component has its own folder with `index.ts` for exports
- Use `bits-ui` for headless primitives
- TailwindCSS 4 with `tailwind-merge` and `tailwind-variants` utilities
- Svelte 5 runes API (`$state`, `$derived`, `$effect`)

### Database Access

Always import from [backend/lib/db/index.ts](backend/lib/db/index.ts):
```typescript
import { db } from './lib/db';
```

Database configuration in [backend/drizzle.config.ts](backend/drizzle.config.ts) points to `./lib/db/schema.ts`.

## Common Pitfalls

1. **Don't use npm/pnpm/yarn** - this project uses Bun exclusively
2. **Backend runs on :3000, frontend on :5173** - adjust CORS/env vars accordingly
4. **Better Auth schema is managed automatically** - don't manually create auth tables
5. **Frontend must import backend router directly** - maintains type safety without codegen
6. **Use `bun db:push`** not `bun migrate` - project uses Drizzle Kit push workflow

## Key Integration Points

- **RPC Handler**: [backend/src/index.ts](backend/src/index.ts) mounts oRPC at `/rpc/*` prefix
- **Auth Handler**: [backend/src/index.ts](backend/src/index.ts) mounts Better Auth at `/api/auth/*`
- **Database Connection**: [backend/lib/db/index.ts](backend/lib/db/index.ts) uses `DATABASE_URL` env var
- **Frontend API Client**: [frontend/src/lib/api-client.ts](frontend/src/lib/api-client.ts) wraps oRPC with TanStack Query
