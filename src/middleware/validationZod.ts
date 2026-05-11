import { z } from 'zod';
import { RequestHandler } from 'express';
import { IssueStatus } from '@prisma/client';

const VALID_STATUSES = Object.values(IssueStatus) as [IssueStatus, ...IssueStatus[]];

/**
 * Generic middleware factory. Parses `request[source]` against `schema`;
 * on failure responds 400 with issue details, on success replaces the
 * source with the parsed (and coerced) value so downstream handlers get
 * properly typed data.
 */
const validate =
  (source: 'body' | 'params' | 'query', schema: z.ZodType): RequestHandler =>
  (request, response, next) => {
    const result = schema.safeParse(request[source]);
    if (!result.success) {
      response.status(400).json({
        error: 'Validation failed',
        details: result.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
      return;
    }
    if (source === 'query') {
      Object.defineProperty(request, 'query', {
        configurable: true,
        enumerable: true,
        writable: true,
        value: result.data,
      });
    } else {
      request[source] = result.data;
    }
    next();
  };

// --- Schemas ---

const TmdbParamSchema = z.object({
  tmdbId: z.coerce.number().int().positive(),
});

const NumericIdSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const RatingBodySchema = z.object({
  score: z.number().int().min(1).max(10),
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(['movie', 'tv']),
});

const PatchRatingBodySchema = z.object({
  score: z.number().int().min(1).max(10),
});

const ReviewBodySchema = z.object({
  title: z.string().trim().min(1).optional(),
  body: z.string().trim().min(1),
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(['movie', 'tv']),
});

const PatchReviewBodySchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    body: z.string().trim().min(1).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required (title, body)',
  });

const IssueListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  status: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val) return true;
        return val
          .split(',')
          .map((s) => s.trim())
          .every((s) => (VALID_STATUSES as string[]).includes(s));
      },
      { message: `status must be one or more of: ${VALID_STATUSES.join(', ')}` }
    ),
  sort: z.enum(['newest', 'oldest']).optional(),
});

const PatchIssueBodySchema = z
  .object({
    status: z.nativeEnum(IssueStatus).optional(),
  })
  .strict();

// --- Middleware exports ---

export const validateTmdbParam = validate('params', TmdbParamSchema);
export const validateNumericId = validate('params', NumericIdSchema);
export const validateRatingBody = validate('body', RatingBodySchema);
export const validatePatchRatingBody = validate('body', PatchRatingBodySchema);
export const validateReviewBody = validate('body', ReviewBodySchema);
export const validatePatchReviewBody = validate('body', PatchReviewBodySchema);
export const validateIssueListQuery = validate('query', IssueListQuerySchema);
export const validatePatchIssueBody = validate('body', PatchIssueBodySchema);

// --- Inferred types ---

export type RatingBody = z.infer<typeof RatingBodySchema>;
export type PatchRatingBody = z.infer<typeof PatchRatingBodySchema>;
export type ReviewBody = z.infer<typeof ReviewBodySchema>;
export type PatchReviewBody = z.infer<typeof PatchReviewBodySchema>;
export type IssueListQuery = z.infer<typeof IssueListQuerySchema>;
export type PatchIssueBody = z.infer<typeof PatchIssueBodySchema>;