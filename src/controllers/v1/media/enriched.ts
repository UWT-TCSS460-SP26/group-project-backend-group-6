import { Request, Response } from 'express';
import { URL } from 'url';
import { prisma } from '../../../lib/prisma';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';

type MediaType = 'movie' | 'tv';

type ReviewWithUser = {
  id: number;
  title: string | null;
  body: string;
  createdAt: Date;
  user: { username: string; displayName: string | null };
};

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

const fetchCommunityData = async (tmdbId: number, mediaType: MediaType) => {
  const where = { tmdbId, mediaType };
  const [aggregate, reviewCount, recentReviews] = await Promise.all([
    prisma.rating.aggregate({ where, _avg: { score: true } }),
    prisma.review.count({ where }),
    prisma.review.findMany({
      where,
      take: 3,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { username: true, displayName: true } } },
    }),
  ]);
  return {
    averageRating: aggregate._avg.score ?? null,
    reviewCount,
    recentReviews: (recentReviews as ReviewWithUser[]).map((r) => ({
      id: r.id,
      title: r.title ?? null,
      body: r.body,
      author: r.user.displayName ?? r.user.username,
      createdAt: r.createdAt,
    })),
  };
};

const fetchMyRating = async (
  sub: string,
  tmdbId: number,
  mediaType: MediaType
): Promise<number | null> => {
  const localUser = await prisma.user.findUnique({
    where: { subjectId: sub },
    select: { id: true },
  });
  if (!localUser) return null;
  const rating = await prisma.rating.findUnique({
    where: { userId_tmdbId_mediaType: { userId: localUser.id, tmdbId, mediaType } },
    select: { score: true },
  });
  return rating?.score ?? null;
};

export const getEnrichedMovieDetail = async (
  request: Request,
  response: Response
): Promise<void> => {
  const tmdbId = Number(request.params.id);

  try {
    const [tmdbResult, communityData] = await Promise.all([
      fetch(
        buildTmdbUrl(`/movie/${tmdbId}`, {
          language: 'en-US',
          append_to_response: 'credits,similar',
        })
      ),
      fetchCommunityData(tmdbId, 'movie'),
    ]);

    const data = (await tmdbResult.json()) as Record<string, unknown>;
    if (!tmdbResult.ok) {
      response.status(tmdbResult.status).json({ error: data['status_message'] || 'TMDB error' });
      return;
    }

    const credits = data['credits'] as Record<string, unknown> | undefined;
    const cast = Array.isArray(credits?.cast)
      ? (credits!.cast as Record<string, unknown>[]).slice(0, 10).map((m) => ({
          name: m['name'],
          character: m['character'],
          profileUrl: img(m['profile_path'], 'w185'),
        }))
      : [];

    const similarRaw = data['similar'] as Record<string, unknown> | undefined;
    const similar = Array.isArray(similarRaw?.results)
      ? (similarRaw!.results as Record<string, unknown>[]).slice(0, 6).map((m) => ({
          id: m['id'],
          title: m['title'],
          releaseYear: releaseYear(m['release_date']),
          posterUrl: img(m['poster_path'], 'w500'),
          overview: m['overview'] || '',
          rating: m['vote_average'] ?? 0,
          genres: Array.isArray(m['genre_ids'])
            ? (m['genre_ids'] as number[]).map((id) => ({ id }))
            : [],
        }))
      : [];

    const tmdb = {
      id: data['id'],
      title: data['title'],
      tagline: data['tagline'] || '',
      overview: data['overview'] || '',
      releaseYear: releaseYear(data['release_date']),
      releaseDate: data['release_date'] || null,
      runtimeMinutes: data['runtime'] ?? null,
      posterUrl: img(data['poster_path'], 'w500'),
      backdropUrl: img(data['backdrop_path'], 'original'),
      status: data['status'] || '',
      genres: Array.isArray(data['genres'])
        ? (data['genres'] as Record<string, unknown>[]).map((g) => ({
            id: g['id'],
            name: g['name'],
          }))
        : [],
      cast,
      similar,
    };

    const community = request.user
      ? { ...communityData, myRating: await fetchMyRating(request.user.sub, tmdbId, 'movie') }
      : communityData;

    response.json({ tmdb, community });
  } catch (_error) {
    response.status(502).json({ error: 'Failed to reach TMDB' });
  }
};

export const getEnrichedTvDetail = async (request: Request, response: Response): Promise<void> => {
  const tmdbId = Number(request.params.id);

  try {
    const [tmdbResult, similarResult, communityData] = await Promise.all([
      fetch(buildTmdbUrl(`/tv/${tmdbId}`, { language: 'en-US', append_to_response: 'credits' })),
      fetch(buildTmdbUrl(`/tv/${tmdbId}/similar`)),
      fetchCommunityData(tmdbId, 'tv'),
    ]);

    const data = (await tmdbResult.json()) as Record<string, unknown>;
    if (!tmdbResult.ok) {
      response.status(tmdbResult.status).json({ error: data['status_message'] || 'TMDB error' });
      return;
    }

    const similarRaw = similarResult.ok
      ? ((await similarResult.json()) as Record<string, unknown>)
      : {};

    const credits = data['credits'] as Record<string, unknown> | undefined;
    const cast = Array.isArray(credits?.cast)
      ? (credits!.cast as Record<string, unknown>[]).slice(0, 10).map((m) => ({
          name: m['name'],
          character: m['character'],
          profileUrl: img(m['profile_path'], 'w185'),
        }))
      : [];

    const similar = Array.isArray(similarRaw['results'])
      ? (similarRaw['results'] as Record<string, unknown>[]).slice(0, 6).map((item) => ({
          id: item['id'],
          title: item['name'],
          firstAirDate: item['first_air_date'] ?? null,
          posterUrl: img(item['poster_path'], 'w500'),
          overview: item['overview'] || '',
          rating: item['vote_average'],
          genres: ((item['genre_ids'] as number[]) ?? []).map((id) => ({ id })),
        }))
      : [];

    const networks = Array.isArray(data['networks'])
      ? (data['networks'] as Record<string, unknown>[]).map((n) => ({
          name: n['name'],
          logoUrl: img(n['logo_path'], 'w92'),
        }))
      : [];

    const seasons = Array.isArray(data['seasons'])
      ? (data['seasons'] as Record<string, unknown>[])
          .filter((s) => (s['season_number'] as number) > 0)
          .map((s) => ({
            seasonNumber: s['season_number'],
            episodeCount: s['episode_count'],
            airDate: s['air_date'] ?? null,
            posterUrl: img(s['poster_path'], 'w500'),
          }))
      : [];

    const tmdb = {
      id: data['id'],
      title: data['name'],
      overview: data['overview'] || '',
      firstAirDate: data['first_air_date'] ?? null,
      lastAirDate: data['last_air_date'] ?? null,
      status: data['status'] || '',
      totalSeasons: data['number_of_seasons'] ?? null,
      totalEpisodes: data['number_of_episodes'] ?? null,
      averageEpisodeMinutes: (data['episode_run_time'] as number[])?.[0] ?? null,
      posterUrl: img(data['poster_path'], 'w500'),
      backdropUrl: img(data['backdrop_path'], 'original'),
      genres: (data['genres'] as { id: number; name: string }[]) ?? [],
      networks,
      seasons,
      cast,
      similar,
    };

    const community = request.user
      ? { ...communityData, myRating: await fetchMyRating(request.user.sub, tmdbId, 'tv') }
      : communityData;

    response.json({ tmdb, community });
  } catch (_error) {
    response.status(502).json({ error: 'Failed to reach TMDB' });
  }
};
