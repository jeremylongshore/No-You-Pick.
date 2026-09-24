# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**No, YOU Pick!** — a restaurant picker. You give it a location, a cuisine and a radius; it gives
you three real restaurants so your group stops arguing. Live at
**https://noupick.intentsolutions.io**, self-hosted on the Contabo VPS.

## History you need, or you will rebuild the wrong thing

This app was originally **100% Google Cloud** — Firebase Hosting, Cloud Run, Vertex AI Gemini with
Google Search grounding, Artifact Registry. **That estate was permanently torn down 2026-07-09.**
Both the web app and the API returned 404 for five months. It was re-platformed onto the VPS on
2026-09-14.

Three things about the old design that must not come back:

1. **The LLM was the search engine.** Gemini was prompted to "act as a restaurant picker engine"
   and emit `Name:/Cuisine:/Address:/Rating:/Status:` blocks as free text, parsed by regex. It
   could and did invent restaurants. **Facts now come from a place-data provider; no model is in
   the discovery path.**
2. **`Rating` and `Status: Open/Closed` were fabricated** — fields a language model was told to
   produce, with no source of record, rendered as if they were facts. **Both are deleted.** The
   card shows computed distance, and a closing time only when `opening_hours` actually supports one.
3. **Randomness was a prompt instruction** (`Session ID: <random int>` plus "do NOT pick the top
   rated result"). Models are mode-seeking; this did nearly nothing. **Randomness is now a seeded
   permutation in code.**

**Do not re-enable GCP for this project.** No Firebase, no Cloud Run, no Vertex, and no Google Maps
Platform — Places/Geocoding require a billing-enabled Cloud project. Directions links do **not**:
Google states "You don't need a Google API key to use Maps URLs."

## Architecture

```
noupick/
├── server/                   # The backend. One Node service, serves API + web app.
│   └── src/
│       ├── index.ts          # Express: routes, rate limit, static + SPA fallback
│       ├── geo.ts            # Nominatim geocoding, cached, 1 req/s serialized
│       ├── places.ts         # Overpass POI queries, mirror failover, reason text
│       ├── pick.ts           # Seeded shuffle + category stratification
│       ├── db.ts             # node:sqlite — cache + pick counts
│       └── types.ts
├── App.tsx, index.tsx        # Web app entry (React 19 + Vite)
├── components/               # Button, Card, LoadingScreen, Mascot, ShareTicket, SlotMachine
├── services/pickService.ts   # The only API client. No parsing happens here.
└── pablo-mobile/             # React Native / Expo app — NOT yet ported (see Status)
```

### Request flow

```
location string
  -> geocode (Nominatim, cached 90d)
  -> candidate pool (Overpass, cached 24h by ~0.01deg tile)
  -> seeded shuffle + stratify by cuisine, walked by a cursor
  -> 3 restaurants + key-free maps deep links
```

**No LLM call is made at request time.** Reason text is templated from fields we actually hold.

### Two invariants

**Parsing happens once, on the server.** The old code parsed the model's text on the server
*and again* in the browser, using a `groundingChunks` field the server never sent — so every map
link silently fell back to a search URL. The client now renders `restaurants` as given. Never add a
second parser.

**Identity is `id`, never the display name.** Pick counts key on the stable place id
(`osm:node/123`). Keying on a name merges every "Joe's Pizza" in the country and cannot be migrated
later, because the information was never captured.

## Development

```bash
npm install && npm run dev        # web app, Vite on :3000
npm run typecheck                 # tsc --noEmit
npm run build                     # -> dist/

cd server && npm install
npx tsc && node dist/index.js     # API + static on :8099
```

The dev server expects `VITE_API_BASE_URL` to point at a running backend. In production it is empty
— the same origin serves both.

## Deployment

Live host: `intentsolutions` (167.86.106.29), systemd unit **`noupick.service`** on **port 8094**,
behind Caddy at `noupick.intentsolutions.io`.

```bash
npm run build && rm -rf server/public && cp -r dist server/public
cd server && npx tsc
rsync -az --delete server/dist server/public server/package.json server/package-lock.json \
  intentsolutions:/tmp/noupick-deploy/
ssh intentsolutions 'sudo rsync -a --delete --exclude data /tmp/noupick-deploy/ /srv/noupick/ \
  && cd /srv/noupick && sudo -u intentsolutions npm ci --omit=dev \
  && sudo systemctl restart noupick'
```

**Caddy**: always `sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` before
`sudo systemctl reload caddy` (reload, never restart — it is live for every other site on the box).

**SQLite lives at `/srv/noupick/data/`** and is the only writable path in the unit
(`ProtectSystem=strict`). Deleting it loses pick counts and the cache; nothing else.

## API

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/restaurants` | 3 picks. Body: `locationQuery` or `coords`, `cuisine`, `radius`, `sessionId`, `cursor` |
| POST | `/api/pick` | Increment a pick count. Body: `placeId`, `name` |
| GET | `/health` | Liveness |

Rate limit 40/min/IP, bounded map swept on an interval. Response carries `poolSize`, `cursor` and
`exhausted` so the UI can say "you have seen everything within 5 miles" instead of repeating.

### How spin-again works

The server seeds a permutation from `sessionId + place + cuisine + radius` and the client walks it
with `cursor`. Same seed always yields the same order, so paging through it **cannot repeat until
the pool is exhausted**. This replaced an `excludeNames` array that grew by three names per spin and
was fed back into the prompt.

## Gotchas

- **Public Overpass throttles, and lies about it.** Busy mirrors return **HTTP 200 with an empty
  `elements` array** and an error in a `remark` field. Treating that as "no restaurants here" makes
  a whole city look empty. `places.ts` detects `remark`, rotates mirrors in random order, retries
  three times, and **never caches an empty pool**. This is a band-aid — the real fix is bead
  `nup-26g.5`, moving to a local Overture Places table.
- **Nominatim requires a real User-Agent** with contact info and asks for ≤1 req/s. `geo.ts`
  serializes calls and caches for 90 days. A generic UA gets a 403.
- **`node:sqlite` is used, not `better-sqlite3`** — no native build, no blocked install scripts. It
  prints an experimental warning on boot; that is expected.
- **OSM `cuisine` is multi-valued** (`greek;mexican`). When a filter is active the card shows the
  value that *matched*, so a Mexican search does not label a place "Greek".
- **Hours are only claimed when unambiguous.** Multi-rule specs vary by day and we do not evaluate
  day-of-week, so `hoursHint()` stays silent rather than assert a wrong closing time.
- **Tailwind comes from a CDN `<script>` tag** in `index.html`, not npm. Don't look in node_modules.
- **Cuisine options** — 16 in `App.tsx` CUISINE_OPTIONS; users can also type a custom one, which is
  slugged into an OSM cuisine regex.
- **Radius options** — 4 discrete values (1, 5, 15, 30 miles).

## Status

| Piece | State |
|---|---|
| Web app + API | **Live** at noupick.intentsolutions.io |
| Place data | Public Overpass — works, but throttles. Overture migration is `nup-26g.5`. |
| LLM | Out of the request path. Returns later as a batch copywriter (`nup-26g.7`). |
| Mobile (`pablo-mobile/`) | **Ported and building.** Expo SDK 57 / RN 0.86.3, points at the live API, device geolocation + native share + favorites. Bundles for both platforms. Not yet submitted — see Submission below. |
| Tests | 10 contract tests in `pablo-mobile/__tests__/api.test.ts`. The web app has none. No CI. |

## Tech Stack

| Component | Technology |
|-----------|------------|
| Web | React 19 + Vite 6 + TypeScript 5.8 |
| Backend | Node 22 + Express 4, `node:sqlite` |
| Place data | OpenStreetMap via Overpass; Nominatim geocoding |
| Maps | Key-free deep links (Google Maps URLs, maps.apple.com) |
| Host | Contabo VPS, systemd + Caddy |
| Mobile | React Native 0.86.3 + Expo SDK 57 |

## Mobile app

`pablo-mobile/` is an Expo (SDK 57) app sharing the same API. It is deliberately **not** a port of
the web components — it uses native primitives throughout.

```bash
cd pablo-mobile
npm install
npx expo start              # scan the QR with Expo Go on a real device
npm test                    # 10 contract tests
npx tsc --noEmit
npx expo-doctor             # must stay 21/21
npx expo export --platform android --platform ios --output-dir /tmp/x   # proves the module graph
```

Override the API host for local work with `EXPO_PUBLIC_API_URL`.

**Device capabilities**, which are also the Apple guideline 4.2 "minimum functionality" defence —
do not strip these back to a form and a list:

- `expo-location` foreground geolocation (the ◎ button). Background location is explicitly
  disabled in the config; requesting it triggers a heavyweight review for no benefit.
- Native share sheet via React Native's `Share`.
- `expo-haptics` on reveal, pick and spin.
- Favourites and pick state persisted with AsyncStorage, keyed on the **stable place id**.

### Platform-specific maps behaviour

`geo:` is **not registered on iOS** — Apple only resolves `https://maps.apple.com` links. So
`openMaps()` sends iOS to `appleMapsUrl` and Android to a `geo:` intent (which lets the user pick
their own nav app), falling back to the Google Maps URL if neither resolves.

### Submission

`eas.json` has two deliberate placeholders that **must** be filled before `eas submit` will work:
`ascAppId` and `appleTeamId`. The EAS account owner is `pabs-ai` and the Apple ID is
`pablo@pabs.ai`, so the login is interactive and not something a session can do unattended.

Android submission needs a **Google Play service-account JSON** at `play-service-account.json`
(gitignored). The previous config pointed at `google-services.json`, which is a Firebase *client*
config and the wrong file entirely.

Two 2026 store requirements that bite this app specifically:

1. **Google Play requires target API 36** (since 2026-08-31). SDK 54 targeted 35, which is why the
   upgrade was mandatory rather than cosmetic.
2. **Apple guideline 5.1.2(i)** requires an in-app consent modal — not a privacy-policy link — if
   personal data is shared with a third-party AI service. The app sends location only to our own
   server and calls no model at request time, so the requirement does not currently apply.
   **It would start applying the moment an LLM enters the request path** (see `nup-26g.7`, which is
   deliberately designed as an offline batch job to avoid exactly this).

### Known dependency noise

`npm audit` reports vulnerabilities in `@expo/cli`'s tree (`shell-quote`, `node-forge`,
`@xmldom/xmldom`, `ws`, …). These are **build-time toolchain only** and never enter the Hermes
bundle. Do **not** run `npm audit fix` — it downgrades `expo-splash-screen` to the SDK 55 line and
desynchronises the project. They clear when Expo ships a newer CLI.

## Attribution

Place data is © OpenStreetMap contributors, ODbL. The API returns an `attribution` string on every
response and the UI must display it. **Note:** rendering OSM results is a Produced Work
(attribution only), but **storing a filtered derived table makes it a Derivative Database and
share-alike attaches** — which is precisely why `nup-26g.5` targets Overture Places
(CDLA-Permissive, no copyleft) rather than bulk-loading OSM.

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
