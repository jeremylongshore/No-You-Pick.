
import React, { useState, useEffect } from 'react';
import { Restaurant } from '../types';
import { Button } from './Button';
import { recordPick } from '../services/pickService';

interface CardProps {
  restaurant: Restaurant;
  index: number;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onShare: (restaurant: Restaurant, count: number) => void;
  className?: string;
}

// Helper to get gradient based on cuisine
const getGradient = (cuisine: string) => {
  const c = (cuisine || '').toLowerCase();
  if (c.includes('pizza') || c.includes('italian')) return 'from-red-500 to-orange-500';
  if (c.includes('asian') || c.includes('sushi') || c.includes('thai')) return 'from-red-500 to-pink-600';
  if (c.includes('green') || c.includes('vegan') || c.includes('salad')) return 'from-green-400 to-emerald-600';
  if (c.includes('burger') || c.includes('fast')) return 'from-yellow-400 to-orange-500';
  if (c.includes('mexican') || c.includes('taco')) return 'from-amber-400 to-red-500';
  // Default Variety/Teal
  return 'from-teal-500 to-emerald-500';
};

export const Card: React.FC<CardProps> = ({ restaurant, index, isFavorite, onToggleFavorite, onShare, className = '' }) => {
  const [pickCount, setPickCount] = useState<number>(restaurant.pickCount ?? 0);
  const [hasPicked, setHasPicked] = useState(false);

  useEffect(() => {
    setPickCount(restaurant.pickCount ?? 0);
    try {
      const pickedStorage = localStorage.getItem('food_roulette_picks');
      const picks = pickedStorage ? JSON.parse(pickedStorage) : {};
      setHasPicked(Boolean(picks[restaurant.id]));
    } catch (e) {}
  }, [restaurant.id, restaurant.pickCount]);

  const handlePick = async () => {
    if (hasPicked) return;

    // Optimistic UI update
    setPickCount(prev => prev + 1);
    setHasPicked(true);

    try {
      const pickedStorage = localStorage.getItem('food_roulette_picks');
      const picks = pickedStorage ? JSON.parse(pickedStorage) : {};
      picks[restaurant.id] = true;
      localStorage.setItem('food_roulette_picks', JSON.stringify(picks));
    } catch (e) {
      console.error("Failed to save pick", e);
    }

    const serverCount = await recordPick(restaurant);
    if (serverCount !== null) setPickCount(serverCount);
    
    // Slight delay before opening map
    if (restaurant.mapsUrl) {
      setTimeout(() => {
         window.open(restaurant.mapsUrl, '_blank');
      }, 500); 
    }
  };

  // Derived from the reason string, which is built server-side only from real
  // opening_hours data. When hours are unknown we say nothing rather than guess.
  const hoursClaim = (restaurant.reason.match(/Open (?:till [^.]+|24\/7|till midnight)/) || [])[0] || '';

  return (
    <div 
      className={`bg-white rounded-3xl shadow-xl shadow-slate-200/60 overflow-hidden flex flex-col h-full border border-slate-100 relative group transition-all duration-300 hover:shadow-2xl hover:shadow-slate-300/60 hover:-translate-y-1 ${className}`}
    >
      {/* Header Background */}
      <div className={`h-24 bg-gradient-to-r ${getGradient(restaurant.cuisine)} relative p-4 flex justify-between items-start shrink-0`}>
         <div className="bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold shadow-sm text-gray-800 uppercase tracking-wide">
            {restaurant.cuisine}
         </div>
         
         <div className="flex gap-2">
            {/* Share Button */}
            <button 
              onClick={(e) => { e.stopPropagation(); onShare(restaurant, pickCount); }}
              className="p-2 rounded-full bg-white/30 text-white hover:bg-white hover:text-indigo-600 shadow-sm transition-all duration-200 hover:scale-110 active:scale-95"
              title="Share Result"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"></path></svg>
            </button>

            {/* Favorite Button */}
            <button 
              onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
              className={`p-2 rounded-full shadow-sm transition-all duration-200 hover:scale-110 active:scale-95 ${
                isFavorite 
                  ? 'bg-white text-red-500' 
                  : 'bg-white/30 text-white hover:bg-white hover:text-red-500'
              }`}
            >
              <svg className="w-5 h-5" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
              </svg>
            </button>
         </div>
      </div>

      {/* Content */}
      <div className="p-6 pt-2 flex-1 flex flex-col -mt-10 relative z-10">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-50 mb-2">
           <div className="flex justify-between items-start gap-2 mb-2">
             <h3 className="text-xl font-black text-slate-800 leading-tight break-words">
               {restaurant.name}
             </h3>
           </div>
           
           {/* Info Row: distance + hours. Both are real or absent — nothing is guessed. */}
           <div className="flex flex-wrap items-center gap-2 mb-2">
             <div className="flex items-center gap-1 bg-sky-50 px-2 py-1 rounded-lg border border-sky-100 shrink-0">
                 <span className="text-sky-500 text-xs">📍</span>
                 <span className="text-xs font-bold text-slate-700">
                   {restaurant.distanceMi < 0.2 ? 'Right here' : `${restaurant.distanceMi} mi`}
                 </span>
             </div>
             {hoursClaim && (
               <div className="px-2 py-1 rounded-lg border text-xs font-bold shrink-0 bg-green-50 border-green-100 text-green-700">
                 {hoursClaim}
               </div>
             )}
           </div>

           <div className="text-slate-400 text-xs mt-1 flex items-center gap-1">
              <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
              <a 
                href={restaurant.mapsUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="truncate hover:text-sky-600 hover:underline cursor-pointer transition-colors"
                title="View on Maps"
              >
                {restaurant.address || 'Open in Maps'}
              </a>
           </div>
        </div>
        
        <p className="text-slate-600 text-sm mb-6 leading-relaxed px-1">
          "{restaurant.reason}"
        </p>

        <div className="mt-auto">
          {/* Separator */}
          <div className="h-px bg-slate-100 my-4 w-full"></div>

          {/* Community Intent — first-party pick counts, keyed on the stable place id. */}
          <div className="mb-4 px-1">
             <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-2">Community Intent</div>
             <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg text-sm font-bold shadow-sm border border-emerald-100/50">
                <span className="text-emerald-500">👍</span>
                {pickCount.toLocaleString()} {pickCount === 1 ? 'Pick' : 'Picks'}
             </div>
          </div>
          
          <div className="space-y-3">
             {/* Primary Action */}
             <button 
                onClick={handlePick}
                disabled={hasPicked}
                className={`w-full py-3 px-4 rounded-xl font-bold text-sm transition-all duration-300 flex items-center justify-center gap-2 transform active:scale-95 shadow-md shadow-indigo-200/50 ${
                   hasPicked 
                    ? 'bg-green-600 text-white border-transparent cursor-default' 
                    : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:-translate-y-0.5'
                }`}
             >
                {hasPicked ? (
                   <>You Picked This! 🎉</>
                ) : (
                   <>I Pick This One!</>
                )}
             </button>

             {/* Secondary Action: Get Directions with Pin */}
             <a 
                href={restaurant.mapsUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="block w-full"
             >
               <button 
                  className="w-full py-3 px-4 rounded-xl font-bold text-sm transition-all duration-300 flex items-center justify-center gap-2 bg-white text-indigo-600 border border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50 active:scale-95"
               >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
                  </svg>
                  Get Directions
               </button>
             </a>
          </div>
        </div>
      </div>
    </div>
  );
};
