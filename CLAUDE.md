# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**No, YOU Pick!** — AI-powered restaurant picker using Google Vertex AI Gemini 2.5 Flash to suggest 3 random restaurants based on location, cuisine, and radius. Full-stack: web (React/Vite), mobile (React Native/Expo), backend (Cloud Run/Node.js).

## Architecture

```
noupick/
├── App.tsx, index.tsx           # Web app entry (React 19 + Vite)
├── components/                  # UI components (6 files)
│   ├── Button.tsx               # Variants: primary, secondary, outline, hero
│   ├── Card.tsx                 # Restaurant card — rating, directions, pick count, share
│   ├── LoadingScreen.tsx        # Animated mascot with rotating messages
│   ├── Mascot.tsx               # SVG fox with expressions (happy, thinking, sad, surprised)
│   ├── ShareTicket.tsx          # Ticket-style share preview for restaurants
│   └── SlotMachine.tsx          # 3-column slot animation with confetti reveal
├── services/                    # Frontend services
│   ├── geminiService.ts         # Cloud Run API client (POST /api/restaurants)
│   ├── restaurantService.ts     # Supabase pick counting (get/increment)
│   └── supabaseClient.ts        # Supabase client init from env vars
├── functions/                   # Backend API (Cloud Run)
│   ├── src/
│   │   ├── index.ts             # Firebase Functions entry point
│   │   └── cloudrun.ts          # Cloud Run Express entry point (production)
│   └── Dockerfile               # Multi-stage Alpine, runs cloudrun.js as non-root
└── pablo-mobile/                # React Native mobile app (Expo SDK 54)
    ├── App.tsx                  # Mobile entry point
    ├── services/api.ts          # Mobile API client
    ├── app.json                 # Expo config (com.pabsai.noyoupick)
    └── eas.json                 # EAS build profiles (dev/preview/production)
```

### Data Flow

```
User → Web/Mobile → Cloud Run (/api/restaurants) → Vertex AI Gemini 2.5 Flash → Parse → Response
                                                     ↓
                                              Grounding chunks → Google Maps links
```

### Dual Backend Entry Points

- `functions/src/index.ts` — Firebase Functions (v2 `onRequest` handler). Used when deploying via `firebase deploy --only functions`.
- `functions/src/cloudrun.ts` — Express 5 server for Cloud Run. **This is the production entry point.** Dockerfile CMD: `node lib/cloudrun.js`.

Both implement the same endpoints, CORS, and rate limiting. They differ only in the hosting wrapper.

### Gemini Prompt Strategy

- Model: `gemini-2.5-flash` in `us-central1`
- Random seed per request to avoid repetitive picks
- `CRITICAL INSTRUCTION` block forces variety (not just top-rated/closest)
- Response format: `---SEPARATOR---` delimited blocks with Name/Cuisine/Address/Rating/Status/Reason
- `NO_MATCHES_FOUND` sentinel for zero-result cuisine filters
- Grounding metadata chunks provide Google Maps URIs; falls back to search URL

### Supabase Integration

- Table: `restaurants` with `name` and `pick_count` columns
- `getRestaurantPickCount(name)` → returns `number | null` (null when unavailable)
- `incrementRestaurantPick(name)` → upsert with increment
- Used for "Community Intent" display on restaurant cards
- **Not** the primary data store — Vertex AI is the main data flow

## Development Commands

### Web App (root)
```bash
npm run dev              # Vite dev server on http://localhost:3000
npm run build            # Production build to dist/
npm run preview          # Preview production build
npm run typecheck        # TypeScript check (tsc --noEmit)
npm run emulators        # Firebase emulators (UI:4000, hosting:5000, functions:5001)
```

### Backend (functions/)
```bash
cd functions
npm run build            # Compile TypeScript to lib/
npm run build:watch      # Watch mode
npm run serve            # Firebase emulator
npm run logs             # View function logs
npm run lint             # ESLint
```

### Mobile App (pablo-mobile/)
```bash
cd pablo-mobile
npx expo start           # Expo dev server
npx expo start --ios     # iOS simulator
npx expo start --android # Android emulator
npm run test             # Jest tests
npm run typecheck        # TypeScript check
```

## Deployment

### Web App (Firebase Hosting)
```bash
npm run build && firebase deploy --only hosting --project noupick-prod
```

### Backend API (Cloud Run)
```bash
cd functions && npm run build
docker build -t us-central1-docker.pkg.dev/noupick-prod/noupick/api:latest .
docker push us-central1-docker.pkg.dev/noupick-prod/noupick/api:latest
gcloud run deploy noupick-api \
  --image us-central1-docker.pkg.dev/noupick-prod/noupick/api:latest \
  --region us-central1 --project noupick-prod --allow-unauthenticated \
  --set-env-vars GOOGLE_CLOUD_PROJECT=noupick-prod
```

### Mobile App (EAS Build)
```bash
cd pablo-mobile
npx eas build --platform android --profile preview   # Test APK
npx eas build --platform ios --profile production     # App Store
npx eas submit --platform ios                         # Submit to App Store
```

## API Endpoints

| Method | Path | Purpose | Rate Limited |
|--------|------|---------|-------------|
| POST | /api/restaurants | Get 3 restaurant recommendations | Yes (10/min/IP) |
| GET | /health | Health check | No |

**Request:**
```json
{
  "locationQuery": "Los Angeles, CA",
  "cuisine": "Mexican",
  "radius": "10",
  "excludeNames": ["Taco Bell"]
}
```

**Rate limit headers:** `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`. Returns 429 with `retryAfter` when exceeded. In-memory Map store (single instance — use Redis for scale).

### CORS Allowed Origins

`http://localhost:3000`, `http://localhost:5000`, `http://localhost:5173`, `/\.web\.app$/`, `/\.firebaseapp\.com$/`, `/noupick.*\.web\.app$/`

## Environment Variables

**Frontend (.env):**
- `VITE_API_BASE_URL` — Cloud Run or emulator URL (auto-detects prod/dev if unset)
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anonymous key

**Backend (functions/):**
- `GOOGLE_CLOUD_PROJECT` (or `GCLOUD_PROJECT`) — GCP project ID
- `PORT` — Server port (defaults to 8080)
- `NODE_ENV` — Set to `production` in Docker

## Production URLs

- **Web App:** https://noupick-prod.web.app
- **API:** https://noupick-api-246498703732.us-central1.run.app
- **Health:** https://noupick-api-246498703732.us-central1.run.app/health
- **GCP Project:** `noupick-prod` | **Region:** `us-central1`
- **Artifact Registry:** `us-central1-docker.pkg.dev/noupick-prod/noupick/api`
- **Mobile Bundle ID:** `com.pabsai.noyoupick` (iOS + Android)

## Firebase Config (firebase.json)

- Hosting serves `dist/` with SPA fallback (`** → /index.html`)
- `/api/**` rewrites to Cloud Run service `noupick-api` in `us-central1`
- Cache: immutable assets get `max-age=31536000`, index.html gets `no-cache`

## Local Storage Keys

- `food_roulette_favorites` — Saved restaurants JSON
- `food_roulette_radius` — Last selected radius
- `food_roulette_location` — Last searched location
- `food_roulette_picks` — Pick tracking (prevents re-voting)

## Key Architecture Decisions

1. **No client-side API keys** — All Vertex AI calls proxied through Cloud Run with ADC authentication
2. **Rate limiting** — 10 requests/minute per IP, in-memory Map (single instance only)
3. **CORS whitelist** — Only approved origins, regex patterns for Firebase subdomains
4. **Dual entry points** — `index.ts` (Firebase Functions) vs `cloudrun.ts` (Cloud Run). Dockerfile uses cloudrun.ts.
5. **Supabase is optional** — Pick counts return null when unavailable; UI hides the section
6. **Tailwind via CDN** — Loaded via `<script>` tag in index.html, not an npm dependency
7. **Gemini prompt randomization** — Random seed per request + explicit instructions to avoid top-rated/closest bias

## Tech Stack

| Component | Technology | Version |
|-----------|------------|---------|
| Web Frontend | React + Vite + TypeScript | 19.2 / 6.2 / 5.8 |
| Mobile | React Native + Expo | 0.81.5 / SDK 54 |
| Backend | Node.js + Express | 20 / 5.2 |
| AI | Vertex AI Gemini 2.5 Flash | `gemini-2.5-flash` |
| Database | Supabase (PostgreSQL) | Community pick counts only |
| Hosting | Firebase Hosting (web) | `noupick-prod` |
| Compute | Cloud Run (API) | `us-central1` |
| Container | Docker (Alpine multi-stage) | Non-root, port 8080 |
| CI/CD | Manual deploy | No automated pipeline |

## Gotchas

- **Pick counts return null when Supabase is unavailable** — `getRestaurantPickCount()` returns `null` when env vars are missing or connection fails. UI hides "Community Intent" section when null. Previously generated fake counts (3000-11999) — removed to avoid misleading users.
- **Dual entry points** — Dockerfile uses `cloudrun.ts`, not `index.ts`. If you change API logic, update both files.
- **Cloud Run platform rate limiting** — `/health` may return 429 from Cloud Run's platform throttle (not app code). Transient — resolves when instance scales up.
- **Tailwind not in package.json** — Loaded via CDN script tag. Don't look for it in node_modules.
- **Cuisine options** — 16 types defined in `App.tsx` CUISINE_OPTIONS: Any, Pizza, Mexican, Sushi, Burgers, Asian, Italian, Steak, Veggie, Vegan, Healthy, Coffee, Dessert, Chicken, Indian, Thai. Users can also type custom cuisine.
- **Radius options** — 4 discrete values (1, 5, 15, 30 miles), not a continuous slider.
- **Billing required** — GCP billing must be enabled on `noupick-prod` for Cloud Run + Artifact Registry + Vertex AI to function.


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:6cd5cc61 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->
