// jest.setup.ts
import { fetch, Request, Response, Headers } from 'undici';

Object.assign(global, { fetch, Request, Response, Headers });

// Set a dummy TMDB_API_KEY for tests
process.env.TMDB_API_KEY = 'test-key';

// Prevent accidental real API calls
jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Unexpected fetch call - use mockFetchSequence in your test'));

