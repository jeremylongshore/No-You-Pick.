import { cacheGet, cacheSet } from './db';
import { haversineMi } from './geo';
import { PlaceRow } from './types';

const UA = process.env.NOUPICK_USER_AGENT
  || 'noupick/2.0 (https://noupick.intentsolutions.io; jeremy@intentsolutions.io)';
// Public Overpass instances throttle hard and 504 under load. Rotate across mirrors.
const OVERPASS_ENDPOINTS = (process.env.OVERPASS_URLS ||
  [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.osm.ch/api/interpreter',
  ].join(',')
).split(',').map(s => s.trim()).filter(Boolean);
const POOL_TTL = 24 * 60 * 60 * 1000;

/** App cuisine -> OSM cuisine regex. "Any" means no filter. */
const CUISINE_MAP: Record<string, string> = {
  pizza:    'pizza',
  mexican:  'mexican|tex-mex|taco|burrito',
  sushi:    'sushi|japanese',
  burgers:  'burger|american',
  asian:    'chinese|japanese|thai|vietnamese|korean|asian|ramen|noodle',
  italian:  'italian|pasta|pizza',
  steak:    'steak_house|steak|barbecue|bbq',
  veggie:   'vegetarian|vegan',
  vegan:    'vegan',
  healthy:  'salad|vegetarian|vegan|health',
  coffee:   'coffee_shop|coffee|cafe',
  dessert:  'ice_cream|dessert|bakery|donut|cake',
  chicken:  'chicken|wings|fried_chicken',
  indian:   'indian|pakistani|curry',
  thai:     'thai',
};

/** Amenity set widens for drink/dessert-led categories. */
function amenitiesFor(cuisine: string): string[] {
  const c = cuisine.toLowerCase();
  if (c === 'coffee') return ['cafe'];
  if (c === 'dessert') return ['cafe', 'ice_cream', 'restaurant'];
  if (c === 'burgers' || c === 'chicken') return ['restaurant', 'fast_food'];
  return ['restaurant', 'fast_food'];
}

function cuisineRegex(cuisine: string): string | null {
  const c = (cuisine || 'any').toLowerCase();
  if (!c || c === 'any') return null;
  return CUISINE_MAP[c] || c.replace(/[^a-z0-9]+/g, '_');
}

function buildQuery(lat: number, lon: number, radiusM: number, cuisine: string): string {
  const rx = cuisineRegex(cuisine);
  const filter = rx ? `["cuisine"~"${rx}",i]` : '';
  const parts = amenitiesFor(cuisine)
    .map(a => `node["amenity"="${a}"]${filter}(around:${radiusM},${lat},${lon});`)
    .join('\n  ');
  return `[out:json][timeout:15];\n(\n  ${parts}\n);\nout body 200;`;
}

function tileKey(lat: number, lon: number, radiusMi: number, cuisine: string): string {
  // ~0.01 deg buckets so nearby searches share a cached pool.
  const la = Math.round(lat * 100) / 100;
  const lo = Math.round(lon * 100) / 100;
  return `pool:${la}:${lo}:${radiusMi}:${(cuisine || 'any').toLowerCase()}`;
}

/** Try each mirror in turn; a 429/504 from a busy instance is normal, not fatal. */
async function queryOverpass(body: string, hardStop = Date.now() + 16_000): Promise<{ elements?: OverpassEl[] }> {
  let lastErr: unknown = null;
  // Randomize mirror order so concurrent requests spread across instances
  // instead of all hammering the first one and tripping its rate limiter.
  const endpoints = OVERPASS_ENDPOINTS
    .map(u => ({ u, r: Math.random() }))
    .sort((a, b) => a.r - b.r)
    .map(x => x.u);
  for (const url of endpoints) {
    if (Date.now() > hardStop) break;
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 8_000);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
          signal: ctl.signal,
        });
        if (!res.ok) { lastErr = new Error(`${url} -> ${res.status}`); continue; }
        const json = (await res.json()) as { elements?: OverpassEl[]; remark?: string };
        if (!Array.isArray(json.elements)) {
          lastErr = new Error(`${url} -> 200 but no elements array`);
          continue;
        }
        // Overpass reports overload/timeout in a `remark` field while still
        // returning HTTP 200 with an empty set. That is a failure, not an answer.
        if (json.remark && /error|timed out|timeout|load/i.test(json.remark)) {
          lastErr = new Error(`${url} -> remark: ${json.remark.slice(0, 120)}`);
          continue;
        }
        return json;
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`all overpass mirrors failed: ${lastErr instanceof Error ? lastErr.message : lastErr}`);
}

/** Two passes over the mirror list — a busy instance often recovers on retry. */
const POOL_DEADLINE_MS = 16_000;

async function queryOverpassWithRetry(body: string): Promise<{ elements?: OverpassEl[] }> {
  let lastErr: unknown = null;
  const deadline = Date.now() + POOL_DEADLINE_MS;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (Date.now() > deadline) break;
    if (attempt > 0) await new Promise(r => setTimeout(r, 400 * attempt));
    try {
      const json = await queryOverpass(body, deadline);
      // An empty set from a busy public instance is usually throttling, not a
      // food desert. Retry before believing it.
      if (Array.isArray(json.elements) && json.elements.length === 0 && attempt < 2) {
        lastErr = new Error('empty result set');
        continue;
      }
      return json;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('overpass failed');
}

interface OverpassEl {
  type: string;
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

export async function fetchPool(
  lat: number, lon: number, radiusMi: number, cuisine: string
): Promise<PlaceRow[]> {
  const key = tileKey(lat, lon, radiusMi, cuisine);
  const hit = cacheGet<PlaceRow[]>(key, POOL_TTL);
  if (hit) return hit;

  const body = 'data=' + encodeURIComponent(
    buildQuery(lat, lon, Math.round(radiusMi * 1609.34), cuisine)
  );
  const data = await queryOverpassWithRetry(body);
  if (!data.elements || data.elements.length === 0) {
    console.warn(`[pool] empty result for ${key} — not caching`);
  }
  const rows: PlaceRow[] = [];
  const seen = new Set<string>();

  for (const el of data.elements || []) {
    const t = el.tags || {};
    const name = (t.name || '').trim();
    if (!name) continue;                       // unnamed nodes are useless to a picker
    const dedupe = name.toLowerCase();
    if (seen.has(dedupe)) continue;            // collapse duplicate chain nodes
    seen.add(dedupe);
    rows.push({
      id: `osm:${el.type}/${el.id}`,
      name,
      lat: el.lat,
      lon: el.lon,
      cuisineTag: t.cuisine || null,
      street: t['addr:street'] || null,
      housenumber: t['addr:housenumber'] || null,
      city: t['addr:city'] || null,
      hours: t.opening_hours || null,
      website: t.website || t['contact:website'] || null,
    });
  }

  if (rows.length > 0) cacheSet(key, rows);
  return rows;
}

function titleCase(s: string): string {
  return s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * OSM cuisine is a multi-value tag ("greek;mexican"). When the user filtered for
 * something, surface the value that actually matched so the card doesn't say
 * "Greek" on a search for Mexican.
 */
export function prettyCuisine(tag: string | null, cuisine?: string): string {
  if (!tag) return 'Restaurant';
  const values = tag.split(/[;,]/).map(v => v.trim()).filter(Boolean);
  if (!values.length) return 'Restaurant';
  const rx = cuisine ? cuisineRegex(cuisine) : null;
  if (rx) {
    const re = new RegExp(rx, 'i');
    const hit = values.find(v => re.test(v));
    if (hit) return titleCase(hit);
  }
  return titleCase(values[0]);
}

export function formatAddress(p: PlaceRow): string {
  const line = [p.housenumber, p.street].filter(Boolean).join(' ');
  return [line, p.city].filter(Boolean).join(', ');
}

/** Short, honest hours hint. Only emitted for simple single-range specs. */
function hoursHint(spec: string | null): string | null {
  if (!spec) return null;
  const s = spec.trim();
  if (s.toLowerCase() === '24/7') return 'Open 24/7';

  // Multiple rules mean the closing time depends on the day. We don't evaluate
  // day-of-week here, so stay quiet rather than assert the wrong hour.
  if (s.includes(';') || s.includes('||') || /PH|SH|off|sunset|sunrise/i.test(s)) return null;
  const ranges = s.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/g) || [];
  if (ranges.length !== 1) return null;

  const m = ranges[0].match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/)!;
  const h = parseInt(m[3], 10) % 24;
  const min = m[4];
  if (h === 0) return 'Open till midnight';
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `Open till ${h12}${min === '00' ? '' : ':' + min}${suffix}`;
}

/**
 * Reason text derived entirely from fields we actually hold.
 * Nothing here is generated or guessed — if a fact is missing, it is simply absent.
 */
export function buildReason(p: PlaceRow, distanceMi: number, cuisine?: string): string {
  const bits: string[] = [prettyCuisine(p.cuisineTag, cuisine) + '.'];
  bits.push(distanceMi < 0.2 ? 'Right here.' : `${distanceMi.toFixed(1)} mi away.`);
  const h = hoursHint(p.hours);
  if (h) bits.push(h + '.');
  return bits.join(' ');
}

export function mapsUrl(p: PlaceRow): string {
  // Key-free universal Maps URL — Google: "You don't need a Google API key to use Maps URLs."
  // Roughly half of OSM restaurant nodes carry no address. Searching a bare name
  // ("Rio") can land anywhere in the country, so fall back to anchoring the
  // search on the node's coordinates.
  const addr = formatAddress(p);
  const q = addr ? `${p.name} ${addr}` : `${p.name} ${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** iOS opens the Maps app from an https maps.apple.com link; Android uses a geo: intent. */
export function appleMapsUrl(p: PlaceRow): string {
  const addr = formatAddress(p);
  const q = addr ? `${p.name} ${addr}` : p.name;
  // sll centres the search, so Apple Maps resolves a bare name to the right place.
  return `https://maps.apple.com/?q=${encodeURIComponent(q)}&sll=${p.lat},${p.lon}`;
}

export { haversineMi };
