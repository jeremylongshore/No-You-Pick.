
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { getRandomRestaurants } from './services/pickService';
import { Restaurant, AppStatus, GeoLocation } from './types';
import { Button } from './components/Button';
import { SlotMachine } from './components/SlotMachine';
import { Card } from './components/Card';
import { Mascot } from './components/Mascot';
import { ShareTicket } from './components/ShareTicket';
import html2canvas from 'html2canvas';

const CUISINE_OPTIONS = [
  { label: "Any", icon: "🎲" },
  { label: "Pizza", icon: "🍕" },
  { label: "Mexican", icon: "🌮" },
  { label: "Sushi", icon: "🍣" },
  { label: "Burgers", icon: "🍔" },
  { label: "Asian", icon: "🥡" },
  { label: "Italian", icon: "🍝" },
  { label: "Steak", icon: "🥩" },
  { label: "Veggie", icon: "🥦" },
  { label: "Vegan", icon: "🌱" },
  { label: "Healthy", icon: "🥗" },
  { label: "Coffee", icon: "☕" },
  { label: "Dessert", icon: "🍩" },
  { label: "Chicken", icon: "🍗" },
  { label: "Indian", icon: "🍛" },
  { label: "Thai", icon: "🥘" },
];

// Added "Trip (30mi)" option to handle the request for >15 miles
const RADIUS_OPTIONS = [
  { value: "1", label: "Walk (1mi)" },
  { value: "5", label: "Drive (5mi)" },
  { value: "15", label: "Far (15mi)" },
  { value: "30", label: "Trip (30mi)" },
];

const getRandomSuccessMessage = () => {
  const funMessages = [
    "Bon Appétit! 👨‍🍳",
    "Dig In! 😋",
    "Problem Solved! ✅",
    "Feast Mode: ON 🚀",
    "Winner Winner! 🍗",
    "Your Table Awaits 🪑",
    "No More Arguing! 🤝",
    "Let's Eat! 🍴",
    "Great Choice! 🌟",
    "Yum Time! 🤤",
    "Time to Feast! 🍽️",
    "Enjoy your meal! 🥘"
  ];
  
  return funMessages[Math.floor(Math.random() * funMessages.length)];
};

export function App() {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [isSpinning, setIsSpinning] = useState(false); 
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [savedRestaurants, setSavedRestaurants] = useState<Restaurant[]>([]);
  const [locationInput, setLocationInput] = useState('');
  const [selectedCuisine, setSelectedCuisine] = useState('Any');
  const [customCuisine, setCustomCuisine] = useState('');
  const [lastLocation, setLastLocation] = useState<{query: string, coords?: GeoLocation} | null>(null);
  // Cursor into the server's seeded permutation. Replaces the old excludeNames
  // list, which grew by 3 names on every spin and was fed back into the prompt.
  const [cursor, setCursor] = useState<number>(0);
  const [exhausted, setExhausted] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showFavorites, setShowFavorites] = useState(false);
  const [radius, setRadius] = useState('15'); // Default remains 15mi
  const [isLocationFocused, setIsLocationFocused] = useState(false);
  const [successMessage, setSuccessMessage] = useState("Bon Appétit!");
  const locationInputRef = useRef<HTMLInputElement>(null);

  // Sharing State
  const [sharingRestaurant, setSharingRestaurant] = useState<{data: Restaurant, count: number} | null>(null);
  const ticketRef = useRef<HTMLDivElement>(null);
  const [isGeneratingShare, setIsGeneratingShare] = useState(false);

  // Scroll State for Smart Header
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);
  const lastScrollY = useRef(0);

  // Load persisted state on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('food_roulette_favorites');
      if (saved) {
        setSavedRestaurants(JSON.parse(saved));
      }
      const savedRadius = localStorage.getItem('food_roulette_radius');
      if (savedRadius && RADIUS_OPTIONS.some(opt => opt.value === savedRadius)) {
        setRadius(savedRadius);
      }
      const savedLocation = localStorage.getItem('food_roulette_location');
      // Fix: Don't auto-fill "Current Location" to keep the UI clean as requested.
      if (savedLocation && savedLocation !== "Current Location" && savedLocation !== "current location") {
         setLocationInput(savedLocation);
      }
    } catch (e) {
      console.warn("Failed to load saved state", e);
    }
  }, []);

  // Handle Scroll Logic
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const isScrollingDown = currentScrollY > lastScrollY.current;
      
      // Hide header if scrolling down and not at very top (>50px)
      if (currentScrollY > 50 && isScrollingDown) {
        setIsHeaderHidden(true);
      } else {
        setIsHeaderHidden(false);
      }

      setHasScrolled(currentScrollY > 20);
      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const toggleFavorite = (restaurant: Restaurant) => {
    setSavedRestaurants(prev => {
      const exists = prev.find(r => r.name === restaurant.name);
      let newList;
      if (exists) {
        newList = prev.filter(r => r.name !== restaurant.name);
      } else {
        newList = [...prev, restaurant];
      }
      localStorage.setItem('food_roulette_favorites', JSON.stringify(newList));
      return newList;
    });
  };

  const handleShare = (restaurant: Restaurant, count: number) => {
    setSharingRestaurant({ data: restaurant, count });
  };

  const confirmShare = async () => {
    if (!ticketRef.current) return;
    setIsGeneratingShare(true);

    try {
      const canvas = await html2canvas(ticketRef.current, {
        backgroundColor: null,
        scale: 2 // High res
      });

      canvas.toBlob(async (blob) => {
        if (!blob) return;

        // Try Native Share API first (Mobile friendly)
        if (navigator.share) {
          try {
            const file = new File([blob], 'my-pick.png', { type: 'image/png' });
            await navigator.share({
              files: [file],
              title: 'No, You Pick!',
              text: `I'm going to ${sharingRestaurant?.data.name}. ${sharingRestaurant?.count} people picked this on No, You Pick!`
            });
            setIsGeneratingShare(false);
            setSharingRestaurant(null); // Close modal on success
            return;
          } catch (e) {
             // Fallback if user cancels or share fails
             console.log("Share API skipped", e);
          }
        }
        
        // Fallback: Download image
        const link = document.createElement('a');
        link.download = `pick-${sharingRestaurant?.data.name.replace(/\s+/g, '-')}.png`;
        link.href = canvas.toDataURL();
        link.click();
        setIsGeneratingShare(false);
        setSharingRestaurant(null);
      });
    } catch (e) {
      console.error("Share failed", e);
      setIsGeneratingShare(false);
    }
  };

  const performSearch = async (query: string, cuisine: string, fromCursor: number, coords?: GeoLocation) => {
    setStatus(AppStatus.LOADING);
    setIsSpinning(true);
    setError(null);
    setShowFavorites(false);
    setRestaurants([]);

    localStorage.setItem('food_roulette_radius', radius);
    if (!coords) {
       localStorage.setItem('food_roulette_location', query);
    }

    try {
      const result = await getRandomRestaurants(query, cuisine, fromCursor, coords, radius);
      
      if (result.restaurants.length === 0) {
        const msg = cuisine && cuisine !== 'Any'
          ? `Couldn't find any "${cuisine}" places nearby.`
          : "Scavenged everywhere but found nothing. Try a wider radius?";
        setError(msg);
        setStatus(AppStatus.ERROR);
        setIsSpinning(false);
      } else {
        setRestaurants(result.restaurants);
        setCursor(result.cursor);
        setExhausted(result.exhausted);
        // CRITICAL FIX: Trigger the SlotMachine to start its "stopping" sequence
        setIsSpinning(false);
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Something went wrong with the search. Please try again.");
      setStatus(AppStatus.ERROR);
      setIsSpinning(false);
    }
  };

  const handleSearch = useCallback(async () => {
    const effectiveQuery = locationInput;
    if (!effectiveQuery) {
      setError("Please tell us where you are first!");
      locationInputRef.current?.focus();
      return;
    }
    setCursor(0);
    setExhausted(false);
    setLastLocation({ query: effectiveQuery });
    const cuisine = customCuisine.trim() || selectedCuisine || "Any";
    await performSearch(effectiveQuery, cuisine, 0, undefined);
  }, [locationInput, selectedCuisine, customCuisine, radius]);

  const handleCuisineSelect = (c: string) => {
    setSelectedCuisine(c);
    setCustomCuisine('');
  };

  const handleGeolocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation not supported.");
      return;
    }
    setStatus(AppStatus.LOADING);
    setIsSpinning(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
        setCursor(0);
        setExhausted(false);
        setLastLocation({ query: "current location", coords });
        const cuisine = customCuisine.trim() || selectedCuisine || "Any";
        performSearch("current location", cuisine, 0, coords);
        setLocationInput("Current Location");
      },
      (err) => {
        setError("Couldn't retrieve your location.");
        setStatus(AppStatus.IDLE);
        setIsSpinning(false);
      }
    );
  };

  const handleReroll = () => {
    if (lastLocation) {
      // Walk further into the same permutation — no repeats until the pool runs out.
      const cuisine = customCuisine.trim() || selectedCuisine || "Any";
      performSearch(lastLocation.query, cuisine, cursor, lastLocation.coords);
    }
  };

  const handleReset = () => {
    setStatus(AppStatus.IDLE);
    setRestaurants([]);
    setIsSpinning(false);
    setError(null);
    setLastLocation(null);
    setCursor(0);
    setExhausted(false);
    setShowFavorites(false);
  };

  const handleAnimationComplete = () => {
    setSuccessMessage(getRandomSuccessMessage());
    setStatus(AppStatus.SUCCESS);
    // Double ensure spinning is off
    setIsSpinning(false);
  };

  return (
    <div className="min-h-screen flex flex-col font-sans text-slate-900 selection:bg-orange-100 relative z-0">
      
      {/* Share Modal */}
      {sharingRestaurant && (
        <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={() => setSharingRestaurant(null)}>
           <div className="flex flex-col items-center" onClick={e => e.stopPropagation()}>
              <div className="bg-white p-2 rounded-[2rem] shadow-2xl mb-6 scale-90 md:scale-100 transform transition-all duration-300">
                  <ShareTicket 
                    ref={ticketRef} 
                    restaurant={sharingRestaurant.data} 
                    pickCount={sharingRestaurant.count} 
                  />
              </div>
              <div className="flex gap-4">
                 <Button onClick={() => setSharingRestaurant(null)} variant="secondary" className="!rounded-xl">Cancel</Button>
                 <Button onClick={confirmShare} variant="hero" className="!text-lg !py-3 !px-8 !rounded-xl !border-0 shadow-lg" disabled={isGeneratingShare}>
                    {isGeneratingShare ? 'Generating...' : 'Share Ticket 🎟️'}
                 </Button>
              </div>
           </div>
        </div>
      )}

      {/* Header - Fixed & Smart Hide */}
      <header className={`
        fixed top-0 left-0 right-0 z-50 transition-all duration-500 ease-in-out transform
        ${isHeaderHidden ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'}
        ${hasScrolled || status !== AppStatus.IDLE ? 'bg-white/80 backdrop-blur-lg border-b border-slate-200/50 shadow-sm py-3' : 'bg-transparent py-4 md:py-6'}
      `}>
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between">
          <div 
            className="flex items-center gap-2 cursor-pointer select-none group" 
            onClick={handleReset}
          >
            {/* Logo Icon */}
            <div className="bg-slate-900 text-white p-2 rounded-lg shadow-lg shadow-slate-900/10 group-hover:scale-105 transition-transform duration-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"></path></svg>
            </div>
            {/* Logo Text */}
            <span className="font-extrabold text-xl tracking-tight text-slate-900 whitespace-nowrap">
              No, You <span className="text-orange-600 underline decoration-2 underline-offset-4 decoration-orange-300/50">Pick</span>
            </span>
          </div>
          
          <button 
             onClick={() => setShowFavorites(!showFavorites)}
             className="relative group p-2 rounded-full hover:bg-white hover:shadow-md transition-all border border-transparent hover:border-slate-100"
           >
             <svg className={`w-6 h-6 transition-colors duration-300 ${showFavorites ? 'fill-red-500 text-red-500' : 'text-slate-500 group-hover:text-red-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>
             {savedRestaurants.length > 0 && !showFavorites && (
               <span className="absolute top-1 right-1 flex h-2.5 w-2.5">
                 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                 <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
               </span>
             )}
           </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 pb-12 flex flex-col relative z-10 pt-24 md:pt-32">
        
        {/* FAVORITES OVERLAY */}
        {showFavorites ? (
          <div className="animate-slide-up w-full pt-4">
            <div className="flex justify-between items-end mb-8">
              <div>
                <h2 className="text-3xl font-black text-slate-800">Your Favorites ❤️</h2>
                <p className="text-slate-500 font-medium">Places worth remembering.</p>
              </div>
              <Button variant="outline" className="!text-slate-500 !border-slate-200 hover:!bg-slate-100" onClick={() => setShowFavorites(false)}>Close</Button>
            </div>
            {savedRestaurants.length === 0 ? (
              <div className="text-center py-20 bg-white/50 backdrop-blur-sm rounded-3xl border-2 border-dashed border-slate-200">
                <div className="text-6xl mb-4 opacity-50">🍱</div>
                <p className="text-slate-800 font-bold text-xl">No favorites yet</p>
                <p className="text-slate-400 mt-2">Tap the heart on any restaurant to save it.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {savedRestaurants.map((r, index) => (
                  <Card 
                    key={r.id || r.name} 
                    restaurant={r} 
                    index={index} 
                    isFavorite={true}
                    onToggleFavorite={() => toggleFavorite(r)}
                    onShare={handleShare}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
             {/* SEARCH FORM */}
             {status === AppStatus.IDLE && (
               <div className="w-full max-w-3xl mx-auto flex flex-col items-center justify-center min-h-[calc(100vh-140px)] md:min-h-[65vh] mt-0 md:-mt-10 animate-fade-in pb-8">
                 
                 {/* Hero Title */}
                 <div className="text-center mb-8 md:mb-12 relative w-full px-4">
                   {/* Mascot - Visible on Mobile inline, Absolute on Desktop */}
                   <div className="relative block md:absolute md:-right-24 md:top-8 z-10 transform -rotate-6 md:-rotate-12 hover:rotate-0 transition-transform duration-500 mb-6 md:mb-0 pointer-events-none md:pointer-events-auto group/mascot">
                      <Mascot expression="happy" className="w-32 h-32 md:w-48 md:h-48 drop-shadow-2xl mx-auto md:mx-0" />
                   </div>
                   
                   <p className="text-orange-600 font-bold tracking-widest uppercase text-sm mb-2 animate-slide-up">The Argument Ender</p>
                   <h1 className="text-6xl md:text-8xl font-black text-slate-900 leading-[1.1] md:leading-[0.9] mb-4 tracking-tighter relative inline-block">
                     No, You <br className="md:hidden" />
                     <span className="relative z-10 text-slate-900">
                        Pick
                        <svg className="absolute w-full h-3 -bottom-1 left-0 text-orange-500 z-[-1] animate-draw" viewBox="0 0 100 10" preserveAspectRatio="none">
                            <path d="M0 5 Q 50 10 100 5" stroke="currentColor" strokeWidth="8" fill="none" opacity="0.3" />
                        </svg>
                     </span>.
                   </h1>
                   <p className="text-slate-500 text-lg md:text-xl font-medium max-w-lg mx-auto leading-relaxed mt-4">
                     Can't decide where to eat? Let <strong className="text-slate-800">Foxie</strong> choose 3 random spots nearby, so you don't have to fight about it.
                   </p>
                 </div>

                 {/* MAIN SEARCH CARD */}
                 <div className="w-full bg-white/80 backdrop-blur-xl rounded-[2.5rem] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.15)] ring-1 ring-white/60 p-3 md:p-5 relative z-20">
                   
                    {/* SECTION 1: CUISINE SELECTOR (Grid Layout) */}
                    <div className="p-2 pb-4">
                         <div className="flex items-center justify-between px-2 mb-3">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">I'm Craving...</label>
                            {selectedCuisine !== "Any" && (
                               <button onClick={() => {setSelectedCuisine('Any'); setCustomCuisine('')}} className="text-xs font-bold text-red-400 hover:text-red-600 transition-colors">Clear</button>
                            )}
                         </div>
                         
                         {/* Grid Container */}
                         <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
                            {CUISINE_OPTIONS.map((c) => (
                              <button
                                key={c.label}
                                onClick={() => handleCuisineSelect(c.label)}
                                className={`
                                  flex flex-col items-center justify-center rounded-2xl transition-all duration-300 border py-3.5 relative overflow-hidden group
                                  ${selectedCuisine === c.label && !customCuisine
                                    ? 'bg-slate-800 border-slate-800 text-white shadow-lg shadow-slate-900/20 scale-105 z-10' 
                                    : 'bg-white border-transparent hover:bg-orange-50 hover:border-orange-100 text-slate-600 hover:text-orange-800'
                                  }
                                `}
                              >
                                <span className="text-2xl mb-1 filter drop-shadow-sm transition-transform group-hover:scale-110 duration-300">{c.icon}</span>
                                <span className="text-[10px] font-bold truncate w-full px-1 text-center opacity-90">{c.label}</span>
                              </button>
                            ))}
                         </div>
                    </div>

                   {/* SECTION 2: UNIFIED SEARCH BAR */}
                   <div className="px-2">
                     <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-100 overflow-hidden relative group-focus-within:ring-4 ring-orange-500/10 transition-all duration-300">
                        
                         {/* Location Input with Prominent 'Near Me' Button */}
                         <div className="flex-[1.4] relative p-3 flex items-center group/loc">
                              <div className="pl-3 pr-3 text-orange-500 shrink-0">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                              </div>
                              
                              <div className="flex-1 mr-2">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 ml-1">Location</label>
                                <div className="relative w-full">
                                  {!locationInput && !isLocationFocused && (
                                     <div className="absolute left-1 top-0 bottom-0 w-[2px] bg-orange-500 animate-custom-blink pointer-events-none h-5 self-center"></div>
                                  )}
                                  <input 
                                    ref={locationInputRef}
                                    type="text"
                                    className="w-full bg-transparent border-none outline-none text-lg font-bold text-slate-800 placeholder-slate-300 p-1 truncate"
                                    placeholder="City, Zip, or Address..."
                                    value={locationInput}
                                    onFocus={() => setIsLocationFocused(true)}
                                    onBlur={() => setIsLocationFocused(false)}
                                    onChange={(e) => setLocationInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                  />
                                </div>
                              </div>
                              
                              {/* DISTINCT "NEAR ME" BUTTON */}
                              <button 
                                onClick={handleGeolocation}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-100 text-orange-700 hover:bg-orange-200 hover:text-orange-800 font-bold text-xs transition-all shrink-0 active:scale-95"
                                title="Use Current Location"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18d6 6 0 100-12 6 6 0 000 12z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 2v2m0 16v2m-8-10H2m18 0h-2"></path></svg>
                                <span>Near Me</span>
                              </button>
                         </div>

                         {/* Craving Input */}
                         <div className="flex-1 relative p-3 flex items-center">
                              <div className="pl-3 pr-3 text-slate-300 shrink-0">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                              </div>
                              <div className="flex-1">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 ml-1">Specific Craving</label>
                                <input
                                  type="text"
                                  placeholder="e.g. Tacos, Outdoor..."
                                  value={customCuisine}
                                  onChange={(e) => { setCustomCuisine(e.target.value); if(e.target.value) setSelectedCuisine(''); }}
                                  className="w-full bg-transparent border-none outline-none text-lg font-bold text-slate-800 placeholder-slate-300 p-1"
                                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                />
                              </div>
                         </div>
                     </div>
                   </div>


                   {/* SECTION 3: BOTTOM ACTIONS */}
                   <div className="p-4 pt-5 flex flex-col md:flex-row items-center gap-4">
                      {/* Radius */}
                      <div className="w-full md:w-auto flex bg-slate-100 p-1.5 rounded-2xl overflow-x-auto hide-scrollbar">
                           {RADIUS_OPTIONS.map((opt) => (
                             <button
                               key={opt.value}
                               onClick={() => setRadius(opt.value)}
                               className={`flex-1 md:flex-none px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 whitespace-nowrap flex-shrink-0 ${radius === opt.value ? 'bg-white text-slate-900 shadow-md transform scale-100' : 'text-slate-400 hover:text-slate-600'}`}
                             >
                               {opt.label}
                             </button>
                           ))}
                      </div>

                      {/* Submit */}
                      <div className="w-full md:flex-1">
                        <Button onClick={handleSearch} variant="hero" fullWidth className="animate-pulse-glow shadow-orange-500/30">
                          Let's Eat!
                        </Button>
                      </div>

                   </div>
                 </div>

                 {error && (
                    <div className="mt-6 flex items-center gap-3 bg-red-50 text-red-600 px-4 py-3 rounded-xl border border-red-100 text-sm font-bold animate-slide-up">
                       <span>⚠️</span> {error}
                    </div>
                 )}

                 {/* Social Proof */}
                 <div className="mt-10 flex items-center justify-center gap-3 opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
                    <span className="flex -space-x-2">
                       <div className="w-8 h-8 rounded-full bg-blue-400 border-2 border-white shadow-sm"></div>
                       <div className="w-8 h-8 rounded-full bg-green-400 border-2 border-white shadow-sm"></div>
                       <div className="w-8 h-8 rounded-full bg-yellow-400 border-2 border-white shadow-sm"></div>
                    </span>
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Trusted by hungry people everywhere</span>
                 </div>

               </div>
             )}
             
             {/* ... Results Logic unchanged ... */}
             {(status === AppStatus.LOADING || isSpinning || status === AppStatus.SUCCESS || status === AppStatus.ERROR) && (
               <div className="w-full max-w-5xl mx-auto pt-6 animate-fade-in">
                  
                  {/* Reuse SlotMachine and Results View */}
                  {(status === AppStatus.LOADING || isSpinning) && (
                    <div className="text-center mb-8">
                         <h2 className="text-3xl font-black text-slate-800 uppercase tracking-wide animate-pulse">
                        {status === AppStatus.LOADING ? "Searching..." : "Results Locked!"}
                        </h2>
                        <p className="text-slate-500 mt-2">Foxie is sniffing out the best {customCuisine || selectedCuisine}...</p>
                        <SlotMachine 
                            spinning={restaurants.length === 0} 
                            restaurants={restaurants}
                            onComplete={handleAnimationComplete}
                            isFavorite={(r) => savedRestaurants.some(s => s.name === r.name)}
                            onToggleFavorite={toggleFavorite}
                            onShare={handleShare}
                        />
                    </div>
                  )}

                  {status === AppStatus.SUCCESS && !isSpinning && (
                     <div className="w-full space-y-8 animate-slide-up">
                        <div className="text-center">
                            <span className="inline-block bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-widest mb-2 border border-green-200">
                            {successMessage}
                            </span>
                            <h2 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight">The Results Are In</h2>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
                            {restaurants.map((r, index) => (
                            <div key={r.id} className="animate-slide-up" style={{ animationDelay: `${index * 150}ms` }}>
                                <Card 
                                restaurant={r} 
                                index={index} 
                                isFavorite={savedRestaurants.some(s => s.name === r.name)}
                                onToggleFavorite={() => toggleFavorite(r)}
                                onShare={handleShare}
                                />
                            </div>
                            ))}
                             {/* Empty Slots Logic */}
                             {[...Array(3 - restaurants.length)].map((_, i) => (
                                <div key={`empty-${i}`} className="bg-slate-100/50 rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center p-8 text-center opacity-70 animate-slide-up">
                                    <div className="text-4xl mb-4 opacity-40">🍽️</div>
                                    <p className="font-bold text-slate-400">No Match</p>
                                </div>
                             ))}
                        </div>

                        {/* NEW DESIGN: CHRIS DO INSPIRED ACTION BAR */}
                        <div className="flex flex-col md:flex-row gap-6 justify-center items-stretch max-w-2xl mx-auto pt-10 pb-24 px-4">
                            {/* Spin Again - Primary Call to Action */}
                            <button 
                                onClick={handleReroll}
                                className="group relative flex-1 min-w-[200px] outline-none"
                            >
                                {/* Hard Shadow */}
                                <div className="absolute inset-0 bg-slate-900 rounded-xl translate-y-3 translate-x-3 transition-transform group-hover:translate-y-4 group-hover:translate-x-4"></div>
                                {/* Button Face */}
                                <div className="relative bg-orange-500 hover:bg-orange-400 h-full min-h-[80px] rounded-xl border-4 border-slate-900 flex items-center justify-center gap-4 transition-transform duration-200 transform group-hover:-translate-y-1 group-hover:-translate-x-1 group-active:translate-y-0 group-active:translate-x-0">
                                    <span className="text-3xl filter drop-shadow-md">🎰</span>
                                    <div className="text-left">
                                        <span className="block font-black text-slate-900 uppercase text-2xl tracking-tighter leading-none">Spin Again</span>
                                        <span className="block font-bold text-white text-[10px] tracking-[0.2em] uppercase leading-none mt-1">Try Your Luck</span>
                                    </div>
                                </div>
                            </button>

                            {/* New Search - Secondary */}
                            <button 
                                onClick={handleReset}
                                className="group relative flex-1 min-w-[200px] outline-none"
                            >
                                 {/* Hard Shadow */}
                                <div className="absolute inset-0 bg-slate-200 rounded-xl translate-y-3 translate-x-3"></div>
                                {/* Button Face */}
                                <div className="relative bg-white hover:bg-slate-50 h-full min-h-[80px] rounded-xl border-4 border-slate-900 flex items-center justify-center gap-3 transition-transform duration-200 transform group-hover:-translate-y-1 group-hover:-translate-x-1 group-active:translate-y-0 group-active:translate-x-0">
                                    <svg className="w-6 h-6 text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                                    <span className="font-black text-slate-900 uppercase text-xl tracking-tight">New Search</span>
                                </div>
                            </button>
                        </div>
                     </div>
                  )}

                  {status === AppStatus.ERROR && (
                    <div className="max-w-md mx-auto text-center py-20">
                        <div className="text-6xl mb-6">😵</div>
                        <h3 className="text-xl font-bold text-slate-800">Oops!</h3>
                        <p className="text-slate-500 mb-6">{error}</p>
                        <Button onClick={handleReset} variant="secondary">Try Again</Button>
                    </div>
                  )}
               </div>
             )}
          </>
        )}
      </main>
    </div>
  );
}
