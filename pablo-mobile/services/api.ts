/**
 * No, YOU Pick! — API client
 *
 * Talks to the self-hosted service at noupick.intentsolutions.io, which returns
 * real places sourced from OpenStreetMap. The server owns all parsing and all
 * randomness; this client only renders what it is handed.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://noupick.intentsolutions.io';
const SESSION_KEY = 'noupick_session';

export interface Restaurant {
  /** Stable place identity (e.g. "osm:node/123"). Never the display name. */
  id: string;
  name: string;
  cuisine: string;
  /** Empty string when unknown — never invented. */
  address: string;
  distanceMi: number;
  /** Raw opening-hours spec, or null when the data doesn't say. */
  hours: string | null;
  reason: string;
  /** Key-free universal maps links — no API key, no billing account. */
  mapsUrl: string;
  appleMapsUrl: string;
  website: string | null;
  pickCount: number;
}

export interface SearchResponse {
  restaurants: Restaurant[];
  place: string;
  poolSize: number;
  cursor: number;
  exhausted: boolean;
  attribution: string;
}

export interface Coords {
  lat: number;
  lng: number;
}

/**
 * Stable per-install id. The server seeds its shuffle from this, so paging with
 * the cursor cannot repeat a place until the pool is exhausted.
 */
let cachedSession: string | null = null;
export async function getSessionId(): Promise<string> {
  if (cachedSession) return cachedSession;
  try {
    let s = await AsyncStorage.getItem(SESSION_KEY);
    if (!s) {
      s = Math.random().toString(36).slice(2) + Date.now().toString(36);
      await AsyncStorage.setItem(SESSION_KEY, s);
    }
    cachedSession = s;
    return s;
  } catch {
    return 'anon';
  }
}

async function postJson<T>(path: string, body: unknown, timeoutMs = 45000): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((data as { message?: string })?.message || `Request failed (${res.status})`);
    }
    return data as T;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('That took too long. The map data service is busy — try again.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const searchRestaurants = async (
  locationQuery: string,
  cuisine: string = 'Any',
  radius: string = '15',
  cursor: number = 0,
  coords?: Coords
): Promise<SearchResponse> => {
  const sessionId = await getSessionId();
  return postJson<SearchResponse>('/api/restaurants', {
    locationQuery,
    cuisine,
    radius,
    cursor,
    coords,
    sessionId,
  });
};

/** Records a pick. Returns the new count, or null when the write fails. */
export const recordPick = async (r: Restaurant): Promise<number | null> => {
  try {
    const d = await postJson<{ pickCount: number }>('/api/pick', { placeId: r.id, name: r.name }, 10000);
    return typeof d.pickCount === 'number' ? d.pickCount : null;
  } catch {
    return null;
  }
};

export const checkHealth = async (): Promise<boolean> => {
  try {
    const res = await fetch(`${API_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
};
