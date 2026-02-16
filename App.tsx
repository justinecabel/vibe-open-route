import React, { useState, useEffect, useMemo } from 'react';
import JeepneyMap from './components/JeepneyMap';
import RouteSidebar from './components/RouteSidebar';
import { JeepneyRoute, Waypoint, GeminiAnalysis, RouteRefinement } from './types';
import { ROUTE_COLORS } from './constants';
import { apiService } from './services/apiService';
import { getSnappedPath } from './services/routingService';

const PUBLISH_COOLDOWN_MS = 10_000;

const JeepneyIcon = (props: { className?: string }) => (
  <svg className={props.className || 'w-4 h-4'} fill="currentColor" viewBox="0 0 24 24">
    <path d="M4,16c0,0.88,0.39,1.67,1,2.22V20a1,1,0,0,0,1,1H7a1,1,0,0,0,1-1V19h8v1a1,1,0,0,0,1,1h1a1,1,0,0,0,1-1V18.22c0.61-0.55,1-1.34,1-2.22V6 c0-1.52-1.03-2.74-2.42-3.1L12,2L6.42,2.9C5.03,3.26,4,4.48,4,6V16z M18,11H6V6h12V11z M16.5,17A1.5,1.5,0,1,1,18,15.5A1.5,1.5,0,0,1,16.5,17 z M7.5,17A1.5,1.5,0,1,1,9,15.5A1.5,1.5,0,0,1,7.5,17z" />
  </svg>
);

const getDistance = (p1: Waypoint, p2: [number, number]) => {
  const R = 6371e3;
  const phi1 = (p1.lat * Math.PI) / 180;
  const phi2 = (p2[0] * Math.PI) / 180;
  const deltaPhi = ((p2[0] - p1.lat) * Math.PI) / 180;
  const deltaLambda = ((p2[1] - p1.lng) * Math.PI) / 180;
  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const formatRouteDate = (timestamp?: number) => {
  if (!timestamp || !Number.isFinite(timestamp)) return 'Unknown';
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const normalizeRouteName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');
const getVoteKey = (routeId: string, refinementId: string) => `${routeId}:${refinementId}`;
const getLatestRefinement = (route: JeepneyRoute): RouteRefinement => {
  return route.refinementHistory[route.refinementHistory.length - 1];
};

const App: React.FC = () => {
  const [routes, setRoutes] = useState<JeepneyRoute[]>([]);
  const [activeRoute, setActiveRoute] = useState<JeepneyRoute | null>(null);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [selectedRefinementId, setSelectedRefinementId] = useState<string | null>(null);
  const [isAddingRoute, setIsAddingRoute] = useState(false);
  const [newRouteWaypoints, setNewRouteWaypoints] = useState<Waypoint[]>([]);
  const [newRoutePath, setNewRoutePath] = useState<[number, number][]>([]);
  const [newRouteName, setNewRouteName] = useState('');
  const [newAuthor, setNewAuthor] = useState('');
  const [forkParentDraftId, setForkParentDraftId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSnapping, setIsSnapping] = useState(false);
  const [analysis, setAnalysis] = useState<GeminiAnalysis | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<Waypoint | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [focusedPoint, setFocusedPoint] = useState<Waypoint | null>(null);
  const [forkFilterRouteId, setForkFilterRouteId] = useState<string | null>(null);
  const [isBackendConnected, setIsBackendConnected] = useState(false);
  const [showConnectionStatus, setShowConnectionStatus] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [nowTick, setNowTick] = useState(Date.now());
  const connectionTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const [votedIds, setVotedIds] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('vibe_user_votes');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem('vibe_user_votes', JSON.stringify(votedIds));
  }, [votedIds]);

  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const unsubscribe = apiService.onConnectionStatusChange((connected) => {
      setIsBackendConnected(connected);
      if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);

      if (connected) {
        setShowConnectionStatus(true);
        connectionTimeoutRef.current = setTimeout(() => setShowConnectionStatus(false), 2000);
      } else {
        setShowConnectionStatus(true);
      }
    });

    apiService.checkBackendConnection();
    const interval = setInterval(() => apiService.checkBackendConnection(), 10_000);

    return () => {
      unsubscribe();
      clearInterval(interval);
      if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const loadRoutes = async () => {
      const data = await apiService.getRoutes();
      setRoutes(data);
    };
    loadRoutes();

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => console.warn('Location denied')
      );
    }
  }, []);

  useEffect(() => {
    if (!activeRoute) {
      setSelectedRefinementId(null);
      setShowAboutModal(false);
      return;
    }
    const latest = getLatestRefinement(activeRoute);
    setSelectedRefinementId(activeRoute.activeRefinementId ?? latest.id);
  }, [activeRoute?.id, activeRoute?.activeRefinementId]);

  const cloneWaypoints = (waypoints: Waypoint[]) => waypoints.map(w => ({ ...w }));
  const cooldownRemainingSec = Math.max(0, Math.ceil((cooldownUntil - nowTick) / 1000));
  const isCoolingDown = cooldownRemainingSec > 0;

  const forkCountsByParent = useMemo(() => {
    const counts: Record<string, number> = {};
    routes.forEach(route => {
      if (route.parentRouteId) {
        counts[route.parentRouteId] = (counts[route.parentRouteId] ?? 0) + 1;
      }
    });
    return counts;
  }, [routes]);

  const hasDuplicateRouteName = useMemo(() => {
    if (editingId || forkParentDraftId || !newRouteName.trim()) return false;
    const normalizedDraftName = normalizeRouteName(newRouteName);
    return routes.some(route => normalizeRouteName(route.name) === normalizedDraftName);
  }, [editingId, forkParentDraftId, newRouteName, routes]);

  const activeRefinement = useMemo(() => {
    if (!activeRoute || activeRoute.refinementHistory.length === 0) return null;
    return activeRoute.refinementHistory.find(r => r.id === selectedRefinementId) ?? getLatestRefinement(activeRoute);
  }, [activeRoute, selectedRefinementId]);

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
    }
    setNewRoutePath(newRouteWaypoints.map(w => [w.lat, w.lng]));
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
    setPublishError(null);
    if (!newRouteName.trim() || !newAuthor.trim() || newRouteWaypoints.length < 2) return;
    if (isCoolingDown) {
      setPublishError(`Please wait ${cooldownRemainingSec}s before publishing again.`);
      return;
    }
    if (hasDuplicateRouteName) {
      setPublishError('Route name already exists. Rename it or use Refine Path.');
      return;
    }

    const now = Date.now();
    const existingRoute = editingId ? routes.find(r => r.id === editingId) : null;
    const latestExistingRefinement = existingRoute ? getLatestRefinement(existingRoute) : null;

    const route: JeepneyRoute = existingRoute
      ? {
        ...existingRoute,
        name: newRouteName.trim(),
        author: existingRoute.author,
        waypoints: newRouteWaypoints,
        path: newRoutePath,
        score: latestExistingRefinement?.score ?? existingRoute.score,
        votes: latestExistingRefinement?.votes ?? existingRoute.votes,
        lastRefinedAt: now,
        refinementHistory: [
          ...existingRoute.refinementHistory,
          {
            id: `ref-${existingRoute.id}-${now}`,
            contributor: existingRoute.author,
            createdAt: now,
            score: latestExistingRefinement?.score ?? existingRoute.score,
            votes: latestExistingRefinement?.votes ?? existingRoute.votes,
          }
        ],
        activeRefinementId: `ref-${existingRoute.id}-${now}`,
      }
      : {
        id: `route-${now}`,
        name: newRouteName.trim(),
        author: newAuthor.trim(),
        parentRouteId: forkParentDraftId ?? undefined,
        waypoints: newRouteWaypoints,
        path: newRoutePath,
        color: ROUTE_COLORS[Math.floor(Math.random() * ROUTE_COLORS.length)],
        score: 1,
        votes: 1,
        createdAt: now,
        lastRefinedAt: now,
        refinementHistory: [
          {
            id: `ref-route-${now}-initial`,
            contributor: newAuthor.trim(),
            createdAt: now,
            score: 1,
            votes: 1,
          }
        ],
        activeRefinementId: `ref-route-${now}-initial`,
      };

    const saved = await apiService.saveRoute(route);
    setRoutes(prev => editingId ? prev.map(r => r.id === saved.id ? saved : r) : [...prev, saved]);
    setCooldownUntil(Date.now() + PUBLISH_COOLDOWN_MS);
    setPublishError(null);
    setIsAddingRoute(false);
    setActiveRoute(saved);
    setSelectedRefinementId(saved.activeRefinementId ?? getLatestRefinement(saved).id);
    setEditingId(null);
    setForkParentDraftId(null);
    setNewRouteName('');
    setNewAuthor('');
    setNewRouteWaypoints([]);
  };

  const startRefine = (route: JeepneyRoute) => {
    setPublishError(null);
    setIsAddingRoute(true);
    setIsSidebarOpen(false);
    setEditingId(route.id);
    setForkParentDraftId(null);
    setNewRouteName(route.name);
    setNewAuthor(route.author);
    setNewRouteWaypoints(cloneWaypoints(route.waypoints));
    setActiveRoute(null);
    setFocusedPoint(null);
    setForkFilterRouteId(null);
  };

  const startFork = (route: JeepneyRoute) => {
    setPublishError(null);
    setIsAddingRoute(true);
    setIsSidebarOpen(false);
    setEditingId(null);
    setForkParentDraftId(route.id);
    setNewRouteName(`Fork from ${route.author} - ${route.name}`);
    setNewAuthor('');
    setNewRouteWaypoints(cloneWaypoints(route.waypoints));
    setActiveRoute(null);
    setFocusedPoint(null);
    setForkFilterRouteId(null);
  };

  const handleRefinementVote = async (delta: number) => {
    if (!activeRoute || !activeRefinement) return;
    const voteKey = getVoteKey(activeRoute.id, activeRefinement.id);
    const currentVote = votedIds[voteKey] || 0;
    const adjust = delta === currentVote ? -delta : delta - currentVote;

    const updated = await apiService.voteRefinement(activeRoute.id, activeRefinement.id, adjust);
    const selected = updated.refinementHistory.find(ref => ref.id === activeRefinement.id) ?? getLatestRefinement(updated);

    setRoutes(prev => prev.map(r => r.id === updated.id ? updated : r));
    setActiveRoute(updated);
    setSelectedRefinementId(selected.id);
    setVotedIds(prev => ({ ...prev, [voteKey]: delta === currentVote ? 0 : delta }));
  };

  const handleMapClick = (point: Waypoint) => {
    if (isAddingRoute) return;
    setActiveRoute(null);
    setFocusedPoint(point);
    setForkFilterRouteId(null);
    if (window.innerWidth < 1024) setIsSidebarOpen(true);
  };

  const filteredRoutes = useMemo(() => {
    let next = routes;
    if (focusedPoint) {
      const threshold = 120;
      next = next.filter(route => route.path.some(coord => getDistance(focusedPoint, coord) < threshold));
    }
    if (forkFilterRouteId) {
      next = next.filter(route => route.parentRouteId === forkFilterRouteId);
    }
    return next;
  }, [routes, focusedPoint, forkFilterRouteId]);

  const activeForkCount = activeRoute ? (forkCountsByParent[activeRoute.id] ?? 0) : 0;
  const activeRefinementVoteKey = activeRoute && activeRefinement
    ? getVoteKey(activeRoute.id, activeRefinement.id)
    : null;
  const closeRouteDetails = () => {
    setShowAboutModal(false);
    setActiveRoute(null);
    if (window.innerWidth < 1024) setIsSidebarOpen(true);
  };

  return (
    <div className="flex h-dvh w-full font-sans bg-slate-50 overflow-hidden relative text-indigo-950 text-sm">
      <RouteSidebar
        routes={filteredRoutes}
        totalRoutesCount={routes.length}
        activeRoute={activeRoute}
        onSelectRoute={(route) => {
          setActiveRoute(route);
          setSelectedRefinementId(route.activeRefinementId ?? getLatestRefinement(route).id);
          setIsSidebarOpen(false);
        }}
        onAddRouteClick={() => {
          setPublishError(null);
          setIsAddingRoute(true);
          setIsSidebarOpen(false);
          setActiveRoute(null);
          setEditingId(null);
          setForkParentDraftId(null);
          setNewRouteName('');
          setNewAuthor('');
          setNewRouteWaypoints([]);
          setFocusedPoint(null);
          setForkFilterRouteId(null);
        }}
        isAddingRoute={isAddingRoute}
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        onClearFilter={() => {
          setFocusedPoint(null);
          setForkFilterRouteId(null);
        }}
        isFiltered={!!focusedPoint || !!forkFilterRouteId}
      />

      <main className="flex-1 relative overflow-hidden">
        {showConnectionStatus && (
          <div className={`fixed top-3 left-1/2 transform -translate-x-1/2 z-[4000] flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md border border-white/50 shadow-lg animate-in fade-in duration-300 ${
            isBackendConnected ? 'bg-emerald-500/95 text-white' : 'bg-white/90 text-indigo-950'
          }`}>
            <div className={`w-2.5 h-2.5 rounded-full ${isBackendConnected ? 'bg-white animate-pulse' : 'bg-rose-500'}`}></div>
            <p className="text-[9px] font-bold uppercase tracking-widest">
              {isBackendConnected ? '✓ Backend Reconnected' : '✗ Backend Offline'}
            </p>
          </div>
        )}

        <JeepneyMap
          routes={routes}
          activeRoute={activeRoute}
          isAddingRoute={isAddingRoute}
          onWaypointAdd={point => setNewRouteWaypoints(prev => [...prev, point])}
          onWaypointUpdate={(idx, point) => setNewRouteWaypoints(prev => {
            const next = [...prev];
            next[idx] = point;
            return next;
          })}
          onMapClick={handleMapClick}
          newRouteWaypoints={newRouteWaypoints}
          newRoutePath={newRoutePath}
          focusedPoint={focusedPoint}
          userLocation={userLocation}
        />

        {activeRoute && !isAddingRoute && (
          <div className="fixed top-3 left-3 right-3 md:left-auto md:right-3 md:w-80 z-[2002] bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl border border-white/50 overflow-hidden max-h-[80vh] flex flex-col animate-in slide-in-from-top-2 duration-300">
            <header className="p-3 bg-indigo-950 text-white flex items-center gap-3">
              <button
                onClick={closeRouteDetails}
                className="p-1.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all flex-shrink-0"
                aria-label="Close route info"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              <div className="flex-1 truncate">
                <h2 className="font-placard text-[14px] uppercase italic truncate">{activeRoute.name}</h2>
                <p className="text-[9px] font-bold text-yellow-400 uppercase tracking-widest truncate opacity-80">Posted by {activeRoute.author}</p>
              </div>
            </header>

            <div className="p-3 overflow-y-auto space-y-3 scrollbar-hide flex-1">
              {activeRefinement && (
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <p className="text-[9px] text-slate-600 font-bold uppercase tracking-wider">
                    Selected refinement: <span className="text-indigo-950">{formatRouteDate(activeRefinement.createdAt)}</span>
                  </p>
                  <p className="text-[9px] text-slate-600 font-bold uppercase tracking-wider">
                    Contributor: <span className="text-indigo-950">{activeRefinement.contributor}</span>
                  </p>
                  <p className="text-[9px] text-slate-600 font-bold uppercase tracking-wider">
                    Score: <span className="text-indigo-950">{activeRefinement.score}</span>
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleRefinementVote(1)}
                  disabled={!activeRefinement}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border-2 transition-all font-black text-[9px] uppercase tracking-wider ${
                    activeRefinementVoteKey && votedIds[activeRefinementVoteKey] === 1
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                  }`}
                >
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z" /></svg>
                  Like
                </button>
                <button
                  onClick={() => handleRefinementVote(-1)}
                  disabled={!activeRefinement}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border-2 transition-all font-black text-[9px] uppercase tracking-wider ${
                    activeRefinementVoteKey && votedIds[activeRefinementVoteKey] === -1
                      ? 'bg-rose-600 text-white border-rose-600'
                      : 'bg-rose-50 text-rose-700 border-rose-100'
                  }`}
                >
                  <svg className="w-3 h-3 transform rotate-180" fill="currentColor" viewBox="0 0 24 24"><path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z" /></svg>
                  Dislike
                </button>
              </div>

              {!analysis && !isAnalyzing ? (
                <button
                  onClick={handleAnalyze}
                  className="w-full bg-indigo-600 text-white font-black py-2.5 rounded-xl text-[10px] uppercase tracking-widest shadow-lg hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
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
                      {analysis.landmarks.slice(0, 3).map((landmark, i) => (
                        <span key={i} className="px-1.5 py-0.5 bg-white text-indigo-800 text-[8px] font-bold rounded-md border border-indigo-100 uppercase tracking-tighter">{landmark}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <section className="space-y-2">
                <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Refine Edit History</h3>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {[...activeRoute.refinementHistory].reverse().map((refinement) => (
                    <button
                      key={refinement.id}
                      onClick={() => setSelectedRefinementId(refinement.id)}
                      className={`w-full text-left p-2 rounded-lg border transition-all ${
                        selectedRefinementId === refinement.id
                          ? 'bg-indigo-50 border-indigo-300'
                          : 'bg-white border-slate-200 hover:border-indigo-200'
                      }`}
                    >
                      <p className="text-[9px] font-black uppercase tracking-wide text-indigo-900">
                        {formatRouteDate(refinement.createdAt)}
                      </p>
                      <p className="text-[9px] font-bold text-slate-600">
                        Contributor: {refinement.contributor}
                      </p>
                      <p className="text-[9px] font-bold text-slate-500">
                        Score {refinement.score} • Votes {refinement.votes}
                      </p>
                    </button>
                  ))}
                </div>
              </section>

              <div className="grid grid-cols-4 gap-2">
                <button
                  onClick={() => startRefine(activeRoute)}
                  className="bg-slate-100 text-indigo-950 font-black py-2.5 rounded-xl text-[9px] uppercase tracking-widest border border-indigo-100/50 hover:bg-slate-200"
                >
                  Refine
                </button>
                <button
                  onClick={() => startFork(activeRoute)}
                  className="bg-indigo-100 text-indigo-950 font-black py-2.5 rounded-xl text-[9px] uppercase tracking-widest border border-indigo-200 hover:bg-indigo-200"
                >
                  Fork
                </button>
                <button
                  onClick={() => {
                    setForkFilterRouteId(activeRoute.id);
                    setFocusedPoint(null);
                    setIsSidebarOpen(true);
                  }}
                  className="bg-emerald-100 text-emerald-900 font-black py-2.5 rounded-xl text-[9px] uppercase tracking-widest border border-emerald-200 hover:bg-emerald-200"
                >
                  Forks ({activeForkCount})
                </button>
                <button
                  onClick={() => setShowAboutModal(true)}
                  className="bg-amber-100 text-amber-900 font-black py-2.5 rounded-xl text-[9px] uppercase tracking-widest border border-amber-200 hover:bg-amber-200"
                >
                  About
                </button>
              </div>
            </div>
          </div>
        )}

        {activeRoute && showAboutModal && !isAddingRoute && (
          <div className="fixed bottom-3 left-3 right-3 md:left-auto md:right-[22rem] md:w-72 z-[2003] bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-white/60 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
            <header className="p-3 bg-indigo-950 text-white flex items-center gap-2">
              <h2 className="font-placard text-[13px] uppercase italic truncate flex-1">About Route</h2>
              <button
                onClick={() => setShowAboutModal(false)}
                className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-all"
                aria-label="Close about"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </header>
            <div className="p-3 space-y-1.5">
              <p className="text-[10px] font-black uppercase tracking-wide text-indigo-950 truncate">{activeRoute.name}</p>
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-600">Author: <span className="text-indigo-950">{activeRoute.author}</span></p>
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-600">Created: <span className="text-indigo-950">{formatRouteDate(activeRoute.createdAt)}</span></p>
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-600">Last refined: <span className="text-indigo-950">{formatRouteDate(activeRoute.lastRefinedAt)}</span></p>
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-600">Forks: <span className="text-indigo-950">{activeForkCount}</span></p>
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-600">Refinements: <span className="text-indigo-950">{activeRoute.refinementHistory.length}</span></p>
              {activeRefinement && (
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-600">Latest contributor: <span className="text-indigo-950">{activeRefinement.contributor}</span></p>
              )}
            </div>
          </div>
        )}

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
                  onChange={e => { setNewRouteName(e.target.value); setPublishError(null); }}
                  placeholder="Route (e.g. PITX - Monumento)"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-[10px] font-bold text-indigo-950 outline-none focus:border-indigo-600"
                />
                <input
                  value={newAuthor}
                  onChange={e => { setNewAuthor(e.target.value); setPublishError(null); }}
                  placeholder="Contributor Name"
                  disabled={!!editingId}
                  className={`w-full border rounded-lg px-3 py-1.5 text-[10px] font-bold text-indigo-950 outline-none ${
                    editingId
                      ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                      : 'bg-slate-50 border-slate-200 focus:border-indigo-600'
                  }`}
                />
                {editingId && (
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                    Route author stays original during refine history updates.
                  </p>
                )}
                {forkParentDraftId && (
                  <p className="text-[9px] text-emerald-700 font-bold uppercase tracking-wider">
                    Fork linked. Name format: Fork from author - route name.
                  </p>
                )}
                {hasDuplicateRouteName && (
                  <p className="text-[9px] text-rose-600 font-bold uppercase tracking-wider">
                    Route name already exists.
                  </p>
                )}
                {isCoolingDown && (
                  <p className="text-[9px] text-amber-700 font-bold uppercase tracking-wider">
                    Publish cooldown: {cooldownRemainingSec}s
                  </p>
                )}
                {publishError && (
                  <p className="text-[9px] text-rose-700 font-bold uppercase tracking-wider">
                    {publishError}
                  </p>
                )}
              </div>
            </div>

            <div className="fixed bottom-0 left-0 right-0 md:left-auto md:w-80 md:bottom-3 md:right-3 z-[1000] flex flex-col gap-2 p-3 md:p-0">
              <div className="bg-indigo-950 text-white p-2 rounded-xl flex justify-between items-center shadow-lg border border-indigo-800">
                <p className="text-[9px] font-black uppercase tracking-widest text-indigo-300 ml-1">
                  <span className="text-yellow-400">{newRouteWaypoints.length}</span> Points
                </p>
                <button
                  onClick={() => setNewRouteWaypoints(prev => prev.slice(0, -1))}
                  className="text-[9px] font-black bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg border border-white/20"
                >
                  Undo
                </button>
              </div>

              <div className="bg-white p-2 rounded-xl shadow-2xl border border-slate-200 flex flex-row gap-2 md:flex-col">
                <button
                  onClick={() => {
                    setPublishError(null);
                    setIsAddingRoute(false);
                    setEditingId(null);
                    setForkParentDraftId(null);
                    setNewRouteName('');
                    setNewAuthor('');
                    setNewRouteWaypoints([]);
                  }}
                  className="flex-1 text-[9px] font-black text-slate-500 uppercase tracking-widest py-3 rounded-lg hover:bg-slate-50 bg-slate-50/50 min-h-12"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSnapping || isCoolingDown || hasDuplicateRouteName || newRouteWaypoints.length < 2 || !newRouteName.trim() || !newAuthor.trim()}
                  className="flex-[2] md:flex-1 bg-indigo-600 text-white font-black py-3 rounded-lg text-[10px] uppercase tracking-widest shadow-lg disabled:opacity-50 active:scale-95 flex items-center justify-center gap-2 min-h-12"
                >
                  {isSnapping ? 'Snapping...' : isCoolingDown ? `Wait ${cooldownRemainingSec}s` : 'Publish'}
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
