import request from 'supertest';
import { app } from '../../../src/app';

// ─── Fetch mock ───────────────────────────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockRes = (body: unknown, status = 200) =>
  Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response);

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TMDB_SHOW_STUB = {
  id: 1396,
  name: 'Breaking Bad',
  first_air_date: '2008-01-20',
  poster_path: '/ggFHVNu6YYI5L9pCfOacjizRGt.jpg',
  vote_average: 9.5,
  overview: 'A chemistry teacher diagnosed with inoperable lung cancer turns to crime.',
  genre_ids: [18, 80],
};

const TMDB_SEARCH_RESPONSE = {
  page: 1,
  total_pages: 2,
  total_results: 25,
  results: [TMDB_SHOW_STUB],
};

const TMDB_DETAIL_RESPONSE = {
  id: 1396,
  name: 'Breaking Bad',
  overview: "A chemistry teacher turns to crime to secure his family's future.",
  first_air_date: '2008-01-20',
  last_air_date: '2013-09-29',
  status: 'Ended',
  number_of_seasons: 5,
  number_of_episodes: 62,
  episode_run_time: [45],
  poster_path: '/ggFHVNu6YYI5L9pCfOacjizRGt.jpg',
  backdrop_path: '/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg',
  vote_average: 9.5,
  vote_count: 13500,
  genres: [
    { id: 18, name: 'Drama' },
    { id: 80, name: 'Crime' },
  ],
  networks: [{ name: 'AMC', logo_path: '/alqLicR1ZMHMaZGP3xRQxn9sq7p.png' }],
  seasons: [
    { season_number: 0, episode_count: 2, air_date: null, poster_path: null },
    { season_number: 1, episode_count: 7, air_date: '2008-01-20', poster_path: '/s1.jpg' },
    { season_number: 2, episode_count: 13, air_date: '2009-03-08', poster_path: '/s2.jpg' },
  ],
  credits: {
    cast: [
      {
        name: 'Bryan Cranston',
        character: 'Walter White',
        profile_path: '/7Jahy5LZX2Fo8fGJltMreAI49hC.jpg',
      },
      {
        name: 'Aaron Paul',
        character: 'Jesse Pinkman',
        profile_path: '/glEjyreZMVvkPmSe9G2n23BXZXR.jpg',
      },
    ],
  },
};

const TMDB_SIMILAR_RESPONSE = {
  results: [
    {
      id: 60574,
      name: 'Peaky Blinders',
      first_air_date: '2013-09-12',
      poster_path: '/vUUqzWa2LnHIVqkaKVn3nyfVSBx.jpg',
      vote_average: 8.3,
      overview: 'A gangster family epic set in 1919 Birmingham.',
      genre_ids: [80, 18],
    },
  ],
};

const TMDB_POPULAR_RESPONSE = {
  page: 1,
  total_pages: 20,
  total_results: 400,
  results: [
    {
      id: 94997,
      name: 'House of the Dragon',
      first_air_date: '2022-08-21',
      poster_path: '/z2yahl2uefxDCl0nogcRBstwruJ.jpg',
      vote_average: 8.4,
      overview: 'The story of House Targaryen.',
      genre_ids: [10765, 18],
    },
  ],
};

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.TMDB_API_KEY = 'test-api-key';
  mockFetch.mockReset();
});

afterEach(() => {
  delete process.env.TMDB_API_KEY;
});

// ─── GET /media/tv — Search TV shows ─────────────────────────────────────────

describe('GET /media/tv', () => {
  it('returns 200 with transformed paginated results', async () => {
    mockFetch.mockResolvedValueOnce(mockRes(TMDB_SEARCH_RESPONSE));

    const res = await request(app).get('/media/tv').query({ query: 'breaking bad' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      page: 1,
      totalPages: 2,
      totalResults: 25,
    });
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0]).toMatchObject({
      id: 1396,
      title: 'Breaking Bad',
      firstAirDate: '2008-01-20',
      posterUrl: 'https://image.tmdb.org/t/p/w500/ggFHVNu6YYI5L9pCfOacjizRGt.jpg',
      rating: 9.5,
      overview: expect.any(String),
      genres: [{ id: 18 }, { id: 80 }],
    });
  });

  it('returns null posterUrl when poster_path is absent', async () => {
    const stub = { ...TMDB_SHOW_STUB, poster_path: null };
    mockFetch.mockResolvedValueOnce(mockRes({ ...TMDB_SEARCH_RESPONSE, results: [stub] }));

    const res = await request(app).get('/media/tv').query({ query: 'breaking bad' });

    expect(res.status).toBe(200);
    expect(res.body.results[0].posterUrl).toBeNull();
  });

  it('filters results by genreId', async () => {
    const drama = { ...TMDB_SHOW_STUB, id: 1, genre_ids: [18] };
    const action = { ...TMDB_SHOW_STUB, id: 2, genre_ids: [28] };
    mockFetch.mockResolvedValueOnce(
      mockRes({ ...TMDB_SEARCH_RESPONSE, results: [drama, action], total_results: 2 })
    );

    const res = await request(app).get('/media/tv').query({ query: 'show', genreId: '18' });

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].id).toBe(1);
  });

  it('forwards the page query param to TMDB', async () => {
    mockFetch.mockResolvedValueOnce(mockRes({ ...TMDB_SEARCH_RESPONSE, page: 2 }));

    const res = await request(app).get('/media/tv').query({ query: 'breaking bad', page: '2' });

    expect(res.status).toBe(200);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('page=2');
  });

  it('returns 400 when query param is missing', async () => {
    const res = await request(app).get('/media/tv');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 503 when TMDB_API_KEY is not set', async () => {
    delete process.env.TMDB_API_KEY;

    const res = await request(app).get('/media/tv').query({ query: 'breaking bad' });

    expect(res.status).toBe(503);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 502 when fetch throws a network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network failure'));

    const res = await request(app).get('/media/tv').query({ query: 'breaking bad' });

    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ error: 'Bad Gateway' });
  });

  it('propagates TMDB error status and message', async () => {
    mockFetch.mockResolvedValueOnce(mockRes({ status_message: 'Invalid API key.' }, 401));

    const res = await request(app).get('/media/tv').query({ query: 'breaking bad' });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'TMDB Error', message: 'Invalid API key.' });
  });
});

// ─── GET /media/tv/popular — Popular TV shows ────────────────────────────────

describe('GET /media/tv/popular', () => {
  it('returns 200 with transformed paginated results', async () => {
    mockFetch.mockResolvedValueOnce(mockRes(TMDB_POPULAR_RESPONSE));

    const res = await request(app).get('/media/tv/popular');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      page: 1,
      totalPages: 20,
      totalResults: 400,
    });
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0]).toMatchObject({
      id: 94997,
      title: 'House of the Dragon',
      firstAirDate: '2022-08-21',
      posterUrl: 'https://image.tmdb.org/t/p/w500/z2yahl2uefxDCl0nogcRBstwruJ.jpg',
      rating: 8.4,
      overview: expect.any(String),
      genres: [{ id: 10765 }, { id: 18 }],
    });
  });

  it('forwards the page query param to TMDB', async () => {
    mockFetch.mockResolvedValueOnce(mockRes({ ...TMDB_POPULAR_RESPONSE, page: 3 }));

    const res = await request(app).get('/media/tv/popular').query({ page: '3' });

    expect(res.status).toBe(200);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('page=3');
  });

  it('returns 503 when TMDB_API_KEY is not set', async () => {
    delete process.env.TMDB_API_KEY;

    const res = await request(app).get('/media/tv/popular');

    expect(res.status).toBe(503);
  });

  it('returns 502 when fetch throws a network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network failure'));

    const res = await request(app).get('/media/tv/popular');

    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ error: 'Bad Gateway' });
  });

  it('propagates TMDB error status and message', async () => {
    mockFetch.mockResolvedValueOnce(mockRes({ status_message: 'Service unavailable.' }, 503));

    const res = await request(app).get('/media/tv/popular');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ error: 'TMDB Error', message: 'Service unavailable.' });
  });
});

// ─── GET /media/tv/:id — TV show details ─────────────────────────────────────

describe('GET /media/tv/:id', () => {
  it('returns 200 with fully transformed detail shape', async () => {
    mockFetch
      .mockResolvedValueOnce(mockRes(TMDB_DETAIL_RESPONSE))
      .mockResolvedValueOnce(mockRes(TMDB_SIMILAR_RESPONSE));

    const res = await request(app).get('/media/tv/1396');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 1396,
      title: 'Breaking Bad',
      overview: expect.any(String),
      firstAirDate: '2008-01-20',
      lastAirDate: '2013-09-29',
      status: 'Ended',
      totalSeasons: 5,
      totalEpisodes: 62,
      averageEpisodeMinutes: 45,
      posterUrl: 'https://image.tmdb.org/t/p/w500/ggFHVNu6YYI5L9pCfOacjizRGt.jpg',
      backdropUrl: 'https://image.tmdb.org/t/p/original/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg',
      rating: 9.5,
      voteCount: 13500,
      genres: [
        { id: 18, name: 'Drama' },
        { id: 80, name: 'Crime' },
      ],
    });
  });

  it('transforms networks correctly', async () => {
    mockFetch
      .mockResolvedValueOnce(mockRes(TMDB_DETAIL_RESPONSE))
      .mockResolvedValueOnce(mockRes(TMDB_SIMILAR_RESPONSE));

    const res = await request(app).get('/media/tv/1396');

    expect(res.body.networks).toEqual([
      { name: 'AMC', logoUrl: 'https://image.tmdb.org/t/p/w92/alqLicR1ZMHMaZGP3xRQxn9sq7p.png' },
    ]);
  });

  it('excludes season 0 (specials) from seasons array', async () => {
    mockFetch
      .mockResolvedValueOnce(mockRes(TMDB_DETAIL_RESPONSE))
      .mockResolvedValueOnce(mockRes(TMDB_SIMILAR_RESPONSE));

    const res = await request(app).get('/media/tv/1396');

    expect(res.body.seasons).toHaveLength(2);
    expect(res.body.seasons.every((s: { seasonNumber: number }) => s.seasonNumber > 0)).toBe(true);
  });

  it('transforms seasons with correct shape', async () => {
    mockFetch
      .mockResolvedValueOnce(mockRes(TMDB_DETAIL_RESPONSE))
      .mockResolvedValueOnce(mockRes(TMDB_SIMILAR_RESPONSE));

    const res = await request(app).get('/media/tv/1396');

    expect(res.body.seasons[0]).toMatchObject({
      seasonNumber: 1,
      episodeCount: 7,
      airDate: '2008-01-20',
      posterUrl: 'https://image.tmdb.org/t/p/w500/s1.jpg',
    });
  });

  it('transforms cast correctly and caps at 10 members', async () => {
    const manyCast = Array.from({ length: 15 }, (_, i) => ({
      name: `Actor ${i}`,
      character: `Character ${i}`,
      profile_path: `/p${i}.jpg`,
    }));
    const detailWithManyCast = {
      ...TMDB_DETAIL_RESPONSE,
      credits: { cast: manyCast },
    };
    mockFetch
      .mockResolvedValueOnce(mockRes(detailWithManyCast))
      .mockResolvedValueOnce(mockRes(TMDB_SIMILAR_RESPONSE));

    const res = await request(app).get('/media/tv/1396');

    expect(res.body.cast).toHaveLength(10);
    expect(res.body.cast[0]).toMatchObject({
      name: 'Actor 0',
      character: 'Character 0',
      profileUrl: 'https://image.tmdb.org/t/p/w185/p0.jpg',
    });
  });

  it('returns null profileUrl when cast member has no profile_path', async () => {
    const detailWithNullProfile = {
      ...TMDB_DETAIL_RESPONSE,
      credits: { cast: [{ name: 'Unknown', character: 'Someone', profile_path: null }] },
    };
    mockFetch
      .mockResolvedValueOnce(mockRes(detailWithNullProfile))
      .mockResolvedValueOnce(mockRes(TMDB_SIMILAR_RESPONSE));

    const res = await request(app).get('/media/tv/1396');

    expect(res.body.cast[0].profileUrl).toBeNull();
  });

  it('transforms similar shows correctly and caps at 6', async () => {
    const manyShows = Array.from({ length: 10 }, (_, i) => ({
      id: i,
      name: `Show ${i}`,
      first_air_date: '2020-01-01',
      poster_path: `/p${i}.jpg`,
      vote_average: 7.0,
      overview: 'An overview.',
      genre_ids: [18],
    }));
    mockFetch
      .mockResolvedValueOnce(mockRes(TMDB_DETAIL_RESPONSE))
      .mockResolvedValueOnce(mockRes({ results: manyShows }));

    const res = await request(app).get('/media/tv/1396');

    expect(res.body.similar).toHaveLength(6);
  });

  it('returns empty similar array when similar fetch fails', async () => {
    mockFetch
      .mockResolvedValueOnce(mockRes(TMDB_DETAIL_RESPONSE))
      .mockResolvedValueOnce(mockRes({ status_message: 'Not found.' }, 404));

    const res = await request(app).get('/media/tv/1396');

    expect(res.status).toBe(200);
    expect(res.body.similar).toEqual([]);
  });

  it('returns 400 for a non-numeric id', async () => {
    const res = await request(app).get('/media/tv/abc');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 for id zero', async () => {
    const res = await request(app).get('/media/tv/0');

    expect(res.status).toBe(400);
  });

  it('returns 400 for a negative id', async () => {
    const res = await request(app).get('/media/tv/-5');

    expect(res.status).toBe(400);
  });

  it('returns 503 when TMDB_API_KEY is not set', async () => {
    delete process.env.TMDB_API_KEY;

    const res = await request(app).get('/media/tv/1396');

    expect(res.status).toBe(503);
  });

  it('returns 502 when fetch throws a network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network failure'));

    const res = await request(app).get('/media/tv/1396');

    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ error: 'Bad Gateway' });
  });

  it('propagates TMDB error status and message', async () => {
    mockFetch.mockResolvedValueOnce(
      mockRes({ status_message: 'The resource could not be found.' }, 404)
    );

    const res = await request(app).get('/media/tv/99999');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      error: 'TMDB Error',
      message: 'The resource could not be found.',
    });
  });
});
