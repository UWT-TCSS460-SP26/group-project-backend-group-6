# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server with hot reload (tsx watch + .env)
npm run build        # Compile TypeScript to dist/
npm start            # Run compiled output
npm test             # Run Jest tests
npm run test:watch   # Run Jest in watch mode
npm run lint         # ESLint
npm run lint:fix     # ESLint with auto-fix
npm run format       # Prettier format
npm run format:check # Check Prettier formatting
```

Requires Node.js >= 22.0.0.

## Architecture

This is a stateless Express 5 + TypeScript REST API that acts as a proxy for [The Movie Database (TMDB)](https://www.themoviedb.org/). It fetches data from TMDB, transforms the responses into custom schemas, and returns JSON to clients. There is no database.

**Request flow:** Client → Express middleware (CORS, JSON body parsing) → Route-level validation middleware → Controller → TMDB API call → transformed response → Client

**Entry points:**

- `src/index.ts` — loads `.env`, starts Express on `PORT` (default 3000)
- `src/app.ts` — sets up middleware, mounts routes, serves OpenAPI docs at `/api-docs` via Scalar

## Key Modules

- `src/controllers/tmdb.ts` — All TMDB proxy logic. Each controller fetches from `https://api.themoviedb.org/3`, transforms the response (e.g., normalizes `title`/`name`, extracts `releaseYear`, prefixes image URLs with `https://image.tmdb.org/t/p/w500`), and returns shaped JSON. Returns 502 on fetch failure; propagates TMDB error status codes otherwise.
- `src/routes/proxy/tmdb.ts` — Express router defining `/media/movies/*` and `/media/tv/*` endpoints; applies validation middleware before each controller.
- `src/middleware/validation.ts` — Reusable request validators: `requireSearchQuery` (validates `?query=`), `validateNumericId` (validates route `:id` param). Also exports `requireEnvVar(name)` which guards routes from running when a required env var is absent.
- `src/middleware/logger.ts` — Minimal request logger (timestamp, method, path).

## Environment Variables

| Variable       | Required | Description                                     |
| -------------- | -------- | ----------------------------------------------- |
| `PORT`         | No       | Server port (default: `3000`)                   |
| `TMDB_API_KEY` | Yes      | TMDB API key; used in every movie/TV controller |

Copy `.env.example` to `.env` and add your TMDB API key.

## API Specification

The full OpenAPI 3.0.3 spec lives in `openapi.yaml`. Interactive docs are available at `/api-docs` when the server is running. The spec is the source of truth for request/response schemas — consult it when adding or modifying endpoints.

## Deployment

Deployed on Render at `https://tcss460-team-6-api.onrender.com`.
