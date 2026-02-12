
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
      {/* QA FIX: Hide menu button when a route is active to prevent overlap with 'X' button */}
      {!isAddingRoute && !activeRoute && (
        <button 
          onClick={onToggle}
          className={`lg:hidden fixed top-3 right-3 z-[2001] bg-indigo-950 text-white p-3 rounded-2xl shadow-2xl active:scale-90 transition-all ${
            isOpen ? 'bg-rose-600' : ''
          }`}
          aria-label="Toggle menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d={isOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
          </svg>
        </button>
      )}

      <aside className={`fixed lg:static inset-y-0 left-0 w-72 bg-white border-r flex flex-col z-[2000] sidebar-transition shadow-2xl lg:shadow-none ${
        isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}>
        <header className="p-4 bg-indigo-950 text-white">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-yellow-400 rounded-lg flex items-center justify-center text-indigo-950 shadow-md">
              <JeepneyIcon className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-black italic tracking-tighter uppercase leading-none">Open Route</h1>
              <p className="text-[8px] font-bold text-yellow-400 uppercase tracking-widest mt-1">Philippine Transit Hub</p>
            </div>
          </div>
        </header>

        <section className="p-3 space-y-3 bg-slate-100 border-b">
          <div className="relative">
            <input 
              placeholder="Search routes (e.g. Faura)"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-indigo-950 outline-none focus:border-indigo-600 transition-all shadow-sm"
            />
            <svg className="w-3.5 h-3.5 absolute left-3 top-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </div>

          {isFiltered && (
            <div className="bg-indigo-50 border border-indigo-100 p-2 rounded-lg flex items-center justify-between">
              <span className="text-[10px] font-bold text-indigo-900">{filtered.length} near location</span>
              <button 
                onClick={onClearFilter} 
                className="bg-indigo-600 text-white p-1 rounded-md shadow-sm active:scale-95"
                title="Clear filter"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          )}
        </section>

        <nav className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-hide">
          <h2 className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">Available Routes</h2>
          {filtered.map(route => (
            <div 
              key={route.id}
              onClick={() => onSelectRoute(route)}
              className={`group p-3 bg-white rounded-xl border transition-all cursor-pointer hover:shadow-md active:scale-95 ${
                activeRoute?.id === route.id ? 'border-indigo-600 bg-indigo-50/50' : 'border-slate-100'
              }`}
            >
              <div className="flex justify-between items-start">
                <h3 className="font-placard text-indigo-950 text-xs uppercase italic truncate pr-2">{route.name}</h3>
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ml-auto flex-shrink-0 ${route.score >= 0 ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50'}`}>
                  {route.score > 0 ? `+${route.score}` : route.score}
                </span>
              </div>
              <p className="text-[9px] text-slate-400 font-bold italic mt-1">Contributor: {route.author}</p>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-[10px] text-slate-400 font-bold uppercase tracking-widest">No routes found</div>
          )}
        </nav>

        <footer className="p-3 border-t bg-white">
          <button 
            onClick={onAddRouteClick} 
            className="w-full bg-indigo-950 text-white font-black py-3 rounded-xl text-[9px] uppercase tracking-widest shadow-lg hover:bg-black transition-all flex items-center justify-center gap-2"
          >
            <JeepneyIcon className="w-3.5 h-3.5" />
            + Contribute Route
          </button>
        </footer>
      </aside>
    </>
  );
};

export default RouteSidebar;
