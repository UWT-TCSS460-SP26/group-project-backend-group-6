import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { apiReference } from '@scalar/express-api-reference';
import { moviesRouter } from './routes/v1/media/movies';
import { tvRouter } from './routes/v1/media/tv';
import { ratingsRouter } from './routes/v1/ratings';
import { reviewsRouter } from './routes/v1/reviews';
import { issuesRouter } from './routes/v1/issues';

const app = express();

// ── CORS ─────────────────────────────────────────────────────────────────────
// Allowlist is read from CORS_ALLOWED_ORIGINS (comma-separated) so you can
// update it without redeploying code.  In dev, set it to http://localhost:3000
// (or whatever port your FE runs on).  In production, add your deployed FE
// origin and your downstream partner's origin.
//
// Example .env entry:
//   CORS_ALLOWED_ORIGINS=http://localhost:3000,https://partner-app.example.com
const rawOrigins = process.env.CORS_ALLOWED_ORIGINS ?? '';
const allowedOrigins = rawOrigins
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server requests (no Origin header) and curl/Postman.
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin ${origin} is not in the allowlist`));
    },
    // Allow the Authorization header on cross-origin preflight requests.
    // Without this, browsers will block token-bearing requests from the FE.
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })
);

app.use(express.json());

// ── OpenAPI / Scalar ─────────────────────────────────────────────────────────
const specPath = path.resolve(process.cwd(), 'openapi.yaml');
const specFile = fs.readFileSync(specPath, 'utf8');
const spec = YAML.parse(specFile);

app.get('/openapi.json', (_request: Request, response: Response) => {
  response.json(spec);
});
app.use('/api-docs', apiReference({ spec: { url: '/openapi.json' } }));

// ── Health ───────────────────────────────────────────────────────────────────
app.get('/health', (_request: Request, response: Response) => {
  response.json({ status: 'OK' });
});

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/v1/media', tvRouter);
app.use('/v1/media/movies', moviesRouter);
app.use('/v1/ratings', ratingsRouter);
app.use('/v1/reviews', reviewsRouter);
app.use('/v1/issues', issuesRouter);

// ── 404 catch-all ────────────────────────────────────────────────────────────
app.use((_request: Request, response: Response) => {
  response.status(404).json({ error: 'Route not found' });
});

export { app };
