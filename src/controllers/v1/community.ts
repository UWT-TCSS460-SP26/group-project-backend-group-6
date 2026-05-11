import { Request, Response } from 'express';
import { URL } from 'url';
import { prisma } from '../../lib/prisma';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';

type MediaType = 'movie' | 'tv';

const buildTmdbUrl = (path: string, params: Record<string, string | number> = {}): string => {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set('api_key', process.env.TMDB_API_KEY!);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  return url.toString();
};

const img = (path: unknown, size: string): string | null =>
  typeof path === 'string' && path ? `${IMG_BASE}/${size}${path}` : null;

const releaseYear = (date: unknown): number => {
  if (typeof date !== 'string' || !date) return 0;
  const y = Number(date.split('-')[0]);
  return Number.isInteger(y) ? y : 0;
};

const fetchTmdbCard = async (
  tmdbId: number,
  mediaType: MediaType
): Promise<Record<string, unknown> | null> => {
  const path = mediaType === 'movie' ? `/movie/${tmdbId}` : `/tv/${tmdbId}`;
  const res = await fetch(buildTmdbUrl(path, { language: 'en-US' }));
  if (!res.ok) return null;
  const data = (await res.json()) as Record<string, unknown>;

  if (mediaType === 'movie') {
    return {
      id: data['id'],
      title: data['title'],
      overview: data['overview'] || '',
      releaseYear: releaseYear(data['release_date']),
      releaseDate: data['release_date'] ?? null,
      posterUrl: img(data['poster_path'], 'w500'),
      genres: Array.isArray(data['genres'])
        ? (data['genres'] as { id: number; name: string }[]).map((g) => ({
            id: g.id,
            name: g.name,
          }))
        : [],
    };
  }

  return {
    id: data['id'],
    title: data['name'],
    overview: data['overview'] || '',
    releaseYear: releaseYear(data['first_air_date']),
    firstAirDate: data['first_air_date'] ?? null,
    posterUrl: img(data['poster_path'], 'w500'),
    genres: Array.isArray(data['genres'])
      ? (data['genres'] as { id: number; name: string }[]).map((g) => ({
          id: g.id,
          name: g.name,
        }))
      : [],
  };
};

const enrichRows = async (
  rows: { tmdbId: number; mediaType: string; _avg: { score: number | null }; _count: { score: number } }[]
) => {
  const tmdbResults = await Promise.allSettled(
    rows.map((r) => fetchTmdbCard(r.tmdbId, r.mediaType as MediaType))
  );

  return rows.map((row, i) => {
    const settled = tmdbResults[i];
    return {
      rank: i + 1,
      tmdbId: row.tmdbId,
      mediaType: row.mediaType,
      averageScore: row._avg.score !== null ? Math.round(row._avg.score * 10) / 10 : null,
      ratingCount: row._count.score,
      tmdb: settled.status === 'fulfilled' ? settled.value : null,
    };
  });
};

/**
 * GET /v1/community/top-rated
 * Items with the highest community average score, filtered by a minimum vote
 * count so single-review outliers don't dominate the list.
 * Aggregation runs in the DB (GROUP BY + HAVING) — no in-memory computation.
 */
export const getTopRated = async (request: Request, response: Response): Promise<void> => {
  const limit = Math.min(25, Math.max(1, Number(request.query.limit) || 10));
  const minVotes = Math.max(1, Number(request.query.minVotes) || 3);
  const mediaTypeFilter = request.query.mediaType as string | undefined;

  if (mediaTypeFilter && mediaTypeFilter !== 'movie' && mediaTypeFilter !== 'tv') {
    response
      .status(400)
      .json({ error: 'Bad Request', message: 'mediaType must be "movie" or "tv"' });
    return;
  }

  const rows = await prisma.rating.groupBy({
    by: ['tmdbId', 'mediaType'],
    where: mediaTypeFilter ? { mediaType: mediaTypeFilter as MediaType } : undefined,
    _avg: { score: true },
    _count: { score: true },
    having: { score: { _count: { gte: minVotes } } },
    orderBy: [{ _avg: { score: 'desc' } }],
    take: limit,
  });

  const results = await enrichRows(rows);

  response.json({ feed: 'top-rated', minVotes, results });
};

/**
 * GET /v1/community/most-reviewed
 * Items with the most ratings regardless of score — shows what the community
 * is actively engaging with right now.
 * Aggregation runs in the DB (GROUP BY ORDER BY COUNT) — no in-memory computation.
 */
export const getMostReviewed = async (request: Request, response: Response): Promise<void> => {
  const limit = Math.min(25, Math.max(1, Number(request.query.limit) || 10));
  const mediaTypeFilter = request.query.mediaType as string | undefined;

  if (mediaTypeFilter && mediaTypeFilter !== 'movie' && mediaTypeFilter !== 'tv') {
    response
      .status(400)
      .json({ error: 'Bad Request', message: 'mediaType must be "movie" or "tv"' });
    return;
  }

  const rows = await prisma.rating.groupBy({
    by: ['tmdbId', 'mediaType'],
    where: mediaTypeFilter ? { mediaType: mediaTypeFilter as MediaType } : undefined,
    _avg: { score: true },
    _count: { score: true },
    orderBy: [{ _count: { score: 'desc' } }],
    take: limit,
  });

  const results = await enrichRows(rows);

  response.json({ feed: 'most-reviewed', results });
};
