/**
 * Local Overture Places lookup.
 *
 * Replaces the request-time dependency on public Overpass mirrors, which
 * throttle under load and report it as HTTP 200 with an empty result set —
 * indistinguishable from "no restaurants here". That failure mode took the app
 * down on 2026-09-18.
 *
 * The database is built by ingest/build-places-db.sh and is read-only at
 * runtime. If it is absent the caller falls back to Overpass, so a missing file
 * degrades rather than breaks.
 */
import { DatabaseSync } from 'node:sqlite';
import * as path from 'path';
import * as fs from 'fs';
import { PlaceRow } from './types';

const DATA_DIR = process.env.NOUPICK_DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = process.env.NOUPICK_PLACES_DB || path.join(DATA_DIR, 'places.db');

let db: DatabaseSync | null = null;
let available = false;
let rowCount = 0;

export function initLocalPlaces(): { available: boolean; rows: number; path: string } {
  try {
    if (!fs.existsSync(DB_PATH)) {
      console.warn(`[places] no local database at ${DB_PATH} — falling back to Overpass`);
      return { available: false, rows: 0, path: DB_PATH };
    }
    db = new DatabaseSync(DB_PATH, { readOnly: true });
    const row = db.prepare('SELECT count(*) AS n FROM places').get() as { n: number };
    rowCount = Number(row?.n ?? 0);
    available = rowCount > 0;
    console.log(`[places] local database ready: ${rowCount.toLocaleString()} rows`);
  } catch (e) {
    console.error('[places] failed to open local database:', e instanceof Error ? e.message : e);
    available = false;
  }
  return { available, rows: rowCount, path: DB_PATH };
}

export const isLocalAvailable = () => available;
export const localRowCount = () => rowCount;

/** App cuisine -> Overture basic_category values. Empty means no filter. */
/**
 * App cuisine -> Overture taxonomy.primary values (with a couple of
 * basic_category values where the taxonomy is absent). Verified against the
 * 2026-08-19.0 release; Overture's broad bucket is basic_category, the specific
 * cuisine lives in taxonomy.primary.
 */
const CUISINE_CATEGORIES: Record<string, string[]> = {
  pizza:   ['pizza_restaurant'],
  mexican: ['mexican_restaurant', 'taco_restaurant', 'texmex_restaurant'],
  sushi:   ['sushi_restaurant', 'japanese_restaurant'],
  burgers: ['burger_restaurant', 'american_restaurant', 'fast_food_restaurant',
            'chicken_wings_restaurant', 'bar_and_grill_restaurant'],
  asian:   ['chinese_restaurant', 'japanese_restaurant', 'thai_restaurant',
            'vietnamese_restaurant', 'korean_restaurant', 'sushi_restaurant',
            'asian_restaurant', 'noodle_restaurant', 'ramen_restaurant'],
  italian: ['italian_restaurant', 'pizza_restaurant'],
  steak:   ['steakhouse', 'barbecue_restaurant'],
  veggie:  ['vegetarian_restaurant', 'vegan_restaurant', 'vegan_and_vegetarian_restaurant'],
  vegan:   ['vegan_restaurant', 'vegan_and_vegetarian_restaurant'],
  healthy: ['salad_shop', 'smoothie_juice_bar', 'vegetarian_restaurant', 'vegan_restaurant'],
  coffee:  ['coffee_shop', 'cafe'],
  dessert: ['dessert_shop', 'ice_cream_shop', 'bakery', 'donut_shop', 'candy_store'],
  chicken: ['chicken_restaurant', 'chicken_wings_restaurant'],
  indian:  ['indian_restaurant'],
  thai:    ['thai_restaurant'],
};

export function localSupportsCuisine(cuisine: string): boolean {
  const c = (cuisine || 'any').toLowerCase();
  return c === 'any' || c === '' || c in CUISINE_CATEGORIES;
}

/** Degrees of longitude per mile shrinks toward the poles; latitude does not. */
function bboxFor(lat: number, lon: number, radiusMi: number) {
  const dLat = radiusMi / 69.0;
  const cos = Math.max(0.01, Math.cos((lat * Math.PI) / 180));
  const dLon = radiusMi / (69.0 * cos);
  return { minLat: lat - dLat, maxLat: lat + dLat, minLon: lon - dLon, maxLon: lon + dLon };
}

function haversineMi(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 3958.8;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const MAX_POOL = 400;

export function queryLocal(
  lat: number,
  lon: number,
  radiusMi: number,
  cuisine: string
): PlaceRow[] | null {
  if (!available || !db) return null;

  const cats = CUISINE_CATEGORIES[(cuisine || 'any').toLowerCase()];
  const box = bboxFor(lat, lon, radiusMi);

  // Index is (lat, lon), so the latitude range drives the scan and longitude
  // narrows it. The circle is applied in JS afterwards — the box is a superset.
  let sql =
    'SELECT id, name, category, taxonomy, lat, lon, address, locality, region, website ' +
    'FROM places WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?';
  const params: (string | number)[] = [box.minLat, box.maxLat, box.minLon, box.maxLon];

  if (cats && cats.length) {
    const ph = cats.map(() => '?').join(',');
    sql += ` AND (taxonomy IN (${ph}) OR category IN (${ph}))`;
    params.push(...cats, ...cats);
  }
  sql += ' LIMIT 4000';

  const rows = db.prepare(sql).all(...params) as Array<{
    id: string; name: string; category: string | null; taxonomy: string | null;
    lat: number; lon: number; address: string | null; locality: string | null;
    region: string | null; website: string | null;
  }>;

  const seen = new Set<string>();
  const out: PlaceRow[] = [];
  for (const r of rows) {
    if (haversineMi(lat, lon, Number(r.lat), Number(r.lon)) > radiusMi) continue;
    const key = r.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;   // collapse duplicate chain locations
    seen.add(key);
    out.push({
      id: `ovt:${r.id}`,
      name: r.name.trim(),
      lat: Number(r.lat),
      lon: Number(r.lon),
      cuisineTag: r.taxonomy || r.category,
      street: r.address,
      housenumber: null,          // Overture ships a single freeform address line
      city: r.locality,
      hours: null,                // Overture Places carries no opening hours
      website: r.website,
    });
    if (out.length >= MAX_POOL) break;
  }
  return out;
}
