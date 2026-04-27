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
import devAuthRouter from './routes/devAuth';
const app = express();

app.use(cors());
app.use(express.json());
app.use('/auth', devAuthRouter);

const specPath = path.resolve(process.cwd(), 'openapi.yaml');
const specFile = fs.readFileSync(specPath, 'utf8');
const spec = YAML.parse(specFile);
app.get('/openapi.json', (_request: Request, response: Response) => {
  response.json(spec);
});
app.use('/api-docs', apiReference({ spec: { url: '/openapi.json' } }));

app.get('/health', (_request: Request, response: Response) => {
  response.json({ status: 'OK' });
});
app.use('/v1/media', tvRouter);

app.use('/v1/media/movies', moviesRouter);
app.use('/v1/ratings', ratingsRouter);
app.use('/v1/reviews', reviewsRouter);

app.use((_request: Request, response: Response) => {
  response.status(404).json({ error: 'Route not found' });
});

export { app };
