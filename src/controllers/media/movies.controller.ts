import { Request, Response } from 'express';
import { URL } from 'url';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';

type TMDBGenre = { id: number; name: string };
export let genreCache: Record<number, string> | null = null;

export const resetGenreCache = () => {
  genreCache = null;
};

const getApiKey = () => {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error('TMDB_API_KEY is not configured');
  }
  return apiKey;
};

const buildTmdbUrl = (path: string, params?: Record<string, string | number | undefined>) => {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set('api_key', getApiKey());

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value) !== '') {
        url.searchParams.set(key, String(value));
      }
    });
  }

  return url.toString();
};

const parseReleaseYear = (releaseDate: unknown): number => {
  if (typeof releaseDate !== 'string' || !releaseDate) {
    return 0;
  }

  const year = Number(releaseDate.split('-')[0]);
  return Number.isInteger(year) ? year : 0;
};

const buildImageUrl = (path: unknown, size: string) => {
  return typeof path === 'string' && path ? `${IMG_BASE}/${size}${path}` : null;
};

const mapGenreIds = async (genreIds: unknown): Promise<Array<{ id: number; name: string }>> => {
  if (!Array.isArray(genreIds)) {
    return [];
  }

  if (!genreCache) {
    const result = await fetch(buildTmdbUrl('/genre/movie/list', { language: 'en-US' }));
    const data = (await result.json()) as { genres?: TMDBGenre[] };

    genreCache = {};
    if (result.ok && Array.isArray(data.genres)) {
      data.genres.forEach((genre) => {
        genreCache![genre.id] = genre.name;
      });
    }
  }

  return genreIds
    .filter((id): id is number => typeof id === 'number')
    .map((id) => ({ id, name: genreCache?.[id] ?? 'Unknown' }));
};

const transformMovieCard = async (item: Record<string, unknown>) => {
  return {
    id: item['id'],
    title: item['title'],
    releaseYear: parseReleaseYear(item['release_date']),
    posterUrl: buildImageUrl(item['poster_path'], 'w500'),
    overview: item['overview'] || '',
    rating: item['vote_average'] ?? 0,
    genres: await mapGenreIds(item['genre_ids']),
  };
};

const transformCastMember = (castItem: Record<string, unknown>) => ({
  name: castItem['name'] || '',
  character: castItem['character'] || '',
  profileUrl: buildImageUrl(castItem['profile_path'], 'w185'),
});

const transformMovieDetail = async (data: Record<string, unknown>) => ({
  id: data['id'],
  title: data['title'],
  tagline: data['tagline'] || '',
  overview: data['overview'] || '',
  releaseYear: parseReleaseYear(data['release_date']),
  releaseDate: data['release_date'] || null,
  runtimeMinutes: data['runtime'] ?? null,
  voteCount: data['vote_count'] ?? 0,
  backdropUrl: buildImageUrl(data['backdrop_path'], 'original'),
  posterUrl: buildImageUrl(data['poster_path'], 'w500'),
  rating: data['vote_average'] ?? 0,
  status: data['status'] || '',
  genres: Array.isArray(data['genres'])
    ? (data['genres'] as Record<string, unknown>[]).map((genre) => ({
        id: genre['id'],
        name: genre['name'],
      }))
    : [],
  cast: Array.isArray((data['credits'] as Record<string, unknown>)?.cast)
    ? ((data['credits'] as Record<string, unknown>)!.cast as Record<string, unknown>[])
        .slice(0, 10)
        .map(transformCastMember)
    : [],
  similar: Array.isArray((data['similar'] as Record<string, unknown>)?.results)
    ? await Promise.all(
        ((data['similar'] as Record<string, unknown>)!.results as Record<string, unknown>[])
          .slice(0, 6)
          .map(transformMovieCard)
      )
    : [],
});

export const searchMovies = async (request: Request, response: Response) => {
  const { query, year, genreId, page } = request.query;

  try {
    const url = buildTmdbUrl('/search/movie', {
      query: String(query),
      year: year ? String(year) : undefined,
      page: page ? Number(page) : 1,
      language: 'en-US',
    });

    const result = await fetch(url);
    const data = (await result.json()) as Record<string, unknown>;

    if (!result.ok) {
      response.status(result.status).json({ error: data['status_message'] || 'TMDB error' });
      return;
    }

    const rawResults = (data['results'] as Record<string, unknown>[]) || [];
    const results = await Promise.all(rawResults.map(transformMovieCard));
    const filteredResults = genreId
      ? results.filter((movie) => movie.genres.some((genre) => genre.id === Number(genreId)))
      : results;

    console.log('DEBUG searchMovies', {
      rawLength: rawResults.length,
      resultLength: results.length,
      filteredLength: filteredResults.length,
      genreId,
    });

    response.status(200).json({
      page: Number(data['page'] ?? 1),
      totalPages: Number(data['total_pages'] ?? 1),
      totalResults: filteredResults.length,
      results: filteredResults,
    });
  } catch (_error) {
    response.status(502).json({ error: 'Failed to reach TMDB' });
  }
};

export const getMovieDetails = async (request: Request, response: Response) => {
  const { id } = request.params;

  try {
    const url = buildTmdbUrl(`/movie/${id}`, {
      language: 'en-US',
      append_to_response: 'credits,similar',
    });
    const result = await fetch(url);
    const data = (await result.json()) as Record<string, unknown>;

    if (!result.ok) {
      response.status(result.status).json({ error: data['status_message'] || 'TMDB error' });
      return;
    }

    response.status(200).json(await transformMovieDetail(data));
  } catch (_error) {
    response.status(502).json({ error: 'Failed to reach TMDB' });
  }
};

export const getPopularMovies = async (request: Request, response: Response) => {
  const page = request.query.page ? Number(request.query.page) : 1;

  try {
    const url = buildTmdbUrl('/movie/popular', {
      language: 'en-US',
      page,
    });
    const result = await fetch(url);
    const data = (await result.json()) as Record<string, unknown>;

    if (!result.ok) {
      response.status(result.status).json({ error: data['status_message'] || 'TMDB error' });
      return;
    }

    const rawResults = (data['results'] as Record<string, unknown>[]) || [];
    const results = await Promise.all(rawResults.map(transformMovieCard));

    response.status(200).json({
      page: Number(data['page'] ?? page),
      totalPages: Number(data['total_pages'] ?? 1),
      totalResults: Number(data['total_results'] ?? results.length),
      results,
    });
  } catch (_error) {
    response.status(502).json({ error: 'Failed to reach TMDB' });
  }
};
