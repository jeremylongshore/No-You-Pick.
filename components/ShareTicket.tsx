
import React, { forwardRef } from 'react';
import { Restaurant } from '../types';
import { Mascot } from './Mascot';

interface ShareTicketProps {
  restaurant: Restaurant;
  pickCount: number;
}

export const ShareTicket = forwardRef<HTMLDivElement, ShareTicketProps>(({ restaurant, pickCount }, ref) => {
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div ref={ref} className="w-[350px] bg-[#fffbf0] rounded-3xl overflow-hidden shadow-2xl relative border-8 border-slate-900 text-slate-900 font-sans">
      {/* Top Section (Mascot) */}
      <div className="bg-orange-500 p-6 flex justify-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
        <Mascot expression="happy" className="w-24 h-24 relative z-10 drop-shadow-lg" />
      </div>

      {/* Jagged Line (Ticket Tear) */}
      <div className="h-4 bg-[#fffbf0] relative -mt-2">
        <svg className="absolute w-full h-3 -top-3 left-0 text-[#fffbf0]" viewBox="0 0 100 10" preserveAspectRatio="none">
          <polygon points="0,10 5,0 10,10 15,0 20,10 25,0 30,10 35,0 40,10 45,0 50,10 55,0 60,10 65,0 70,10 75,0 80,10 85,0 90,10 95,0 100,10 100,10 0,10" fill="currentColor" />
        </svg>
      </div>

      {/* Content */}
      <div className="p-6 text-center">
        <div className="uppercase tracking-widest text-[10px] font-bold text-slate-400 mb-2">OFFICIAL SELECTION</div>
        <h2 className="text-3xl font-black leading-none mb-2">{restaurant.name}</h2>
        <p className="text-orange-600 font-bold text-sm uppercase mb-6">{restaurant.cuisine}</p>

        <div className="border-t-2 border-dashed border-slate-200 my-4"></div>

        <div className="flex justify-between items-end mb-4">
           <div className="text-left">
              <div className="text-[10px] text-slate-400 font-bold">RATING</div>
              <div className="text-xl font-bold">📍 {restaurant.distanceMi} mi</div>
           </div>
           <div className="text-right">
              <div className="text-[10px] text-slate-400 font-bold">COMMUNITY</div>
              <div className="text-xl font-bold text-emerald-600">👍 {pickCount}</div>
           </div>
        </div>

        <div className="bg-slate-100 rounded-xl p-3 text-xs text-slate-500 font-mono text-left">
           <div className="flex justify-between mb-1">
             <span>DATE:</span>
             <span className="font-bold text-slate-800">{date}</span>
           </div>
           <div className="flex justify-between">
             <span>APP:</span>
             <span className="font-bold text-slate-800">No, You Pick!</span>
           </div>
        </div>
      </div>

      {/* Bottom Footer */}
      <div className="bg-slate-900 text-white p-3 text-center text-[10px] font-bold tracking-widest">
        THE ARGUMENT ENDER
      </div>
    </div>
  );
});

ShareTicket.displayName = 'ShareTicket';
