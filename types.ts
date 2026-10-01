
export interface Restaurant {
  /** Stable place identity (e.g. "osm:node/123"). Pick counts key on this, never the name. */
  id: string;
  name: string;
  cuisine: string;
  /** Empty string when unknown — never invented. */
  address: string;
  distanceMi: number;
  /** Raw opening-hours spec, or null. The UI only shows what we can state honestly. */
  hours: string | null;
  reason: string;
  /** Key-free universal Maps links. No API key, no billing account. */
  mapsUrl: string;
  appleMapsUrl: string;
  website: string | null;
  pickCount: number;
}

export interface GeoLocation {
  lat: number;
  lng: number;
}

export enum AppStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}
