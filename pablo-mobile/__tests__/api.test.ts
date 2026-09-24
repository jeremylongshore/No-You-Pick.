/**
 * Contract tests for the noupick API client.
 *
 * These lock the shape the server actually returns. The previous version of
 * this file asserted the old Gemini contract (`rawText`, `rating`,
 * `googleMapLink`) which no longer exists — those fields were model-invented.
 */
import { searchRestaurants, recordPick, getSessionId, Restaurant } from '../services/api';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const realFetch = global.fetch;

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  }) as unknown as typeof fetch;
}

const sampleRestaurant: Restaurant = {
  id: 'osm:node/123',
  name: "Joe's Pizza",
  cuisine: 'Pizza',
  address: '7 Carmine St, New York',
  distanceMi: 1.4,
  hours: 'Mo-Su 11:00-23:00',
  reason: 'Pizza. 1.4 mi away. Open till 11pm.',
  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Joe%27s%20Pizza',
  appleMapsUrl: 'https://maps.apple.com/?q=Joe%27s%20Pizza&sll=40.7,-74',
  website: null,
  pickCount: 3,
};

const sampleResponse = {
  restaurants: [sampleRestaurant],
  place: 'New York, New York County',
  poolSize: 212,
  cursor: 3,
  exhausted: false,
  attribution: 'Place data © OpenStreetMap contributors (ODbL). Geocoding by Nominatim.',
};

afterEach(() => {
  global.fetch = realFetch;
  jest.clearAllMocks();
});

describe('searchRestaurants', () => {
  it('returns the server payload unchanged — the client must not re-parse', async () => {
    mockFetchOnce(sampleResponse);
    const res = await searchRestaurants('New York, NY', 'Pizza', '5', 0);

    expect(res.restaurants).toHaveLength(1);
    expect(res.restaurants[0].name).toBe("Joe's Pizza");
    expect(res.restaurants[0].id).toBe('osm:node/123');
    expect(res.place).toBe('New York, New York County');
    expect(res.poolSize).toBe(212);
    expect(res.cursor).toBe(3);
    expect(res.exhausted).toBe(false);
  });

  it('sends cuisine, radius, cursor and a session id so the shuffle is stable', async () => {
    mockFetchOnce(sampleResponse);
    await searchRestaurants('Austin, TX', 'Sushi', '15', 6);

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.locationQuery).toBe('Austin, TX');
    expect(body.cuisine).toBe('Sushi');
    expect(body.radius).toBe('15');
    expect(body.cursor).toBe(6);
    expect(typeof body.sessionId).toBe('string');
    expect(body.sessionId.length).toBeGreaterThan(0);
  });

  it('forwards device coordinates when provided', async () => {
    mockFetchOnce(sampleResponse);
    await searchRestaurants('My location', 'Any', '5', 0, { lat: 30.2672, lng: -97.7431 });

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(init.body).coords).toEqual({ lat: 30.2672, lng: -97.7431 });
  });

  it("surfaces the server's own error message rather than a generic one", async () => {
    mockFetchOnce({ error: 'unknown_place', message: 'Never heard of "zzz". Try a city, or a zip.' }, false, 404);
    await expect(searchRestaurants('zzz', 'Any', '5', 0)).rejects.toThrow(/Never heard of/);
  });

  it('falls back to a status-code message when the body carries none', async () => {
    mockFetchOnce({}, false, 502);
    await expect(searchRestaurants('Austin, TX', 'Any', '5', 0)).rejects.toThrow(/502/);
  });

  it('reports an empty pool without throwing — the UI shows its own copy', async () => {
    mockFetchOnce({ ...sampleResponse, restaurants: [], poolSize: 0, exhausted: true });
    const res = await searchRestaurants('Nowhere, AK', 'Sushi', '1', 0);
    expect(res.restaurants).toEqual([]);
    expect(res.poolSize).toBe(0);
  });
});

describe('recordPick', () => {
  it('returns the new count on success', async () => {
    mockFetchOnce({ pickCount: 12 });
    await expect(recordPick(sampleRestaurant)).resolves.toBe(12);
  });

  it('keys the write on the stable place id, never the display name', async () => {
    mockFetchOnce({ pickCount: 1 });
    await recordPick(sampleRestaurant);

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.placeId).toBe('osm:node/123');
  });

  it('returns null instead of throwing when the write fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    await expect(recordPick(sampleRestaurant)).resolves.toBeNull();
  });
});

describe('getSessionId', () => {
  it('returns a stable id across calls', async () => {
    const a = await getSessionId();
    const b = await getSessionId();
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(4);
  });
});
