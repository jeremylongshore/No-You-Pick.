/**
 * Smoke tests for the local Overture place lookup.
 *
 * Uses node:test and node:sqlite — no dependencies. Builds a throwaway database
 * with known coordinates so the geometry is verifiable by hand rather than
 * asserted against whatever the real data happens to contain.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'noupick-test-'));
const dbPath = path.join(dir, 'places.db');

// Austin city hall is the origin for every distance assertion below.
const ORIGIN = { lat: 30.2672, lon: -97.7431 };

{
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE places (
    id TEXT PRIMARY KEY, name TEXT, category TEXT, taxonomy TEXT,
    lat REAL, lon REAL, address TEXT, locality TEXT, region TEXT,
    website TEXT, phone TEXT, confidence REAL)`);
  const ins = db.prepare(
    'INSERT INTO places VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  // ~0.7 mi north, ~3.5 mi north, ~35 mi north
  ins.run('a', 'Close Taqueria', 'restaurant', 'mexican_restaurant', 30.2772, -97.7431, '1 Main', 'Austin', 'TX', null, null, 0.9);
  ins.run('b', 'Mid Pizza',      'restaurant', 'pizza_restaurant',   30.3172, -97.7431, '2 Main', 'Austin', 'TX', null, null, 0.9);
  ins.run('c', 'Far Diner',      'restaurant', 'diner',              30.7672, -97.7431, '3 Main', 'Austin', 'TX', null, null, 0.9);
  ins.run('d', 'Close Taqueria', 'restaurant', 'mexican_restaurant', 30.2773, -97.7432, '4 Main', 'Austin', 'TX', null, null, 0.9);
  db.exec('CREATE INDEX idx ON places(lat, lon)');
  db.close();
}

process.env.NOUPICK_PLACES_DB = dbPath;
const { initLocalPlaces, queryLocal, localSupportsCuisine } = await import('../dist/localPlaces.js');

test('opens the database and reports availability', () => {
  const info = initLocalPlaces();
  assert.equal(info.available, true);
  assert.equal(info.rows, 4);
});

test('radius excludes places beyond it', () => {
  const near = queryLocal(ORIGIN.lat, ORIGIN.lon, 5, 'Any');
  const names = near.map(r => r.name);
  assert.ok(names.includes('Close Taqueria'), 'the 0.7mi place is inside 5mi');
  assert.ok(names.includes('Mid Pizza'), 'the 3.5mi place is inside 5mi');
  assert.ok(!names.includes('Far Diner'), 'the 35mi place must be excluded');
});

test('a tighter radius excludes more', () => {
  const names = queryLocal(ORIGIN.lat, ORIGIN.lon, 1, 'Any').map(r => r.name);
  assert.deepEqual(names, ['Close Taqueria']);
});

test('duplicate names collapse so one chain cannot fill the page', () => {
  // Two rows share the name "Close Taqueria" at nearly the same point.
  const rows = queryLocal(ORIGIN.lat, ORIGIN.lon, 5, 'Any');
  assert.equal(rows.filter(r => r.name === 'Close Taqueria').length, 1);
});

test('cuisine filter matches taxonomy, not just the broad category', () => {
  const mex = queryLocal(ORIGIN.lat, ORIGIN.lon, 5, 'Mexican').map(r => r.name);
  assert.deepEqual(mex, ['Close Taqueria']);
  const pizza = queryLocal(ORIGIN.lat, ORIGIN.lon, 5, 'Pizza').map(r => r.name);
  assert.deepEqual(pizza, ['Mid Pizza']);
});

test('ids are namespaced so they never collide with Overpass ids', () => {
  const rows = queryLocal(ORIGIN.lat, ORIGIN.lon, 5, 'Any');
  assert.ok(rows.every(r => r.id.startsWith('ovt:')));
});

test('cuisines the local set cannot serve are reported as unsupported', () => {
  assert.equal(localSupportsCuisine('Any'), true);
  assert.equal(localSupportsCuisine('Mexican'), true);
  assert.equal(localSupportsCuisine('Ethiopian'), false);
});
