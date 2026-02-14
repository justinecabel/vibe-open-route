
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
  const [isBackendConnected, setIsBackendConnected] = useState(false);
  
  const [votedIds, setVotedIds] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('vibe_user_votes');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Persist votes to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('vibe_user_votes', JSON.stringify(votedIds));
  }, [votedIds]);

  // Subscribe to backend connection status changes
  useEffect(() => {
    const unsubscribe = apiService.onConnectionStatusChange((connected) => {
      setIsBackendConnected(connected);
    });

    // Check connection immediately
    apiService.checkBackendConnection();

    // Check connection periodically every 10 seconds
    const interval = setInterval(() => {
      apiService.checkBackendConnection();
    }, 10000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

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
    setAnalysis(null);
    setIsAnalyzing(false);
  }, [activeRoute?.id]);

  const handleAnalyze = async () => {
    if (!activeRoute) return;
    setIsAnalyzing(true);
    try {
      const result = await apiService.analyzeRoute(activeRoute.name);
      setAnalysis(result);
    } finally {
      setIsAnalyzing(false);
    }
  };

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
    // Dismiss active route details when clicking elsewhere on the map
    setActiveRoute(null);
    setFocusedPoint(point);
    // Auto-open sidebar on mobile for better SEO/discoverability of matching routes
    if (window.innerWidth < 1024) setIsSidebarOpen(true);
  };

  const filteredRoutes = useMemo(() => {
    if (!focusedPoint) return routes;
    const threshold = 120; // 120 meters filter
    return routes.filter(route => 
      route.path.some(coord => getDistance(focusedPoint, coord) < threshold)
    );
  }, [routes, focusedPoint]);

  return (
    <div className="flex h-dvh w-full font-sans bg-slate-50 overflow-hidden relative text-indigo-950 text-sm">
      <RouteSidebar 
        routes={filteredRoutes} 
        totalRoutesCount={routes.length}
        activeRoute={activeRoute} 
        onSelectRoute={(r) => { setActiveRoute(r); if(window.innerWidth < 1024) setIsSidebarOpen(false); }}
        onAddRouteClick={() => { 
          setIsAddingRoute(true); 
          setIsSidebarOpen(false);
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
        {/* Backend Connection Status Indicator */}
        <div className="fixed top-3 left-1/2 transform -translate-x-1/2 z-[4000] flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/90 backdrop-blur-md border border-white/50 shadow-lg animate-in fade-in duration-300">
          <div className={`w-2.5 h-2.5 rounded-full ${isBackendConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-indigo-950">
            {isBackendConnected ? '✓ Backend Connected' : '✗ Backend Offline'}
          </p>
        </div>

        <JeepneyMap 
          routes={routes} activeRoute={activeRoute} isAddingRoute={isAddingRoute}
          onWaypointAdd={p => setNewRouteWaypoints(prev => [...prev, p])}
          onWaypointUpdate={(i, p) => setNewRouteWaypoints(prev => { const n = [...prev]; n[i] = p; return n; })}
          onMapClick={handleMapClick} newRouteWaypoints={newRouteWaypoints} newRoutePath={newRoutePath}
          focusedPoint={focusedPoint} userLocation={userLocation}
        />

        {/* Route Info Popup - Compact & SEO Friendly */}
        {activeRoute && !isAddingRoute && (
          <div className="fixed top-3 left-3 right-3 md:left-auto md:right-3 md:w-80 z-[2002] bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl border border-white/50 overflow-hidden max-h-[80vh] flex flex-col animate-in slide-in-from-top-2 duration-300">
            <header className="p-3 bg-indigo-950 text-white flex items-center gap-3">
              <button 
                onClick={() => setActiveRoute(null)} 
                className="p-1.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all flex-shrink-0"
                aria-label="Close route info"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
              <div className="flex-1 truncate">
                <h2 className="font-placard text-[14px] uppercase italic truncate">{activeRoute.name}</h2>
                <p className="text-[9px] font-bold text-yellow-400 uppercase tracking-widest truncate opacity-80">Posted by {activeRoute.author}</p>
              </div>
            </header>
            
            <div className="p-3 overflow-y-auto space-y-3 scrollbar-hide flex-1">
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => handleVote(1)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border-2 transition-all font-black text-[9px] uppercase tracking-wider ${
                    votedIds[activeRoute.id] === 1 
                      ? 'bg-emerald-600 text-white border-emerald-600' 
                      : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                  }`}
                >
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/></svg>
                  Like
                </button>
                <button 
                  onClick={() => handleVote(-1)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border-2 transition-all font-black text-[9px] uppercase tracking-wider ${
                    votedIds[activeRoute.id] === -1 
                      ? 'bg-rose-600 text-white border-rose-600' 
                      : 'bg-rose-50 text-rose-700 border-rose-100'
                  }`}
                >
                  <svg className="w-3 h-3 transform rotate-180" fill="currentColor" viewBox="0 0 24 24"><path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/></svg>
                  Dislike
                </button>
              </div>

              {!analysis && !isAnalyzing ? (
                <button 
                  onClick={handleAnalyze}
                  className="w-full bg-indigo-600 text-white font-black py-2.5 rounded-xl text-[10px] uppercase tracking-widest shadow-lg hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                  Get Route Intel (AI)
                </button>
              ) : isAnalyzing ? (
                <div className="flex flex-col items-center py-2 space-y-1 animate-pulse">
                  <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-[8px] font-black text-indigo-900/50 uppercase">Checking landmarks...</p>
                </div>
              ) : analysis && (
                <div className="space-y-2 animate-in fade-in slide-in-from-bottom-1">
                  <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100">
                    <p className="text-[11px] text-indigo-950 leading-tight font-medium">"{analysis.guide}"</p>
                  </div>
                  {analysis.landmarks.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {analysis.landmarks.slice(0, 3).map((l, i) => (
                        <span key={i} className="px-1.5 py-0.5 bg-white text-indigo-800 text-[8px] font-bold rounded-md border border-indigo-100 uppercase tracking-tighter">{l}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button 
                onClick={() => { 
                  setIsAddingRoute(true); 
                  setIsSidebarOpen(false); 
                  setEditingId(activeRoute.id); 
                  setNewRouteName(activeRoute.name); 
                  setNewAuthor(activeRoute.author);
                  setNewRouteWaypoints(activeRoute.waypoints); 
                  setActiveRoute(null); 
                  setFocusedPoint(null);
                }}
                className="w-full bg-slate-100 text-indigo-950 font-black py-2.5 rounded-xl text-[9px] uppercase tracking-widest border border-indigo-100/50 hover:bg-slate-200"
              >
                Refine Path
              </button>
            </div>
          </div>
        )}

        {/* Route Drawing/Editing UI - Compact and Non-overflowing */}
        {isAddingRoute && (
          <>
            <div className="fixed top-3 left-3 right-3 md:left-auto md:right-3 md:w-72 z-[1000] bg-white rounded-2xl shadow-xl p-3 border border-slate-200 animate-in fade-in duration-200 max-h-[35vh] overflow-y-auto">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 bg-indigo-950 text-yellow-400 rounded-lg flex items-center justify-center">
                   <JeepneyIcon className="w-3 h-3" />
                </div>
                <h2 className="text-[11px] font-black text-indigo-950 uppercase tracking-wider">{editingId ? 'Refine Path' : 'Map New Route'}</h2>
              </div>
              <div className="space-y-2">
                <input 
                  value={newRouteName} 
                  onChange={e => setNewRouteName(e.target.value)} 
                  placeholder="Route (e.g. PITX - Monumento)" 
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-[10px] font-bold text-indigo-950 outline-none focus:border-indigo-600"
                />
                <input 
                  value={newAuthor} 
                  onChange={e => setNewAuthor(e.target.value)} 
                  placeholder="Contributor Name" 
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-[10px] font-bold text-indigo-950 outline-none focus:border-indigo-600"
                />
              </div>
            </div>

            <div className="fixed bottom-0 left-0 right-0 md:left-auto md:w-80 md:bottom-3 md:right-3 z-[1000] flex flex-col gap-2 p-3 md:p-0">
              <div className="bg-indigo-950 text-white p-2 rounded-xl flex justify-between items-center shadow-lg border border-indigo-800">
                <p className="text-[9px] font-black uppercase tracking-widest text-indigo-300 ml-1">
                  <span className="text-yellow-400">{newRouteWaypoints.length}</span> Points
                </p>
                <button 
                  onClick={() => setNewRouteWaypoints(p => p.slice(0, -1))} 
                  className="text-[9px] font-black bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg border border-white/20"
                >
                  Undo
                </button>
              </div>

              <div className="bg-white p-2 rounded-xl shadow-2xl border border-slate-200 flex flex-row gap-2 md:flex-col">
                <button 
                  onClick={() => { setIsAddingRoute(false); setEditingId(null); setNewRouteName(''); setNewAuthor(''); setNewRouteWaypoints([]); }} 
                  className="flex-1 text-[9px] font-black text-slate-500 uppercase tracking-widest py-3 rounded-lg hover:bg-slate-50 bg-slate-50/50 min-h-12"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSave} 
                  disabled={isSnapping || newRouteWaypoints.length < 2 || !newRouteName || !newAuthor} 
                  className="flex-[2] md:flex-1 bg-indigo-600 text-white font-black py-3 rounded-lg text-[10px] uppercase tracking-widest shadow-lg disabled:opacity-50 active:scale-95 flex items-center justify-center gap-2 min-h-12"
                >
                  {isSnapping ? 'Snapping...' : 'Publish'}
                  {!isSnapping && <JeepneyIcon className="w-3.5 h-3.5" />}
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
