
import React, { useState, useEffect, useMemo } from 'react';
import JeepneyMap from './components/JeepneyMap';
import RouteSidebar from './components/RouteSidebar';
import { JeepneyRoute, Waypoint, GeminiAnalysis } from './types';
import { ROUTE_COLORS } from './constants';
import { apiService } from './services/apiService';
import { getSnappedPath } from './services/routingService';

const JeepneyIcon = (props: { className?: string }) => (
  <svg className={props.className || "w-4 h-4"} fill="currentColor" viewBox="0 0 24 24">
    <path d="M4,16c0,0.88,0.39,1.67,1,2.22V20a1,1,0,0,0,1,1H7a1,1,0,0,0,1-1V19h8v1a1,1,0,0,0,1,1h1a1,1,0,0,0,1-1V18.22c0.61-0.55,1-1.34,1-2.22V6 c0-1.52-1.03-2.74-2.42-3.1L12,2L6.42,2.9C5.03,3.26,4,4.48,4,6V16z M18,11H6V6h12V11z M16.5,17A1.5,1.5,0,1,1,18,15.5A1.5,1.5,0,0,1,16.5,17 z M7.5,17A1.5,1.5,0,1,1,9,15.5A1.5,1.5,0,0,1,7.5,17z" />
  </svg>
);

const getDistance = (p1: Waypoint, p2: [number, number]) => {
  const R = 6371e3; // metres
  const φ1 = p1.lat * Math.PI/180;
  const φ2 = p2[0] * Math.PI/180;
  const Δφ = (p2[0]-p1.lat) * Math.PI/180;
  const Δλ = (p2[1]-p1.lng) * Math.PI/180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

const App: React.FC = () => {
  const [routes, setRoutes] = useState<JeepneyRoute[]>([]);
  const [activeRoute, setActiveRoute] = useState<JeepneyRoute | null>(null);
  const [isAddingRoute, setIsAddingRoute] = useState(false);
  const [newRouteWaypoints, setNewRouteWaypoints] = useState<Waypoint[]>([]);
  const [newRoutePath, setNewRoutePath] = useState<[number, number][]>([]);
  const [newRouteName, setNewRouteName] = useState('');
  const [newAuthor, setNewAuthor] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSnapping, setIsSnapping] = useState(false);
  const [analysis, setAnalysis] = useState<GeminiAnalysis | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<Waypoint | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [focusedPoint, setFocusedPoint] = useState<Waypoint | null>(null);
  
  // Track votes locally for better UX feedback
  const [votedIds, setVotedIds] = useState<Record<string, number>>({});

  useEffect(() => {
    loadRoutes();
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        err => console.warn("Location denied")
      );
    }
  }, []);

  const loadRoutes = async () => {
    const data = await apiService.getRoutes();
    setRoutes(data);
  };

  useEffect(() => {
    if (isAddingRoute && newRouteWaypoints.length >= 2) {
      const snap = async () => {
        setIsSnapping(true);
        const path = await getSnappedPath(newRouteWaypoints);
        setNewRoutePath(path);
        setIsSnapping(false);
      };
      const debounce = setTimeout(snap, 500);
      return () => clearTimeout(debounce);
    } else {
      setNewRoutePath(newRouteWaypoints.map(w => [w.lat, w.lng]));
    }
  }, [newRouteWaypoints, isAddingRoute]);

  useEffect(() => {
    if (activeRoute) {
      setIsAnalyzing(true);
      setAnalysis(null);
      apiService.analyzeRoute(activeRoute.name)
        .then(setAnalysis)
        .finally(() => setIsAnalyzing(false));
    }
  }, [activeRoute?.id]);

  const handleSave = async () => {
    if (!newRouteName || !newAuthor || newRouteWaypoints.length < 2) return;
    const now = Date.now();
    const route: JeepneyRoute = {
      id: editingId || `route-${now}`,
      name: newRouteName,
      author: newAuthor,
      waypoints: newRouteWaypoints,
      path: newRoutePath,
      color: ROUTE_COLORS[Math.floor(Math.random() * ROUTE_COLORS.length)],
      score: 1, votes: 1, createdAt: now, lastRefinedAt: now
    };

    const saved = await apiService.saveRoute(route);
    setRoutes(prev => editingId ? prev.map(r => r.id === saved.id ? saved : r) : [...prev, saved]);
    setIsAddingRoute(false);
    setActiveRoute(saved);
    setEditingId(null);
    setNewRouteName('');
    setNewAuthor('');
    setNewRouteWaypoints([]);
  };

  const handleVote = async (delta: number) => {
    if (!activeRoute) return;
    const currentVote = votedIds[activeRoute.id] || 0;
    const adjust = delta === currentVote ? -delta : delta - currentVote;
    
    const updated = await apiService.voteRoute(activeRoute.id, adjust);
    setRoutes(prev => prev.map(r => r.id === updated.id ? updated : r));
    setActiveRoute(updated);
    setVotedIds(prev => ({ ...prev, [activeRoute.id]: delta === currentVote ? 0 : delta }));
  };

  const handleMapClick = (point: Waypoint) => {
    if (isAddingRoute) return;
    setFocusedPoint(point);
    // On mobile, if map is clicked, open sidebar to show results
    if (window.innerWidth < 1024) setIsSidebarOpen(true);
  };

  const filteredRoutes = useMemo(() => {
    if (!focusedPoint) return routes;
    const threshold = 120; // meters for street proximity
    return routes.filter(route => 
      route.path.some(coord => getDistance(focusedPoint, coord) < threshold)
    );
  }, [routes, focusedPoint]);

  return (
    <div className="flex h-screen w-full font-sans bg-slate-50 overflow-hidden relative text-indigo-950">
      <RouteSidebar 
        routes={filteredRoutes} 
        totalRoutesCount={routes.length}
        activeRoute={activeRoute} 
        onSelectRoute={setActiveRoute}
        onAddRouteClick={() => { 
          setIsAddingRoute(true); 
          setIsSidebarOpen(false); // Auto-hide sidebar on mobile
          setActiveRoute(null); 
          setEditingId(null); 
          setNewRouteName(''); 
          setNewAuthor(''); 
          setNewRouteWaypoints([]); 
          setFocusedPoint(null); 
        }}
        isAddingRoute={isAddingRoute}
        isOpen={isSidebarOpen} 
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        onClearFilter={() => setFocusedPoint(null)}
        isFiltered={!!focusedPoint}
      />

      <main className="flex-1 relative overflow-hidden">
        <JeepneyMap 
          routes={routes} activeRoute={activeRoute} isAddingRoute={isAddingRoute}
          onWaypointAdd={p => setNewRouteWaypoints(prev => [...prev, p])}
          onWaypointUpdate={(i, p) => setNewRouteWaypoints(prev => { const n = [...prev]; n[i] = p; return n; })}
          onMapClick={handleMapClick} newRouteWaypoints={newRouteWaypoints} newRoutePath={newRoutePath}
          focusedPoint={focusedPoint} userLocation={userLocation}
        />

        {/* Route Info Popup */}
        {activeRoute && !isAddingRoute && (
          <div className="absolute top-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-85 z-[1000] bg-white/95 backdrop-blur-md rounded-[2rem] shadow-2xl border border-white/50 overflow-hidden max-h-[75vh] flex flex-col animate-in slide-in-from-top-4 duration-300">
            <header className="p-5 bg-indigo-950 text-white flex justify-between items-start">
              <div className="pr-4 flex-1 overflow-hidden">
                <h2 className="font-black text-lg leading-tight uppercase italic truncate">{activeRoute.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[9px] font-black text-yellow-400 uppercase tracking-widest truncate">By {activeRoute.author}</span>
                  <div className="h-1 w-1 bg-white/30 rounded-full" />
                  <span className="text-[10px] font-black text-indigo-300">Score: {activeRoute.score}</span>
                </div>
              </div>
              <button onClick={() => setActiveRoute(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors flex-shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </header>
            
            <div className="p-5 overflow-y-auto space-y-5 scrollbar-hide">
              {/* Like/Dislike Actions */}
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => handleVote(1)}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all font-black text-[10px] uppercase tracking-wider ${
                    votedIds[activeRoute.id] === 1 
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-emerald-200 shadow-lg' 
                      : 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100'
                  }`}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/></svg>
                  Like
                </button>
                <button 
                  onClick={() => handleVote(-1)}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all font-black text-[10px] uppercase tracking-wider ${
                    votedIds[activeRoute.id] === -1 
                      ? 'bg-rose-600 text-white border-rose-600 shadow-rose-200 shadow-lg' 
                      : 'bg-rose-50 text-rose-700 border-rose-100 hover:bg-rose-100'
                  }`}
                >
                  <svg className="w-4 h-4 transform rotate-180" fill="currentColor" viewBox="0 0 24 24"><path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/></svg>
                  Dislike
                </button>
              </div>

              {isAnalyzing ? (
                <div className="space-y-3 animate-pulse">
                  <div className="h-4 bg-slate-100 rounded w-1/2"></div>
                  <div className="h-20 bg-slate-100 rounded-2xl"></div>
                </div>
              ) : analysis && (
                <div className="space-y-4">
                  <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100">
                    <h4 className="text-[9px] font-black text-indigo-950/40 uppercase tracking-[0.2em] mb-2">Commuter Intel</h4>
                    <p className="text-sm text-indigo-950 leading-relaxed font-medium">"{analysis.guide}"</p>
                  </div>
                  {analysis.landmarks.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {analysis.landmarks.map((l, i) => (
                        <span key={i} className="px-2.5 py-1 bg-white text-indigo-800 text-[10px] font-bold rounded-lg border border-indigo-100 shadow-sm">{l}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button 
                onClick={() => { 
                  setIsAddingRoute(true); 
                  setIsSidebarOpen(false); // Auto-hide sidebar on mobile
                  setEditingId(activeRoute.id); 
                  setNewRouteName(activeRoute.name); 
                  setNewAuthor(activeRoute.author);
                  setNewRouteWaypoints(activeRoute.waypoints); 
                  setActiveRoute(null); 
                  setFocusedPoint(null);
                }}
                className="w-full bg-slate-100 text-indigo-900 font-black py-4 rounded-xl text-[10px] uppercase tracking-widest hover:bg-indigo-50 transition-all border border-indigo-100/50"
              >
                Refine Path
              </button>
            </div>
          </div>
        )}

        {/* Improved Route Publisher for Mobile - Floating split layout */}
        {isAddingRoute && (
          <>
            {/* Top Overlay for Inputs */}
            <div className="absolute top-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-[1000] bg-white rounded-[1.5rem] shadow-xl p-4 border border-slate-200 animate-in slide-in-from-top-4 duration-300">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-indigo-950 text-yellow-400 rounded-lg flex items-center justify-center shadow-md">
                   <JeepneyIcon className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-black text-indigo-950 uppercase tracking-tight">{editingId ? 'Refining Path' : 'Add New Route'}</h2>
              </div>
              <div className="space-y-3">
                <input 
                  value={newRouteName} 
                  onChange={e => setNewRouteName(e.target.value)} 
                  placeholder="Route Name (e.g. San Andres - Padre Faura)" 
                  className="w-full bg-slate-50 border-2 border-slate-300 rounded-xl px-4 py-2.5 text-xs font-bold text-indigo-950 outline-none focus:border-indigo-600 transition-all"
                />
                <input 
                  value={newAuthor} 
                  onChange={e => setNewAuthor(e.target.value)} 
                  placeholder="Your Name (Author)" 
                  className="w-full bg-slate-50 border-2 border-slate-300 rounded-xl px-4 py-2.5 text-xs font-bold text-indigo-950 outline-none focus:border-indigo-600 transition-all"
                />
              </div>
            </div>

            {/* Bottom Overlay for Controls */}
            <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-[1000] space-y-3 animate-in slide-in-from-bottom-4 duration-300">
              <div className="bg-indigo-950 text-white p-3.5 rounded-2xl flex justify-between items-center shadow-xl border border-indigo-800">
                <div className="flex flex-col">
                  <p className="text-[10px] font-black uppercase tracking-widest text-yellow-400">Map Route Path</p>
                  <p className="text-[8px] opacity-60 font-bold uppercase">{newRouteWaypoints.length} waypoints added</p>
                </div>
                <button 
                  onClick={() => setNewRouteWaypoints(p => p.slice(0, -1))} 
                  className="text-[10px] font-black bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl transition-colors border border-white/20"
                >
                  Undo
                </button>
              </div>

              <div className="bg-white p-3 rounded-2xl shadow-2xl border border-slate-200 flex gap-2">
                <button 
                  onClick={() => { setIsAddingRoute(false); setEditingId(null); setNewRouteName(''); setNewAuthor(''); setNewRouteWaypoints([]); }} 
                  className="flex-1 text-[10px] font-black text-slate-500 uppercase tracking-widest py-3 hover:text-red-500 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSave} 
                  disabled={isSnapping || newRouteWaypoints.length < 2 || !newRouteName || !newAuthor} 
                  className="flex-[2] bg-indigo-600 text-white font-black py-4 rounded-xl text-[11px] uppercase tracking-widest shadow-lg disabled:opacity-50 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  {isSnapping ? 'Smoothing...' : 'Publish'}
                  {!isSnapping && <JeepneyIcon className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default App;
