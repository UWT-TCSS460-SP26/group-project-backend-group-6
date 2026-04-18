import { Request, Response, NextFunction } from 'express';

/**
 * Validates that the 'query' search parameter is present for media search.
 */
export const requireSearchQuery = (request: Request, response: Response, next: NextFunction) => {
    if (!request.query.query) {
        response.status(400).json({ error: 'Missing required query parameter: query' });
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
 * Validates that a required environment variable is configured.
 */
export const requireEnvVar = (envVar: string) => {
    return (_request: Request, response: Response, next: NextFunction) => {
        if (!process.env[envVar]) {
            response.status(500).json({ error: `${envVar} is not configured` });
            return;
        }
        next();
    };
};