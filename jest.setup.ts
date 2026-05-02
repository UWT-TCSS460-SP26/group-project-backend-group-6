// jest.setup.ts
import { fetch as undiciFetch, Request, Response, Headers } from 'undici';

Object.assign(global, { fetch: undiciFetch, Request, Response, Headers });

// Set a dummy TMDB_API_KEY for tests
process.env.TMDB_API_KEY = 'test-key';
process.env.JWT_SECRET = 'test-secret';

process.env.AUTH_ISSUER = 'https://fake.issuer.com/';
process.env.API_AUDIENCE = 'https://fake.audience.com/';
process.env.DATABASE_URL = 'postgresql://fake:fake@localhost:5432/fake';
