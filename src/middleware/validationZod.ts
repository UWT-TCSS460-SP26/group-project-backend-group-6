import { z } from 'zod';
import { RequestHandler } from 'express';

/**
 * Generic middleware factory. Parses `request[source]` against `schema`;
 * on failure responds 400 with issue details, on success replaces the
 * source with the parsed (and coerced) value so downstream handlers get
 * properly typed data.
 */
const validate =
  (source: 'body' | 'params', schema: z.ZodType): RequestHandler =>
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
    request[source] = result.data;
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

// --- Middleware exports ---

export const validateTmdbParam = validate('params', TmdbParamSchema);
export const validateNumericId = validate('params', NumericIdSchema);
export const validateRatingBody = validate('body', RatingBodySchema);
export const validatePatchRatingBody = validate('body', PatchRatingBodySchema);
export const validateReviewBody = validate('body', ReviewBodySchema);
export const validatePatchReviewBody = validate('body', PatchReviewBodySchema);

// --- Inferred types ---

export type RatingBody = z.infer<typeof RatingBodySchema>;
export type PatchRatingBody = z.infer<typeof PatchRatingBodySchema>;
export type ReviewBody = z.infer<typeof ReviewBodySchema>;
export type PatchReviewBody = z.infer<typeof PatchReviewBodySchema>;
