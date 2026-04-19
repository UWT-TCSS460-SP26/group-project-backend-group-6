// jest.setup.ts
import { fetch, Request, Response, Headers } from 'undici';

Object.assign(global, { fetch, Request, Response, Headers });
