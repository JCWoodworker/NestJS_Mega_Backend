# Fantasy War Room Subapp

Nest proxy for **The Grok Bowers War Room** frontend. Spawns `spilchen/yahoo_fantasy_mcp` over stdio (or serves mocks).

## Routes

Base: `/api/v1/subapps/fantasy-war-room`

- `GET /health`
- `GET /roster`
- `GET /matchup`
- `GET /waivers`
- `GET /schedule`
- `GET /standings`

Frontend contract: `fantasy-war-room` repo → `docs/yahoo-mcp-backend-spec.md`.

## Heroku environments

| Env | Heroku app | Git remote | Source branch |
|-----|------------|------------|---------------|
| Preprod | `nestjs-mega-backend-preprod` | `herokupp` | `preprod` (often manual deploy) |
| Prod | `nestjs-mega-backend-prod` | `herokuprod` | `main` (auto on push) |

### Config vars (set via Heroku CLI)

```bash
# Mock-first (safe default until Yahoo OAuth is ready)
heroku config:set FANTASY_WAR_ROOM_USE_MOCK=true -a nestjs-mega-backend-preprod
heroku config:set FANTASY_WAR_ROOM_USE_MOCK=true -a nestjs-mega-backend-prod

# CORS: append Netlify + local Vite origins to existing ALLOWED_ORIGINS*
# (do not wipe other app origins)

# Live Yahoo (later)
heroku config:set FANTASY_WAR_ROOM_USE_MOCK=false \
  YAHOO_LEAGUE_ID=449.l.XXXX \
  YAHOO_OAUTH2_FILE=/app/oauth2.json \
  -a nestjs-mega-backend-preprod
```

### Deploy

```bash
# Preprod (manual)
git push herokupp preprod:main

# Prod (usually via GitHub → main, or)
git push herokuprod main:main
```

### Smoke test

```bash
curl https://nestjs-mega-backend-preprod.herokuapp.com/api/v1/subapps/fantasy-war-room/health
curl https://nestjs-mega-backend-prod.herokuapp.com/api/v1/subapps/fantasy-war-room/health
```

## Local

Defaults to mock mode (`FANTASY_WAR_ROOM_USE_MOCK` unset/true). Prefer Nest `PORT=3001` when Vite uses `3000`.

Add to local `.env` (do not commit secrets):

```
FANTASY_WAR_ROOM_USE_MOCK=true
ALLOWED_ORIGINS_DEVELOPMENT=...,http://localhost:3000,http://127.0.0.1:3000
```
