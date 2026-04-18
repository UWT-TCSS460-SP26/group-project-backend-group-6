import request from 'supertest';
import { app } from '../../../src/app';

const mockFetchSequence = (...responses: Array<{ ok: boolean; status: number; json: () => Promise<unknown> }>) => {
    let callCount = 0;

    global.fetch = jest.fn((url: string) => {
        // eslint-disable-next-line no-console
        console.log('FETCH', callCount, url);
        return Promise.resolve(responses[callCount++]);
    }) as jest.Mock;
};

describe('Movies Router', () => {
    describe('GET /media/movies', () => {
        it('should return 400 if query parameter is missing', async () => {
            const response = await request(app).get('/media/movies');
            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('query');
        });

        it('should return 500 if TMDB_API_KEY is not set', async () => {
            const apiKey = process.env.TMDB_API_KEY;
            delete process.env.TMDB_API_KEY;

            const response = await request(app).get('/media/movies?query=Inception');
            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('error');

            process.env.TMDB_API_KEY = apiKey;
        });

        it('should return 200 with search results when query is provided', async () => {
            mockFetchSequence(
                {
                    ok: true,
                    status: 200,
                    json: () =>
                        Promise.resolve({
                            genres: [
                                { id: 28, name: 'Action' },
                                { id: 18, name: 'Drama' },
                            ],
                        }),
                },
                {
                    ok: true,
                    status: 200,
                    json: () =>
                        Promise.resolve({
                            page: 1,
                            total_pages: 1,
                            total_results: 1,
                            results: [
                                {
                                    id: 27205,
                                    title: 'Inception',
                                    release_date: '2010-07-16',
                                    poster_path: '/qmDpIHrmpJINaRKAfWQfftjCdyi.jpg',
                                    overview: 'A thief who steals corporate secrets...',
                                    vote_average: 8.4,
                                    genre_ids: [28, 18],
                                },
                            ],
                        }),
                }
            );

            const response = await request(app).get('/media/movies').query({ query: 'Inception' });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('page', 1);
            expect(response.body).toHaveProperty('totalPages', 1);
            expect(response.body).toHaveProperty('totalResults', 1);
            expect(response.body).toHaveProperty('results');
            expect(Array.isArray(response.body.results)).toBe(true);

            if (response.body.results.length > 0) {
                const movie = response.body.results[0];
                expect(movie).toHaveProperty('id');
                expect(movie).toHaveProperty('title');
                expect(movie).toHaveProperty('releaseYear');
                expect(movie).toHaveProperty('posterUrl');
                expect(movie).toHaveProperty('overview');
                expect(movie).toHaveProperty('rating');
                expect(movie).toHaveProperty('genres');
                expect(Array.isArray(movie.genres)).toBe(true);
            }
        });

        it('should support year filter', async () => {
            mockFetchSequence(
                {
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({ genres: [] }),
                },
                {
                    ok: true,
                    status: 200,
                    json: () =>
                        Promise.resolve({
                            page: 1,
                            total_pages: 1,
                            total_results: 0,
                            results: [],
                        }),
                }
            );

            const response = await request(app)
                .get('/media/movies')
                .query({ query: 'Inception', year: 2010 });

            expect(response.status).toBe(200);
            expect(global.fetch).toHaveBeenCalled();
            const callUrl = (global.fetch as jest.Mock).mock.calls[1][0];
            expect(callUrl).toContain('year=2010');
        });

        it('should handle TMDB error responses', async () => {
            mockFetchSequence(
                {
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({ genres: [] }),
                },
                {
                    ok: false,
                    status: 401,
                    json: () => Promise.resolve({ status_message: 'Invalid API key' }),
                }
            );

            const response = await request(app).get('/media/movies').query({ query: 'Inception' });

            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('error');
        });

        it('should handle fetch errors', async () => {
            global.fetch = jest.fn(() => Promise.reject(new Error('Network error'))) as jest.Mock;

            const response = await request(app).get('/media/movies').query({ query: 'Inception' });

            expect(response.status).toBe(502);
            expect(response.body.error).toContain('Failed to reach TMDB');
        });
    });

    describe('GET /media/movies/popular', () => {
        it('should return 500 if TMDB_API_KEY is not set', async () => {
            const apiKey = process.env.TMDB_API_KEY;
            delete process.env.TMDB_API_KEY;

            const response = await request(app).get('/media/movies/popular');
            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('error');

            process.env.TMDB_API_KEY = apiKey;
        });

        it('should return 200 with popular movies', async () => {
            mockFetchSequence(
                {
                    ok: true,
                    status: 200,
                    json: () =>
                        Promise.resolve({
                            genres: [
                                { id: 28, name: 'Action' },
                                { id: 18, name: 'Drama' },
                            ],
                        }),
                },
                {
                    ok: true,
                    status: 200,
                    json: () =>
                        Promise.resolve({
                            page: 1,
                            total_pages: 1,
                            total_results: 1,
                            results: [
                                {
                                    id: 27205,
                                    title: 'Inception',
                                    release_date: '2010-07-16',
                                    poster_path: '/qmDpIHrmpJINaRKAfWQfftjCdyi.jpg',
                                    vote_average: 8.4,
                                    genre_ids: [28, 18],
                                },
                            ],
                        }),
                }
            );

            const response = await request(app).get('/media/movies/popular');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('page', 1);
            expect(response.body).toHaveProperty('totalPages', 1);
            expect(response.body).toHaveProperty('totalResults', 1);
            expect(response.body).toHaveProperty('results');
            expect(Array.isArray(response.body.results)).toBe(true);

            if (response.body.results.length > 0) {
                const movie = response.body.results[0];
                expect(movie).toHaveProperty('id');
                expect(movie).toHaveProperty('title');
                expect(movie).toHaveProperty('releaseYear');
                expect(movie).toHaveProperty('posterUrl');
                expect(movie).toHaveProperty('rating');
                expect(movie).toHaveProperty('genres');
                expect(Array.isArray(movie.genres)).toBe(true);
            }
        });

        it('should handle fetch errors', async () => {
            global.fetch = jest.fn(() => Promise.reject(new Error('Network error'))) as jest.Mock;

            const response = await request(app).get('/media/movies/popular');

            expect(response.status).toBe(502);
            expect(response.body.error).toContain('Failed to reach TMDB');
        });
    });

    describe('GET /media/movies/:id', () => {
        it('should return 400 if id is not a positive integer', async () => {
            const response = await request(app).get('/media/movies/invalid');
            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('positive integer');
        });

        it('should return 400 if id is zero or negative', async () => {
            const response = await request(app).get('/media/movies/0');
            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
        });

        it('should return 500 if TMDB_API_KEY is not set', async () => {
            const apiKey = process.env.TMDB_API_KEY;
            delete process.env.TMDB_API_KEY;

            const response = await request(app).get('/media/movies/27205');
            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('error');

            process.env.TMDB_API_KEY = apiKey;
        });

        it('should return 200 with movie details', async () => {
            global.fetch = jest.fn(() =>
                Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () =>
                        Promise.resolve({
                            id: 27205,
                            title: 'Inception',
                            tagline: 'Your mind is the scene of the crime.',
                            overview: 'A thief who steals corporate secrets...',
                            release_date: '2010-07-16',
                            runtime: 148,
                            vote_count: 24000,
                            backdrop_path: '/some-backdrop.jpg',
                            poster_path: '/qmDpIHrmpJINaRKAfWQfftjCdyi.jpg',
                            vote_average: 8.4,
                            status: 'Released',
                            genres: [
                                { id: 28, name: 'Action' },
                                { id: 18, name: 'Drama' },
                            ],
                            credits: {
                                cast: [
                                    {
                                        name: 'Leonardo DiCaprio',
                                        character: 'Cobb',
                                        profile_path: '/leo.jpg',
                                    },
                                ],
                            },
                            similar: {
                                results: [
                                    {
                                        id: 603,
                                        title: 'The Matrix',
                                        release_date: '1999-03-31',
                                        poster_path: '/matrix.jpg',
                                        overview: 'A hacker discovers a shocking truth.',
                                        vote_average: 8.7,
                                        genre_ids: [28, 878],
                                    },
                                ],
                            },
                        }),
                } as Response)
            ) as jest.Mock;

            const response = await request(app).get('/media/movies/27205');

            expect(response.status).toBe(200);
            const movie = response.body;
            expect(movie).toHaveProperty('id');
            expect(movie).toHaveProperty('title');
            expect(movie).toHaveProperty('tagline');
            expect(movie).toHaveProperty('overview');
            expect(movie).toHaveProperty('releaseYear');
            expect(movie).toHaveProperty('releaseDate');
            expect(movie).toHaveProperty('runtimeMinutes');
            expect(movie).toHaveProperty('voteCount');
            expect(movie).toHaveProperty('backdropUrl');
            expect(movie).toHaveProperty('posterUrl');
            expect(movie).toHaveProperty('rating');
            expect(movie).toHaveProperty('status');
            expect(movie).toHaveProperty('genres');
            expect(movie).toHaveProperty('cast');
            expect(movie).toHaveProperty('similar');
            expect(Array.isArray(movie.genres)).toBe(true);
            expect(Array.isArray(movie.cast)).toBe(true);
            expect(Array.isArray(movie.similar)).toBe(true);
        });

        it('should handle fetch errors', async () => {
            global.fetch = jest.fn(() => Promise.reject(new Error('Network error'))) as jest.Mock;

            const response = await request(app).get('/media/movies/27205');

            expect(response.status).toBe(502);
            expect(response.body.error).toContain('Failed to reach TMDB');
        });
    });
});
