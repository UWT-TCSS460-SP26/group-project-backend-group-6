# TCSS 460 — Group Project Backend

Created by Team 6 - Luke Willis, Connor Willis, Jayda Minks, and John Diego

Express + TypeScript API for the TCSS 460 group project.

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start development server (auto-reloads on changes)
npm run dev
```

Deployed URL is at [https://tcss460-team-6-api.onrender.com](https://tcss460-team-6-api.onrender.com).

API documentation is at [https://tcss460-team-6-api.onrender.com/api-docs](https://tcss460-team-6-api.onrender.com/api-docs).

## Token Generation

Tokens are generated at this link: [https://tcss460-token-playground.onrender.com/](https://tcss460-token-playground.onrender.com/) under the group-6-api audience.

## CORS-allowed

Adding a CORS-allowed origin is a change in the environment variables - as seen in our .env.example. In Render, it is the same change, as it is a comma separated env value. Submit a bug report, or otherwise get a hold of Group 6 to request an addition for your production environment.

Allowed origins:

- http://localhost:3000 (local development)
- http://localhost:5173 (local development)
- https://tcss460-team-6-api.onrender.com (backend production)

## Bug Reports?

As of now, our intended bug reporting URL is at [https://tcss460-team-6-api.onrender.com/v1/issues](https://tcss460-team-6-api.onrender.com/v1/issues).

## Quirks?

Render has a 30-60 second spin up time, so the beginning of any development session might take a second to respond.

Token playground tokens from the above link expire after an hour.

## Scripts

| Command                | Description                       |
| ---------------------- | --------------------------------- |
| `npm run dev`          | Start dev server with auto-reload |
| `npm run build`        | Compile TypeScript to `dist/`     |
| `npm start`            | Run compiled output               |
| `npm test`             | Run tests                         |
| `npm run lint`         | Run ESLint                        |
| `npm run format`       | Format code with Prettier         |
| `npm run format:check` | Check formatting                  |
