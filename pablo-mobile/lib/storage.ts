import AsyncStorage from '@react-native-async-storage/async-storage';
import { Restaurant } from '../services/api';

const FAVORITES = 'noupick_favorites';
const PICKED = 'noupick_picked';
const LAST_LOCATION = 'noupick_last_location';
const LAST_RADIUS = 'noupick_last_radius';

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* a full or unavailable store is not worth crashing over */
  }
}

export const getFavorites = () => readJson<Restaurant[]>(FAVORITES, []);

export async function toggleFavorite(r: Restaurant): Promise<Restaurant[]> {
  const list = await getFavorites();
  // Keyed on the stable place id, never the display name.
  const next = list.some(f => f.id === r.id) ? list.filter(f => f.id !== r.id) : [...list, r];
  await writeJson(FAVORITES, next);
  return next;
}

export const getPicked = () => readJson<Record<string, true>>(PICKED, {});

export async function markPicked(id: string): Promise<void> {
  const picked = await getPicked();
  picked[id] = true;
  await writeJson(PICKED, picked);
}

export async function saveLastSearch(location: string, radius: string): Promise<void> {
  try {
    await AsyncStorage.multiSet([[LAST_LOCATION, location], [LAST_RADIUS, radius]]);
  } catch { /* non-fatal */ }
}

export async function getLastSearch(): Promise<{ location: string; radius: string }> {
  try {
    const pairs = await AsyncStorage.multiGet([LAST_LOCATION, LAST_RADIUS]);
    const map = Object.fromEntries(pairs);
    return { location: map[LAST_LOCATION] || '', radius: map[LAST_RADIUS] || '15' };
  } catch {
    return { location: '', radius: '15' };
  }
}
