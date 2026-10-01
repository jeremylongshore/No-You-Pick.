export interface Restaurant {
  id: string;            // stable identity: "osm:node/123456" — NOT the display name
  name: string;
  cuisine: string;       // human-readable, e.g. "Mexican"
  address: string;       // "" when unknown — never invented
  distanceMi: number;
  hours: string | null;  // raw OSM opening_hours spec, null when unknown
  reason: string;        // derived from real fields, no model involved
  mapsUrl: string;       // key-free universal Google Maps URL
  appleMapsUrl: string;  // key-free maps.apple.com link for iOS
  website: string | null;
  pickCount: number;
}

export interface PickRequest {
  locationQuery?: string;
  cuisine?: string;
  radius?: string | number;
  coords?: { lat: number; lng: number };
  sessionId?: string;
  cursor?: number;
}

export interface PickResponse {
  restaurants: Restaurant[];
  place: string;          // resolved location label, echoed back
  poolSize: number;
  cursor: number;
  exhausted: boolean;
  attribution: string;
}

export interface PlaceRow {
  id: string;
  name: string;
  lat: number;
  lon: number;
  cuisineTag: string | null;
  street: string | null;
  housenumber: string | null;
  city: string | null;
  hours: string | null;
  website: string | null;
}
