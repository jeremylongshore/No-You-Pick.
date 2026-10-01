#!/usr/bin/env bash
# Build the local Overture Places database.
#
# WHY THIS EXISTS: the app previously depended on public Overpass mirrors at
# request time. They throttle, and worse, they signal throttling as HTTP 200
# with an empty result set — indistinguishable from "no restaurants here". That
# took the app down for a partner on 2026-09-18. Local data removes the
# request-time dependency entirely.
#
# Overture Places is CDLA-Permissive 2.0 / Apache 2.0 / CC0 — no ODbL
# share-alike, which is why this uses Overture rather than bulk-loading OSM.
# (Rendering OSM results is fine; storing a filtered derived table would make it
# a Derivative Database and share-alike would attach.)
#
# Run on the VPS, not the dev box (the dev box has no headroom and this pulls
# several GB through DuckDB).
#
# TIMING, measured 2026-09-18 against release 2026-08-19.0:
#   single metro (0.7 x 0.5 deg)   ~20 s
#   Gulf Coast   (12 x 5 deg)      ~4 min
#   CONUS        (59 x 26 deg)     expect 1-2 h — run it detached with nohup
# Cost scales with bbox area because Overture is spatially ordered, so a tight
# box skips most row groups. Chunking by region and running several passes is
# a reasonable alternative to one long CONUS query.
#
# Re-run monthly-ish, when Overture cuts a release. Releases are listed at
#   https://overturemaps-us-west-2.s3.amazonaws.com/?list-type=2&delimiter=/&prefix=release/
set -euo pipefail

RELEASE="${OVERTURE_RELEASE:-2026-08-19.0}"
OUT="${1:-/srv/noupick/data/places.db}"
# Override to build a smaller regional database: REGION_BBOX="xmin xmax ymin ymax"
REGION_BBOX="${REGION_BBOX:-}"
TOOLS="$(cd "$(dirname "$0")" && pwd)"
DUCKDB="${DUCKDB_BIN:-/srv/noupick/tools/duckdb}"
TMP="${OUT}.building"

command -v "$DUCKDB" >/dev/null 2>&1 || [ -x "$DUCKDB" ] || {
  echo "duckdb not found at $DUCKDB" >&2; exit 1; }

if [ -n "$REGION_BBOX" ]; then
  read -r XMIN XMAX YMIN YMAX <<<"$REGION_BBOX"
  BBOX_PREDICATE="(bbox.xmin BETWEEN $XMIN AND $XMAX AND bbox.ymin BETWEEN $YMIN AND $YMAX)"
  echo "Region build: $REGION_BBOX"
else
  BBOX_PREDICATE="(
    (bbox.xmin BETWEEN -125 AND -66  AND bbox.ymin BETWEEN 24 AND 50) OR
    (bbox.xmin BETWEEN -170 AND -129 AND bbox.ymin BETWEEN 51 AND 72) OR
    (bbox.xmin BETWEEN -161 AND -154 AND bbox.ymin BETWEEN 18 AND 23)
  )"
fi

echo "Building from Overture release $RELEASE -> $OUT"
rm -f "$TMP"

"$DUCKDB" <<SQL
INSTALL httpfs; LOAD httpfs;
INSTALL spatial; LOAD spatial;
INSTALL sqlite;  LOAD sqlite;
-- Be a good neighbour: this box runs other people's production.
SET memory_limit='5GB';
SET threads=3;
SET s3_region='us-west-2';

ATTACH '$TMP' AS sq (TYPE SQLITE);

CREATE TABLE sq.places AS
SELECT
  id,
  names.primary                                   AS name,
  basic_category                                  AS category,
  taxonomy.primary                                AS taxonomy,
  ROUND(ST_Y(geometry)::DOUBLE, 6)                AS lat,
  ROUND(ST_X(geometry)::DOUBLE, 6)                AS lon,
  addresses[1].freeform                           AS address,
  addresses[1].locality                           AS locality,
  addresses[1].region                             AS region,
  websites[1]                                     AS website,
  phones[1]                                       AS phone,
  confidence
FROM read_parquet('s3://overturemaps-us-west-2/release/$RELEASE/theme=places/type=place/*')
WHERE
  -- US coverage: CONUS, Alaska, Hawaii.
  ${BBOX_PREDICATE}
  -- basic_category is the broad bucket ("is this food"); taxonomy.primary
  -- carries the actual cuisine ("mexican_restaurant"). Verified against the
  -- 2026-08-19.0 release — these are the real values, not the ones the docs
  -- examples imply.
  AND basic_category IN (
    'restaurant','casual_eatery','fast_food_restaurant','bar','coffee_shop',
    'cafe','food_truck_stand','smoothie_juice_bar','brewery','food_and_drink',
    'food_service','bakery','dessert_shop','ice_cream_shop','pub','diner'
  )
  AND names.primary IS NOT NULL
  -- Low-confidence rows are frequently duplicates or defunct listings.
  AND confidence >= 0.5
  -- Overture geolocates a large number of places into the ocean at 0,0.
  AND NOT (ST_X(geometry) = 0 AND ST_Y(geometry) = 0);

SELECT 'rows: ' || count(*) FROM sq.places;
SQL

# Indexes are created here rather than in the DuckDB step: DuckDB refuses
# CREATE INDEX against an attached SQLite database ("SQLite databases only have
# a single schema"). node:sqlite does it in well under a second.
#
# A picker only ever asks "what is near this point", so a lat-leading index plus
# a longitude range predicate is the whole access path. Deliberately no R-tree —
# node:sqlite's build may not carry the extension, and a bounding-box scan over
# a covering index is already sub-millisecond at this row count.
node --input-type=module -e "
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('$TMP');
db.exec('CREATE INDEX IF NOT EXISTS idx_places_lat_lon ON places(lat, lon)');
db.exec('CREATE INDEX IF NOT EXISTS idx_places_cat ON places(category)');
db.exec('CREATE INDEX IF NOT EXISTS idx_places_tax ON places(taxonomy)');
db.exec('ANALYZE');
const n = db.prepare('SELECT count(*) AS n FROM places').get().n;
console.log('indexed ' + Number(n).toLocaleString() + ' rows');
db.close();
" 2>/dev/null

mv -f "$TMP" "$OUT"
echo "Done: $OUT ($(du -h "$OUT" | cut -f1))"
