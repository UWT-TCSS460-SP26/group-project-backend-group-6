// jest.setup.ts
import { fetch as undiciFetch, Request, Response, Headers } from 'undici';

Object.assign(global, { fetch: undiciFetch, Request, Response, Headers });

// Set a dummy TMDB_API_KEY for tests
process.env.TMDB_API_KEY = 'test-key';
