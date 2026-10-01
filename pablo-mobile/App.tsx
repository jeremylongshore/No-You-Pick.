import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  SafeAreaView,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { Mascot, Expression } from './components/Mascot';
import { Restaurant, searchRestaurants, recordPick } from './services/api';
import {
  getFavorites,
  toggleFavorite,
  getPicked,
  markPicked,
  saveLastSearch,
  getLastSearch,
} from './lib/storage';

const CUISINES = [
  'Any', 'Pizza', 'Mexican', 'Sushi', 'Burgers', 'Asian', 'Italian', 'Steak',
  'Veggie', 'Vegan', 'Healthy', 'Coffee', 'Dessert', 'Chicken', 'Indian', 'Thai',
];

const RADII = [
  { value: '1', label: 'Walk', sub: '1 mi' },
  { value: '5', label: 'Drive', sub: '5 mi' },
  { value: '15', label: 'Far', sub: '15 mi' },
  { value: '30', label: 'Trip', sub: '30 mi' },
];

const LOADING_LINES = [
  'Arguing with the map…',
  'Sniffing out three spots…',
  'Ignoring the obvious choice…',
  'Digging past the tourist traps…',
  'Consulting the fox…',
];

/** Extracts the hours claim the server embedded in `reason`, if any. */
function hoursClaim(reason: string): string | null {
  const m = reason.match(/Open (?:till [^.]+|24\/7|till midnight)/);
  return m ? m[0] : null;
}

export default function App() {
  const [location, setLocation] = useState('');
  const [cuisine, setCuisine] = useState('Any');
  const [radius, setRadius] = useState('15');
  const [showCuisines, setShowCuisines] = useState(false);

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [place, setPlace] = useState('');
  const [attribution, setAttribution] = useState('');
  const [cursor, setCursor] = useState(0);
  const [exhausted, setExhausted] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadingLine, setLoadingLine] = useState(LOADING_LINES[0]);
  const [error, setError] = useState('');
  const [expression, setExpression] = useState<Expression>('happy');

  const [favorites, setFavorites] = useState<Restaurant[]>([]);
  const [picked, setPicked] = useState<Record<string, true>>({});
  const [showFavorites, setShowFavorites] = useState(false);

  // Coordinates win over the typed location when the user grants permission.
  const coordsRef = useRef<{ lat: number; lng: number } | undefined>(undefined);

  useEffect(() => {
    (async () => {
      const [favs, pick, last] = await Promise.all([getFavorites(), getPicked(), getLastSearch()]);
      setFavorites(favs);
      setPicked(pick);
      if (last.location) setLocation(last.location);
      if (last.radius) setRadius(last.radius);
    })();
  }, []);

  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => {
      setLoadingLine(LOADING_LINES[Math.floor(Math.random() * LOADING_LINES.length)]);
    }, 1800);
    return () => clearInterval(t);
  }, [loading]);

  const run = useCallback(
    async (query: string, fromCursor: number, coords?: { lat: number; lng: number }) => {
      setLoading(true);
      setError('');
      setExpression('thinking');
      setShowFavorites(false);
      if (fromCursor === 0) setRestaurants([]);

      try {
        const res = await searchRestaurants(query, cuisine, radius, fromCursor, coords);
        if (res.restaurants.length === 0) {
          setExpression('sad');
          setError(
            cuisine !== 'Any'
              ? `No ${cuisine.toLowerCase()} spots turned up near ${res.place || query}. Try a wider radius or a different craving.`
              : `Came up empty around ${res.place || query}. The map service may be busy — give it another go.`
          );
          setRestaurants([]);
        } else {
          setRestaurants(res.restaurants);
          setPlace(res.place);
          setAttribution(res.attribution);
          setCursor(res.cursor);
          setExhausted(res.exhausted);
          setExpression('happy');
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
        await saveLastSearch(coords ? '' : query, radius);
      } catch (e) {
        setExpression('sad');
        setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
        setRestaurants([]);
      } finally {
        setLoading(false);
      }
    },
    [cuisine, radius]
  );

  const handleSearch = () => {
    const q = location.trim();
    if (!q) {
      setError('Tell us where you are first.');
      setExpression('surprised');
      return;
    }
    coordsRef.current = undefined;
    setCursor(0);
    setExhausted(false);
    run(q, 0);
  };

  const handleUseMyLocation = async () => {
    try {
      Haptics.selectionAsync().catch(() => {});
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Location is off',
          'No problem — type a city or zip instead. You can enable location later in Settings.'
        );
        return;
      }
      setLoading(true);
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      coordsRef.current = coords;
      setLocation('My location');
      setCursor(0);
      setExhausted(false);
      await run('My location', 0, coords);
    } catch {
      setLoading(false);
      setError("Couldn't get your location. Type a city instead.");
    }
  };

  const handleSpinAgain = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const q = coordsRef.current ? 'My location' : location.trim();
    run(q, cursor, coordsRef.current);
  };

  const openMaps = async (r: Restaurant) => {
    // Key-free deep links. Android gets a geo: intent so the user's preferred
    // nav app can handle it; iOS opens Apple Maps.
    const primary =
      Platform.OS === 'ios'
        ? r.appleMapsUrl
        : `geo:0,0?q=${encodeURIComponent(r.address ? `${r.name} ${r.address}` : r.name)}`;
    try {
      const ok = await Linking.canOpenURL(primary);
      await Linking.openURL(ok ? primary : r.mapsUrl);
    } catch {
      Linking.openURL(r.mapsUrl).catch(() => {});
    }
  };

  const handlePick = async (r: Restaurant) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    if (!picked[r.id]) {
      setPicked(prev => ({ ...prev, [r.id]: true }));
      await markPicked(r.id);
      const count = await recordPick(r);
      if (count !== null) {
        setRestaurants(prev => prev.map(x => (x.id === r.id ? { ...x, pickCount: count } : x)));
      }
    }
    openMaps(r);
  };

  const handleShare = async (r: Restaurant) => {
    const where = r.address ? ` (${r.address})` : '';
    try {
      await Share.share({
        message: `We're going to ${r.name}${where}. No, YOU Pick! picked it.\n${r.mapsUrl}`,
        title: r.name,
      });
    } catch { /* user dismissed */ }
  };

  const handleToggleFavorite = async (r: Restaurant) => {
    Haptics.selectionAsync().catch(() => {});
    setFavorites(await toggleFavorite(r));
  };

  const isFavorite = (r: Restaurant) => favorites.some(f => f.id === r.id);

  const renderCard = (r: Restaurant, index: number) => {
    const hours = hoursClaim(r.reason);
    return (
      <View key={r.id} style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={styles.cardIndex}>#{index + 1}</Text>
          <View style={styles.cardTopRight}>
            <TouchableOpacity
              onPress={() => handleToggleFavorite(r)}
              hitSlop={10}
              accessibilityLabel={isFavorite(r) ? `Remove ${r.name} from favorites` : `Save ${r.name} to favorites`}
            >
              <Text style={styles.iconBtn}>{isFavorite(r) ? '★' : '☆'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleShare(r)} hitSlop={10} accessibilityLabel={`Share ${r.name}`}>
              <Text style={styles.iconBtn}>⤴</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.cardName}>{r.name}</Text>

        <View style={styles.chipRow}>
          <View style={styles.chip}>
            <Text style={styles.chipText}>{r.cuisine}</Text>
          </View>
          <View style={[styles.chip, styles.chipDistance]}>
            <Text style={styles.chipText}>
              {r.distanceMi < 0.2 ? 'Right here' : `${r.distanceMi} mi`}
            </Text>
          </View>
          {hours ? (
            <View style={[styles.chip, styles.chipHours]}>
              <Text style={styles.chipText}>{hours}</Text>
            </View>
          ) : null}
        </View>

        {r.address ? <Text style={styles.cardAddress}>{r.address}</Text> : null}
        <Text style={styles.cardReason}>{r.reason}</Text>

        <View style={styles.cardBottom}>
          <Text style={styles.pickCount}>
            {r.pickCount} {r.pickCount === 1 ? 'pick' : 'picks'}
          </Text>
          <TouchableOpacity style={styles.goBtn} onPress={() => handlePick(r)} accessibilityRole="button">
            <Text style={styles.goBtnText}>{picked[r.id] ? 'Directions' : "Let's go"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const shown = showFavorites ? favorites : restaurants;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Mascot expression={loading ? 'thinking' : expression} size={104} />
          <Text style={styles.title}>No, YOU Pick!</Text>
          <Text style={styles.subtitle}>Three real spots. Stop arguing.</Text>
        </View>

        {!showFavorites && (
          <View style={styles.form}>
            <Text style={styles.label}>Where are you?</Text>
            <View style={styles.locationRow}>
              <TextInput
                style={styles.input}
                placeholder="City, address, or zip"
                placeholderTextColor="#6b7280"
                value={location}
                onChangeText={t => {
                  setLocation(t);
                  coordsRef.current = undefined;
                }}
                returnKeyType="search"
                onSubmitEditing={handleSearch}
                autoCorrect={false}
              />
              <TouchableOpacity
                style={styles.gpsBtn}
                onPress={handleUseMyLocation}
                accessibilityLabel="Use my current location"
              >
                <Text style={styles.gpsBtnText}>◎</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>What are you craving?</Text>
            <TouchableOpacity style={styles.dropdown} onPress={() => setShowCuisines(v => !v)}>
              <Text style={styles.dropdownText}>{cuisine}</Text>
              <Text style={styles.dropdownArrow}>{showCuisines ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {showCuisines && (
              <View style={styles.cuisineList}>
                {CUISINES.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.cuisineItem, cuisine === c && styles.cuisineItemActive]}
                    onPress={() => {
                      setCuisine(c);
                      setShowCuisines(false);
                    }}
                  >
                    <Text style={[styles.cuisineText, cuisine === c && styles.cuisineTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={styles.label}>How far?</Text>
            <View style={styles.radiusRow}>
              {RADII.map(r => (
                <TouchableOpacity
                  key={r.value}
                  style={[styles.radiusBtn, radius === r.value && styles.radiusBtnActive]}
                  onPress={() => setRadius(r.value)}
                >
                  <Text style={[styles.radiusLabel, radius === r.value && styles.radiusLabelActive]}>{r.label}</Text>
                  <Text style={[styles.radiusSub, radius === r.value && styles.radiusLabelActive]}>{r.sub}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.searchBtn, loading && styles.searchBtnDisabled]}
              onPress={handleSearch}
              disabled={loading}
              accessibilityRole="button"
            >
              {loading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.searchBtnText}>  {loadingLine}</Text>
                </View>
              ) : (
                <Text style={styles.searchBtnText}>No, YOU Pick!</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {favorites.length > 0 && (
          <TouchableOpacity style={styles.favToggle} onPress={() => setShowFavorites(v => !v)}>
            <Text style={styles.favToggleText}>
              {showFavorites ? '← Back to picking' : `★ Saved (${favorites.length})`}
            </Text>
          </TouchableOpacity>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {shown.length > 0 && (
          <View style={styles.results}>
            <Text style={styles.resultsTitle}>
              {showFavorites ? 'Saved spots' : place ? `Near ${place}` : 'Your picks'}
            </Text>
            {shown.map(renderCard)}

            {!showFavorites && (
              <>
                <TouchableOpacity style={styles.againBtn} onPress={handleSpinAgain} disabled={loading}>
                  <Text style={styles.againBtnText}>Nope, spin again</Text>
                </TouchableOpacity>
                {exhausted && (
                  <Text style={styles.exhausted}>
                    That's everywhere within {radius} miles. Widen the radius for more.
                  </Text>
                )}
              </>
            )}
          </View>
        )}

        {showFavorites && favorites.length === 0 && (
          <Text style={styles.empty}>No saved spots yet. Tap ☆ on a card to keep it.</Text>
        )}

        {attribution ? <Text style={styles.attribution}>{attribution}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  scroll: { padding: 20, paddingBottom: 48 },
  header: { alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 32, fontWeight: '900', color: '#fff', marginTop: 4 },
  subtitle: { fontSize: 14, color: '#9ca3af', marginTop: 4 },

  form: { backgroundColor: '#16213e', borderRadius: 18, padding: 18 },
  label: { color: '#9ca3af', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 10 },

  locationRow: { flexDirection: 'row', gap: 10 },
  input: { flex: 1, backgroundColor: '#0f172a', color: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16 },
  gpsBtn: { width: 52, backgroundColor: '#0f172a', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  gpsBtnText: { color: '#e94560', fontSize: 22, fontWeight: '700' },

  dropdown: { backgroundColor: '#0f172a', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dropdownText: { color: '#fff', fontSize: 16 },
  dropdownArrow: { color: '#6b7280', fontSize: 12 },
  cuisineList: { backgroundColor: '#0f172a', borderRadius: 12, marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', padding: 6 },
  cuisineItem: { paddingHorizontal: 12, paddingVertical: 8, margin: 4, borderRadius: 999, backgroundColor: '#1f2937' },
  cuisineItemActive: { backgroundColor: '#e94560' },
  cuisineText: { color: '#d1d5db', fontSize: 13, fontWeight: '600' },
  cuisineTextActive: { color: '#fff' },

  radiusRow: { flexDirection: 'row', gap: 8 },
  radiusBtn: { flex: 1, backgroundColor: '#0f172a', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  radiusBtnActive: { backgroundColor: '#e94560' },
  radiusLabel: { color: '#d1d5db', fontWeight: '700', fontSize: 13 },
  radiusLabelActive: { color: '#fff' },
  radiusSub: { color: '#6b7280', fontSize: 11, marginTop: 2 },

  searchBtn: { backgroundColor: '#e94560', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 18 },
  searchBtnDisabled: { opacity: 0.75 },
  searchBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  loadingRow: { flexDirection: 'row', alignItems: 'center' },

  favToggle: { alignSelf: 'center', marginTop: 16 },
  favToggleText: { color: '#e94560', fontWeight: '700' },

  error: { color: '#fca5a5', backgroundColor: '#3f1d2b', padding: 14, borderRadius: 12, marginTop: 16, lineHeight: 20 },

  results: { marginTop: 22 },
  resultsTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 12 },

  card: { backgroundColor: '#16213e', borderRadius: 18, padding: 16, marginBottom: 14 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTopRight: { flexDirection: 'row', gap: 16 },
  cardIndex: { color: '#6b7280', fontWeight: '800' },
  iconBtn: { color: '#e94560', fontSize: 20 },
  cardName: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { backgroundColor: '#0f172a', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  chipDistance: { backgroundColor: '#12304a' },
  chipHours: { backgroundColor: '#123a2a' },
  chipText: { color: '#d1d5db', fontSize: 12, fontWeight: '700' },
  cardAddress: { color: '#9ca3af', fontSize: 13, marginTop: 10 },
  cardReason: { color: '#e5e7eb', fontSize: 15, marginTop: 8, lineHeight: 21 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  pickCount: { color: '#6b7280', fontSize: 12, fontWeight: '700' },
  goBtn: { backgroundColor: '#e94560', paddingHorizontal: 20, paddingVertical: 11, borderRadius: 12 },
  goBtnText: { color: '#fff', fontWeight: '800' },

  againBtn: { borderColor: '#e94560', borderWidth: 2, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  againBtnText: { color: '#e94560', fontWeight: '800', fontSize: 15 },
  exhausted: { color: '#9ca3af', fontSize: 13, textAlign: 'center', marginTop: 12 },

  empty: { color: '#9ca3af', textAlign: 'center', marginTop: 28 },
  attribution: { color: '#4b5563', fontSize: 11, textAlign: 'center', marginTop: 28, lineHeight: 16 },
});
