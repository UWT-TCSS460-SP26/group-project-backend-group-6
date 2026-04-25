import { Request, Response, NextFunction } from 'express';

/**
 * Validates that the 'title' search parameter is present for media search.
 */
export const requireSearchQuery = (request: Request, response: Response, next: NextFunction) => {
  if (!request.query.title) {
    response.status(400).json({ error: 'Missing required query parameter: title' });
    return;
  }
  next();
};

/**
 * Validates that the ':id' route parameter is a positive integer.
 */
export const validateNumericId = (request: Request, response: Response, next: NextFunction) => {
  const id = Number(request.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    response.status(400).json({ error: 'Parameter "id" must be a positive integer' });
    return;
  }
  next();
};

/**
 * Returns middleware that blocks the route if the given environment variable is not set.
 */
export const requireEnvVar =
  (name: string) => (_request: Request, response: Response, next: NextFunction) => {
    if (!process.env[name]) {
      response.status(503).json({ error: `Server misconfiguration: missing env var ${name}` });
      return;
    }
    next();
  };
