import { Request, Response } from 'express';

const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p/w500';
const IMG_ORIGINAL = 'https://image.tmdb.org/t/p/original';
const IMG_PROFILE = 'https://image.tmdb.org/t/p/w185';
const IMG_LOGO = 'https://image.tmdb.org/t/p/w92';

// ─── Shared helpers ───────────────────────────────────────────────────────────

const tmdbError = (response: Response, status: number, message: string) =>
  response.status(status).json({ error: 'TMDB Error', message });

const serverError = (response: Response) =>
  response.status(502).json({ error: 'Bad Gateway', message: 'Failed to reach TMDB' });

// ─── TV Shows ─────────────────────────────────────────────────────────────────

/**
 * Transformed proxy — searches TMDB for TV shows and returns a curated schema.
 */
export const searchTV = async (request: Request, response: Response) => {
  const { query, year, genreId, page } = request.query;
  const apiKey = process.env.TMDB_API_KEY;

  try {
    const url = new URL(`${BASE_URL}/search/tv`);
    url.searchParams.set('api_key', String(apiKey));
    url.searchParams.set('query', String(query));
    if (year) url.searchParams.set('first_air_date_year', String(year));
    if (page) url.searchParams.set('page', String(page));

    const result = await fetch(url.toString());
    const data = (await result.json()) as Record<string, unknown>;

    if (!result.ok) {
      tmdbError(response, result.status, String(data.status_message ?? 'TMDB error'));
      return;
    }

    let items = data.results as Record<string, unknown>[];
    if (genreId) {
      const id = Number(genreId);
      items = items.filter((item) => (item.genre_ids as number[])?.includes(id));
    }

    const results = items.map((item) => ({
      id: item.id,
      title: item.name,
      firstAirDate: item.first_air_date ?? null,
      posterUrl: item.poster_path ? `${IMG_BASE}${item.poster_path}` : null,
      rating: item.vote_average,
      overview: item.overview,
      genres: ((item.genre_ids as number[]) ?? []).map((id) => ({ id })),
    }));

    response.json({
      page: data.page,
      totalPages: data.total_pages,
      totalResults: data.total_results,
      results,
    });
  } catch (_error) {
    serverError(response);
  }
};

/**
 * Transformed proxy — returns details for a specific TV show.
 */
export const getTVDetails = async (request: Request, response: Response) => {
  const { id } = request.params;
  const apiKey = process.env.TMDB_API_KEY;

  try {
    const [detailResult, similarResult] = await Promise.all([
      fetch(`${BASE_URL}/tv/${id}?api_key=${apiKey}&append_to_response=credits`),
      fetch(`${BASE_URL}/tv/${id}/similar?api_key=${apiKey}`),
    ]);

    const data = (await detailResult.json()) as Record<string, unknown>;

    if (!detailResult.ok) {
      tmdbError(response, detailResult.status, String(data.status_message ?? 'TMDB error'));
      return;
    }

    const similarData = similarResult.ok
      ? ((await similarResult.json()) as Record<string, unknown>)
      : { results: [] };

    const credits = data.credits as Record<string, unknown>;
    const cast = ((credits?.cast as Record<string, unknown>[]) ?? [])
      .slice(0, 10)
      .map((member) => ({
        name: member.name,
        character: member.character,
        profileUrl: member.profile_path ? `${IMG_PROFILE}${member.profile_path}` : null,
      }));

    const similar = ((similarData.results as Record<string, unknown>[]) ?? [])
      .slice(0, 6)
      .map((item) => ({
        id: item.id,
        title: item.name,
        firstAirDate: item.first_air_date ?? null,
        posterUrl: item.poster_path ? `${IMG_BASE}${item.poster_path}` : null,
        rating: item.vote_average,
        overview: item.overview,
        genres: ((item.genre_ids as number[]) ?? []).map((id) => ({ id })),
      }));

    const networks = ((data.networks as Record<string, unknown>[]) ?? []).map((n) => ({
      name: n.name,
      logoUrl: n.logo_path ? `${IMG_LOGO}${n.logo_path}` : null,
    }));

    const seasons = ((data.seasons as Record<string, unknown>[]) ?? [])
      .filter((s) => (s.season_number as number) > 0) // exclude specials (season 0)
      .map((s) => ({
        seasonNumber: s.season_number,
        episodeCount: s.episode_count,
        airDate: s.air_date ?? null,
        posterUrl: s.poster_path ? `${IMG_BASE}${s.poster_path}` : null,
      }));

    response.json({
      id: data.id,
      title: data.name,
      overview: data.overview,
      firstAirDate: data.first_air_date ?? null,
      lastAirDate: data.last_air_date ?? null,
      status: data.status,
      totalSeasons: data.number_of_seasons,
      totalEpisodes: data.number_of_episodes,
      averageEpisodeMinutes: (data.episode_run_time as number[])?.[0] ?? null,
      posterUrl: data.poster_path ? `${IMG_BASE}${data.poster_path}` : null,
      backdropUrl: data.backdrop_path ? `${IMG_ORIGINAL}${data.backdrop_path}` : null,
      rating: data.vote_average,
      voteCount: data.vote_count,
      genres: (data.genres as { id: number; name: string }[]) ?? [],
      networks,
      seasons,
      cast,
      similar,
    });
  } catch (_error) {
    serverError(response);
  }
};

/**
 * Transformed proxy — returns currently popular TV shows.
 */
export const getPopularTV = async (request: Request, response: Response) => {
  const { page } = request.query;
  const apiKey = process.env.TMDB_API_KEY;

  try {
    const url = new URL(`${BASE_URL}/tv/popular`);
    url.searchParams.set('api_key', String(apiKey));
    if (page) url.searchParams.set('page', String(page));

    const result = await fetch(url.toString());
    const data = (await result.json()) as Record<string, unknown>;

    if (!result.ok) {
      tmdbError(response, result.status, String(data.status_message ?? 'TMDB error'));
      return;
    }

    const results = (data.results as Record<string, unknown>[]).map((item) => ({
      id: item.id,
      title: item.name,
      firstAirDate: item.first_air_date ?? null,
      posterUrl: item.poster_path ? `${IMG_BASE}${item.poster_path}` : null,
      rating: item.vote_average,
      overview: item.overview,
      genres: ((item.genre_ids as number[]) ?? []).map((id) => ({ id })),
    }));

    response.json({
      page: data.page,
      totalPages: data.total_pages,
      totalResults: data.total_results,
      results,
    });
  } catch (_error) {
    serverError(response);
  }
};
