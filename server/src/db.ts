import { DatabaseSync } from 'node:sqlite';
import * as path from 'path';
import * as fs from 'fs';

const DATA_DIR = process.env.NOUPICK_DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'noupick.db'));
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS cache (
    key        TEXT PRIMARY KEY,
    payload    TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  );

  -- Pick counts key on the stable place id, never the display name.
  CREATE TABLE IF NOT EXISTS picks (
    place_id   TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    pick_count INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );
`);

const selCache = db.prepare('SELECT payload, fetched_at FROM cache WHERE key = ?');
const upCache = db.prepare(
  'INSERT INTO cache (key, payload, fetched_at) VALUES (?, ?, ?) ' +
  'ON CONFLICT(key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at'
);

export function cacheGet<T>(key: string, maxAgeMs: number): T | null {
  const row = selCache.get(key) as { payload: string; fetched_at: number } | undefined;
  if (!row) return null;
  if (Date.now() - Number(row.fetched_at) > maxAgeMs) return null;
  try {
    return JSON.parse(row.payload) as T;
  } catch {
    return null;
  }
}

export function cacheSet(key: string, value: unknown): void {
  upCache.run(key, JSON.stringify(value), Date.now());
}

const bumpPick = db.prepare(
  'INSERT INTO picks (place_id, name, pick_count, updated_at) VALUES (?, ?, 1, ?) ' +
  'ON CONFLICT(place_id) DO UPDATE SET pick_count = pick_count + 1, name = excluded.name, updated_at = excluded.updated_at'
);
const selOnePick = db.prepare('SELECT pick_count FROM picks WHERE place_id = ?');

export function pickCounts(ids: string[]): Map<string, number> {
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  const stmt = db.prepare(
    `SELECT place_id, pick_count FROM picks WHERE place_id IN (${ids.map(() => '?').join(',')})`
  );
  for (const r of stmt.all(...ids) as { place_id: string; pick_count: number }[]) {
    out.set(r.place_id, Number(r.pick_count));
  }
  return out;
}

export function incrementPick(placeId: string, name: string): number {
  bumpPick.run(placeId, name, Date.now());
  const row = selOnePick.get(placeId) as { pick_count: number } | undefined;
  return Number(row?.pick_count ?? 1);
}

export function sweepCache(maxAgeMs: number): void {
  db.prepare('DELETE FROM cache WHERE fetched_at < ?').run(Date.now() - maxAgeMs);
}
