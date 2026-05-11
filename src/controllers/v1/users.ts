import { Request, Response } from 'express';
import { URL } from 'url';
import { prisma } from '../../lib/prisma';
import { resolveLocalUser, bearerToken } from '../../lib/resolveLocalUser';

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

export const getMyRatings = async (request: Request, response: Response): Promise<void> => {
  const page = Math.max(1, Number(request.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(request.query.pageSize) || 20));
  const sort = request.query.sort === 'score' ? 'score' : 'date';
  const mediaTypeFilter = request.query.mediaType as string | undefined;

  if (mediaTypeFilter && mediaTypeFilter !== 'movie' && mediaTypeFilter !== 'tv') {
    response
      .status(400)
      .json({ error: 'Bad Request', message: 'mediaType must be "movie" or "tv"' });
    return;
  }

  const localUser = await resolveLocalUser(bearerToken(request), request.user!);

  const where = {
    userId: localUser.id,
    ...(mediaTypeFilter ? { mediaType: mediaTypeFilter as MediaType } : {}),
  };

  const orderBy = sort === 'score' ? { score: 'desc' as const } : { createdAt: 'desc' as const };

  const [ratings, totalCount] = await Promise.all([
    prisma.rating.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy }),
    prisma.rating.count({ where }),
  ]);

  // Fan out one TMDB call per rating in parallel. Failures (network errors or
  // removed titles) yield null so one bad lookup doesn't fail the whole response.
  const tmdbResults = await Promise.allSettled(
    ratings.map((r) => fetchTmdbCard(r.tmdbId, r.mediaType as MediaType))
  );

  const results = ratings.map((rating, i) => {
    const settled = tmdbResults[i];
    return {
      id: rating.id,
      score: rating.score,
      tmdbId: rating.tmdbId,
      mediaType: rating.mediaType,
      createdAt: rating.createdAt,
      updatedAt: rating.updatedAt,
      tmdb: settled.status === 'fulfilled' ? settled.value : null,
    };
  });

  response.json({
    page,
    pageSize,
    totalCount,
    totalPages: Math.ceil(totalCount / pageSize),
    sort,
    results,
  });
};
