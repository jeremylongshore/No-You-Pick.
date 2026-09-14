import express, { Request, Response, NextFunction } from 'express';
import * as path from 'path';
import { geocode, haversineMi } from './geo';
import { fetchPool, buildReason, mapsUrl, appleMapsUrl, prettyCuisine, formatAddress } from './places';
import { seededShuffle, stratify, hashSeed } from './pick';
import { pickCounts, incrementPick, sweepCache } from './db';
import { PickRequest, PickResponse, Restaurant } from './types';

const PORT = parseInt(process.env.PORT || '8099', 10);
const PAGE = 3;
const ATTRIBUTION = 'Place data © OpenStreetMap contributors (ODbL). Geocoding by Nominatim.';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '32kb' }));

// --- rate limiting: bounded map, swept on an interval (the old one grew forever) ---
const RATE_MAX = 40;
const RATE_WINDOW = 60_000;
const rate = new Map<string, { n: number; reset: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rate) if (now > v.reset) rate.delete(k);
}, RATE_WINDOW).unref();
setInterval(() => sweepCache(7 * 24 * 60 * 60 * 1000), 60 * 60 * 1000).unref();

function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.ip || 'unknown';
}

app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  const ip = clientIp(req);
  const now = Date.now();
  let e = rate.get(ip);
  if (!e || now > e.reset) { e = { n: 0, reset: now + RATE_WINDOW }; rate.set(ip, e); }
  e.n++;
  res.set('X-RateLimit-Limit', String(RATE_MAX));
  res.set('X-RateLimit-Remaining', String(Math.max(0, RATE_MAX - e.n)));
  if (e.n > RATE_MAX) {
    const retry = Math.ceil((e.reset - now) / 1000);
    res.set('Retry-After', String(retry));
    return res.status(429).json({ error: 'rate_limited', message: `Slow down for ${retry}s.`, retryAfter: retry });
  }
  next();
});

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', version: '2.0.0', ts: new Date().toISOString() });
});

app.post('/api/restaurants', async (req: Request, res: Response) => {
  const body = (req.body || {}) as PickRequest;
  const cuisine = (body.cuisine || 'Any').toString();
  const radius = Math.min(50, Math.max(1, parseFloat(String(body.radius ?? 15)) || 15));
  const cursor = Math.max(0, parseInt(String(body.cursor ?? 0), 10) || 0);
  const sessionId = (body.sessionId || 'anon').toString().slice(0, 64);

  try {
    // 1. Resolve a point — device coords win, otherwise geocode the typed location.
    let lat: number, lon: number, label: string;
    if (body.coords && Number.isFinite(body.coords.lat) && Number.isFinite(body.coords.lng)) {
      lat = body.coords.lat; lon = body.coords.lng; label = 'your location';
    } else {
      const q = (body.locationQuery || '').trim();
      if (!q) return res.status(400).json({ error: 'bad_request', message: 'Tell us where you are first.' });
      const pt = await geocode(q);
      if (!pt) {
        return res.status(404).json({ error: 'unknown_place', message: `Never heard of "${q}". Try a city, or a zip.` });
      }
      lat = pt.lat; lon = pt.lon; label = pt.label.split(',').slice(0, 2).join(',').trim();
    }

    // 2. Candidate pool of real places.
    const pool = await fetchPool(lat, lon, radius, cuisine);
    if (pool.length === 0) {
      const payload: PickResponse = {
        restaurants: [], place: label, poolSize: 0, cursor: 0, exhausted: true, attribution: ATTRIBUTION,
      };
      return res.json(payload);
    }

    // 3. Randomness in code: one stable permutation per session+search, walked by a cursor.
    //    No repeats until the pool is exhausted, and no exclusion list to carry around.
    const seed = hashSeed(`${sessionId}|${label}|${cuisine}|${radius}`);
    const ordered = stratify(seededShuffle(pool, seed), p => p.cuisineTag || 'other', seed);

    const start = cursor % ordered.length;
    const page = ordered.slice(start, start + PAGE);
    const wrapped = page.length < PAGE ? page.concat(ordered.slice(0, PAGE - page.length)) : page;
    const nextCursor = start + PAGE;
    const exhausted = nextCursor >= ordered.length;

    const counts = pickCounts(wrapped.map(p => p.id));
    const restaurants: Restaurant[] = wrapped.map(p => {
      const d = haversineMi(lat, lon, p.lat, p.lon);
      return {
        id: p.id,
        name: p.name,
        cuisine: prettyCuisine(p.cuisineTag, cuisine),
        address: formatAddress(p),
        distanceMi: Math.round(d * 10) / 10,
        hours: p.hours,
        reason: buildReason(p, d, cuisine),
        mapsUrl: mapsUrl(p),
        appleMapsUrl: appleMapsUrl(p),
        website: p.website,
        pickCount: counts.get(p.id) ?? 0,
      };
    });

    const payload: PickResponse = {
      restaurants, place: label, poolSize: ordered.length,
      cursor: exhausted ? 0 : nextCursor, exhausted, attribution: ATTRIBUTION,
    };
    res.json(payload);
  } catch (err) {
    console.error('[restaurants]', err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'upstream', message: 'The map data service is grumpy. Try again in a moment.' });
  }
});

app.post('/api/pick', (req: Request, res: Response) => {
  const { placeId, name } = (req.body || {}) as { placeId?: string; name?: string };
  if (!placeId || !name) return res.status(400).json({ error: 'bad_request' });
  res.json({ pickCount: incrementPick(String(placeId).slice(0, 128), String(name).slice(0, 200)) });
});

// Static web app (built Vite output copied to ./public)
const PUBLIC_DIR = process.env.NOUPICK_PUBLIC || path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC_DIR, { maxAge: '1h', index: 'index.html' }));
app.get('*', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

app.listen(PORT, () => console.log(`noupick api+web on :${PORT}`));
