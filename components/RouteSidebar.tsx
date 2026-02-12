
import React, { useState } from 'react';
import { JeepneyRoute } from '../types';

interface RouteSidebarProps {
  routes: JeepneyRoute[];
  totalRoutesCount: number;
  activeRoute: JeepneyRoute | null;
  onSelectRoute: (route: JeepneyRoute) => void;
  onAddRouteClick: () => void;
  isAddingRoute: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onClearFilter: () => void;
  isFiltered: boolean;
}

const JeepneyIcon = (props: { className?: string }) => (
  <svg className={props.className || "w-6 h-6"} fill="currentColor" viewBox="0 0 24 24">
    <path d="M4,16c0,0.88,0.39,1.67,1,2.22V20a1,1,0,0,0,1,1H7a1,1,0,0,0,1-1V19h8v1a1,1,0,0,0,1,1h1a1,1,0,0,0,1-1V18.22c0.61-0.55,1-1.34,1-2.22V6 c0-1.52-1.03-2.74-2.42-3.1L12,2L6.42,2.9C5.03,3.26,4,4.48,4,6V16z M18,11H6V6h12V11z M16.5,17A1.5,1.5,0,1,1,18,15.5A1.5,1.5,0,0,1,16.5,17 z M7.5,17A1.5,1.5,0,1,1,9,15.5A1.5,1.5,0,0,1,7.5,17z" />
  </svg>
);

const RouteSidebar: React.FC<RouteSidebarProps> = ({ 
  routes, activeRoute, onSelectRoute, onAddRouteClick, 
  isOpen, onToggle, onClearFilter, isFiltered, isAddingRoute
}) => {
  const [query, setQuery] = useState('');

  const filtered = routes.filter(r => 
    r.name.toLowerCase().includes(query.toLowerCase()) ||
    r.author.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <>
      {/* Menu Button - Only show if NOT adding a route */}
      {!isAddingRoute && (
        <button 
          onClick={onToggle}
          className={`lg:hidden fixed top-4 right-4 z-[2001] bg-indigo-900 text-white p-3.5 rounded-2xl shadow-2xl active:scale-90 transition-all ${
            isOpen ? 'bg-red-600' : ''
          }`}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d={isOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
          </svg>
        </button>
      )}

      <aside className={`fixed lg:static inset-y-0 left-0 w-80 bg-white border-r flex flex-col z-[2000] sidebar-transition shadow-2xl lg:shadow-none ${
        isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}>
        <header className="p-6 bg-indigo-950 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-400 rounded-lg flex items-center justify-center text-indigo-950 shadow-lg">
              <JeepneyIcon />
            </div>
            <div>
              <h1 className="text-xl font-black italic tracking-tighter uppercase">Open Route</h1>
              <p className="text-[9px] font-bold text-yellow-400 uppercase tracking-widest">Commuter Hub</p>
            </div>
          </div>
        </header>

        <section className="p-4 space-y-4 bg-slate-100 border-b">
          <div className="relative group">
            <input 
              placeholder="Search routes or streets..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border-2 border-slate-300 rounded-2xl text-sm font-bold text-indigo-950 placeholder:text-slate-400 focus:border-indigo-600 transition-all outline-none"
            />
            <svg className="w-4 h-4 absolute left-4 top-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </div>

          {isFiltered && (
            <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-xl flex items-center justify-between animate-in fade-in slide-in-from-top-2">
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-indigo-900/50 uppercase tracking-widest">Map Selection Active</span>
                <span className="text-xs font-bold text-indigo-900">{filtered.length} routes found here</span>
              </div>
              <button 
                onClick={onClearFilter} 
                className="bg-indigo-600 text-white p-1.5 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </section>

        <nav className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
          {filtered.map(route => (
            <div 
              key={route.id}
              onClick={() => onSelectRoute(route)}
              className={`group p-4 bg-white rounded-2xl border-2 transition-all cursor-pointer hover:shadow-lg active:scale-95 ${
                activeRoute?.id === route.id ? 'border-indigo-600 bg-indigo-50/30 shadow-md' : 'border-slate-100'
              }`}
            >
              <div className="flex justify-between items-start mb-1">
                <h3 className="font-black text-indigo-950 text-sm tracking-tight truncate flex-1 uppercase italic">{route.name}</h3>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ml-2 ${route.score >= 0 ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50'}`}>
                  {route.score > 0 ? `+${route.score}` : route.score}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 font-bold italic">By {route.author}</p>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-10 px-6">
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">No routes found.</p>
              {isFiltered && (
                <button onClick={onClearFilter} className="mt-4 text-[10px] font-black text-indigo-600 uppercase border-b-2 border-indigo-600 pb-0.5">Show all routes</button>
              )}
            </div>
          )}
        </nav>

        <footer className="p-4 border-t bg-white">
          <button 
            onClick={onAddRouteClick} 
            className="w-full bg-indigo-950 text-white font-black py-4 rounded-2xl text-[10px] uppercase tracking-widest shadow-xl hover:bg-black transition-all flex items-center justify-center gap-2"
          >
            <JeepneyIcon className="w-4 h-4" />
            + Add New Route
          </button>
        </footer>
      </aside>
    </>
  );
};

export default RouteSidebar;
