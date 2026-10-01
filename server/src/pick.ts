// Randomness lives here, in code — not in a prompt.
// A seeded permutation plus a cursor guarantees no repeat until the pool is exhausted.

export function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic Fisher-Yates. Same seed + same pool => same order, every time. */
export function seededShuffle<T>(items: T[], seed: number): T[] {
  const out = items.slice();
  const rnd = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Spread the page across categories so three taquerias don't come back together.
 * Round-robins the shuffled buckets, preserving the seeded order within each.
 */
export function stratify<T>(items: T[], keyOf: (t: T) => string, seed: number): T[] {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const k = keyOf(item) || 'other';
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(item);
  }
  const order = seededShuffle([...buckets.keys()], seed);
  const out: T[] = [];
  let added = true;
  for (let round = 0; added; round++) {
    added = false;
    for (const k of order) {
      const b = buckets.get(k)!;
      if (round < b.length) { out.push(b[round]); added = true; }
    }
  }
  return out;
}
