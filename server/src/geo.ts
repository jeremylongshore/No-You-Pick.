import { cacheGet, cacheSet } from './db';

const UA = process.env.NOUPICK_USER_AGENT
  || 'noupick/2.0 (https://noupick.intentsolutions.io; jeremy@intentsolutions.io)';
const NOMINATIM = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org';
const GEO_TTL = 90 * 24 * 60 * 60 * 1000; // city centroids barely move

export interface GeoPoint { lat: number; lon: number; label: string; }

// Nominatim asks for <=1 req/sec. Serialize and space out live calls.
let chain: Promise<unknown> = Promise.resolve();
let lastCall = 0;
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = 1100 - (Date.now() - lastCall);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastCall = Date.now();
    return fn();
  });
  chain = run.catch(() => undefined);
  return run as Promise<T>;
}

export async function geocode(query: string): Promise<GeoPoint | null> {
  const key = `geo:${query.trim().toLowerCase()}`;
  const hit = cacheGet<GeoPoint>(key, GEO_TTL);
  if (hit) return hit;

  const url = `${NOMINATIM}/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=0`;
  const point = await serialize(async () => {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
    if (!res.ok) throw new Error(`nominatim ${res.status}`);
    const rows = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    if (!rows.length) return null;
    return { lat: parseFloat(rows[0].lat), lon: parseFloat(rows[0].lon), label: rows[0].display_name };
  });

  if (point) cacheSet(key, point);
  return point;
}

export function haversineMi(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 3958.8;
  const dLat = (bLat - aLat) * Math.PI / 180;
  const dLon = (bLon - aLon) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
