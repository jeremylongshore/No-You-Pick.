import { GeoLocation, Restaurant } from "../types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

/**
 * A stable per-browser id. The server seeds its shuffle from this, so the
 * permutation is consistent across spins and you never see a repeat until the
 * pool is exhausted. Replaces the old ever-growing excludeNames list.
 */
function sessionId(): string {
  const KEY = "noupick_session";
  try {
    let s = localStorage.getItem(KEY);
    if (!s) {
      s = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(KEY, s);
    }
    return s;
  } catch {
    return "anon";
  }
}

export interface PickResult {
  restaurants: Restaurant[];
  place: string;
  poolSize: number;
  cursor: number;
  exhausted: boolean;
  attribution: string;
}

export const getRandomRestaurants = async (
  locationQuery: string,
  cuisine: string = "Any",
  cursor: number = 0,
  coords?: GeoLocation,
  radius: string = "15"
): Promise<PickResult> => {
  const res = await fetch(`${API_BASE}/api/restaurants`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locationQuery, cuisine, radius, coords, cursor, sessionId: sessionId() }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || `Search failed (${res.status})`);
  }
  // The server owns parsing. The client renders what it is given — no second parser.
  return data as PickResult;
};

/** Records a pick. Returns the new count, or null if the write failed. */
export const recordPick = async (r: Restaurant): Promise<number | null> => {
  try {
    const res = await fetch(`${API_BASE}/api/pick`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ placeId: r.id, name: r.name }),
    });
    if (!res.ok) return null;
    const d = await res.json();
    return typeof d.pickCount === "number" ? d.pickCount : null;
  } catch {
    return null;
  }
};
