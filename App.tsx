
import React, { useState, useEffect, useMemo } from 'react';
import JeepneyMap from './components/JeepneyMap';
import RouteSidebar from './components/RouteSidebar';
import { JeepneyRoute, Waypoint, GeminiAnalysis } from './types';
import { ROUTE_COLORS } from './constants';
import { apiService } from './services/apiService';
import { getSnappedPath } from './services/routingService';

const PUBLISH_COOLDOWN_MS = 10_000;
const NEARBY_ROUTE_RADIUS_M = 2_000;
const CONNECTING_ROUTE_RADIUS_M = 900;

type ThemeMode = 'auto' | 'light' | 'dark';
type SearchStatus = 'idle' | 'searching' | 'found' | 'empty' | 'error';

const JeepneyIcon = (props: { className?: string }) => (
  <svg className={props.className || "w-4 h-4"} fill="currentColor" viewBox="0 0 24 24">
    <path d="M4,16c0,0.88,0.39,1.67,1,2.22V20a1,1,0,0,0,1,1H7a1,1,0,0,0,1-1V19h8v1a1,1,0,0,0,1,1h1a1,1,0,0,0,1-1V18.22c0.61-0.55,1-1.34,1-2.22V6 c0-1.52-1.03-2.74-2.42-3.1L12,2L6.42,2.9C5.03,3.26,4,4.48,4,6V16z M18,11H6V6h12V11z M16.5,17A1.5,1.5,0,1,1,18,15.5A1.5,1.5,0,0,1,16.5,17 z M7.5,17A1.5,1.5,0,1,1,9,15.5A1.5,1.5,0,0,1,7.5,17z" />
  </svg>
);

const RouteSearchIcon = (props: { className?: string }) => (
  <svg className={props.className || "w-5 h-5"} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.3" d="M4 7h6m4 0h6M4 12h12M4 17h7m4 0h5" />
    <circle cx="12" cy="7" r="1.7" fill="currentColor" stroke="none" />
    <circle cx="13" cy="17" r="1.7" fill="currentColor" stroke="none" />
  </svg>
);

const CompassIcon = (props: { className?: string; rotation?: number }) => (
  <svg
    className={props.className || "w-5 h-5"}
    style={{ transform: `rotate(${props.rotation ?? 0}deg)` }}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" d="M12 3.5 16.5 20 12 17.5 7.5 20 12 3.5z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" d="M12 8.25v5.5" />
  </svg>
);

const SunIcon = (props: { className?: string }) => (
  <svg className={props.className || "w-4 h-4"} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="3.5" strokeWidth="2.2" />
    <path strokeLinecap="round" strokeWidth="2.2" d="M12 3.5v1.75M12 18.75v1.75M20.5 12h-1.75M5.25 12H3.5M18.01 5.99l-1.24 1.24M7.23 16.77l-1.24 1.24M18.01 18.01l-1.24-1.24M7.23 7.23 5.99 5.99" />
  </svg>
);

const MoonIcon = (props: { className?: string }) => (
  <svg className={props.className || "w-4 h-4"} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M20 14.2A7.5 7.5 0 0 1 9.8 4a8.5 8.5 0 1 0 10.2 10.2z" />
  </svg>
);

const AutoThemeIcon = (props: { className?: string }) => (
  <svg className={props.className || "w-4 h-4"} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M4 12a8 8 0 0 1 13.66-5.66M20 12a8 8 0 0 1-13.66 5.66" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M17.5 3.5v3.25h-3.25M6.5 20.5v-3.25h3.25" />
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

const getRouteDistance = (origin: Waypoint, route: JeepneyRoute) => {
  const distances = route.path.map(coord => getDistance(origin, coord));
  return distances.length ? Math.min(...distances) : Number.POSITIVE_INFINITY;
};

const getSortedRoutesByDistance = (origin: Waypoint, sourceRoutes: JeepneyRoute[]) =>
  sourceRoutes
    .map(route => ({ route, distance: getRouteDistance(origin, route) }))
    .sort((a, b) => a.distance - b.distance);

const getShortPlaceLabel = (displayName: string) =>
  displayName
    .split(',')
    .slice(0, 2)
    .map(part => part.trim())
    .filter(Boolean)
    .join(', ');

const getNearestRoutePoint = (origin: Waypoint, route: JeepneyRoute): { point: Waypoint; distance: number } | null => {
  const safePath = route.path.filter(coord => Number.isFinite(coord[0]) && Number.isFinite(coord[1]));
  if (!safePath.length) return null;

  const latScale = Math.cos(origin.lat * Math.PI / 180);
  const toXY = (point: Waypoint) => ({ x: point.lng * latScale, y: point.lat });
  const fromCoord = (coord: [number, number]): Waypoint => ({ lat: coord[0], lng: coord[1] });
  const originXY = toXY(origin);
  let nearest = fromCoord(safePath[0]);
  let nearestDistance = getDistance(origin, safePath[0]);

  for (let i = 0; i < safePath.length - 1; i += 1) {
    const start = fromCoord(safePath[i]);
    const end = fromCoord(safePath[i + 1]);
    const a = toXY(start);
    const b = toXY(end);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((originXY.x - a.x) * dx + (originXY.y - a.y) * dy) / lengthSquared));
    const candidate = {
      lat: start.lat + (end.lat - start.lat) * t,
      lng: start.lng + (end.lng - start.lng) * t,
    };
    const distance = getDistance(origin, [candidate.lat, candidate.lng]);

    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }

  return { point: nearest, distance: nearestDistance };
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [focusedPoint, setFocusedPoint] = useState<Waypoint | null>(null);
  const [focusedPointSource, setFocusedPointSource] = useState<'map' | 'search' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchStatus, setSearchStatus] = useState<SearchStatus>('idle');
  const [searchLabel, setSearchLabel] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<'checking' | 'granted' | 'denied' | 'unsupported'>('checking');
  const [isHeadingMode, setIsHeadingMode] = useState(false);
  const [heading, setHeading] = useState(0);
  const [headingStatus, setHeadingStatus] = useState<'idle' | 'active' | 'denied' | 'unsupported'>('idle');
  const [centerOnUserLocationRequest, setCenterOnUserLocationRequest] = useState(0);
  const [themeMode, setThemeMode] = useState<ThemeMode>('auto');
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [isBackendConnected, setIsBackendConnected] = useState(false);
  const [showConnectionStatus, setShowConnectionStatus] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [nowTick, setNowTick] = useState(Date.now());
  const connectionTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const [votedIds, setVotedIds] = useState<Record<string, number>>(() => {
    try {
      const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('vibe_user_votes') : null;
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Persist votes to localStorage whenever they change
  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('vibe_user_votes', JSON.stringify(votedIds));
  }, [votedIds]);

  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const updateSystemTheme = () => setSystemTheme(media.matches ? 'dark' : 'light');
    updateSystemTheme();
    media.addEventListener('change', updateSystemTheme);
    return () => media.removeEventListener('change', updateSystemTheme);
  }, []);

  // Subscribe to backend connection status changes
  useEffect(() => {
    const unsubscribe = apiService.onConnectionStatusChange((connected) => {
      setIsBackendConnected(connected);
      
      // Clear existing timeout
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
      
      if (connected) {
        // If reconnected, show status briefly then hide
        setShowConnectionStatus(true);
        connectionTimeoutRef.current = setTimeout(() => {
          setShowConnectionStatus(false);
        }, 2000); // Hide after 2 seconds of being connected
      } else {
        // If disconnected, show immediately and keep showing
        setShowConnectionStatus(true);
      }
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
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
    };
  }, []);

  const requestUserLocation = () => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      setLocationStatus('checking');
      navigator.geolocation.getCurrentPosition(
        pos => {
          setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setLocationStatus('granted');
          if (isCompactViewport()) setIsSidebarOpen(true);
        },
        err => {
          setLocationStatus('denied');
          console.warn("Location denied");
        }
      );
    } else {
      setLocationStatus('unsupported');
    }
  };

  useEffect(() => {
    loadRoutes();
    requestUserLocation();
  }, []);

  useEffect(() => {
    const query = searchQuery.trim();

    if (query.length < 3) {
      if (focusedPointSource === 'search') {
        setFocusedPoint(null);
        setFocusedPointSource(null);
      }
      setSearchStatus('idle');
      setSearchLabel(null);
      return;
    }

    setSearchStatus('searching');
    const controller = new AbortController();
    const debounce = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          format: 'jsonv2',
          limit: '1',
          countrycodes: 'ph',
          addressdetails: '1',
          q: `${query}, Metro Manila, Philippines`,
        });

        const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });

        if (!response.ok) throw new Error(`Geocode failed: ${response.status}`);
        const results = await response.json();
        const match = Array.isArray(results) ? results[0] : null;

        if (!match) {
          setSearchStatus('empty');
          setSearchLabel(null);
          if (focusedPointSource === 'search') {
            setFocusedPoint(null);
            setFocusedPointSource(null);
          }
          return;
        }

        const point = {
          lat: Number(match.lat),
          lng: Number(match.lon),
        };

        if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
          setSearchStatus('empty');
          return;
        }

        setFocusedPoint(point);
        setFocusedPointSource('search');
        setSearchLabel(getShortPlaceLabel(match.display_name || query));
        setSearchStatus('found');
        if (isCompactViewport()) setIsSidebarOpen(true);
      } catch (error) {
        if ((error as DOMException).name === 'AbortError') return;
        setSearchStatus('error');
      }
    }, 650);

    return () => {
      controller.abort();
      clearTimeout(debounce);
    };
  }, [searchQuery]);

  useEffect(() => {
    if (!isHeadingMode || typeof window === 'undefined') return;

    const handleOrientation = (event: DeviceOrientationEvent & { webkitCompassHeading?: number }) => {
      const nextHeading =
        typeof event.webkitCompassHeading === 'number'
          ? event.webkitCompassHeading
          : typeof event.alpha === 'number'
            ? 360 - event.alpha
            : null;

      if (nextHeading === null || !Number.isFinite(nextHeading)) return;
      setHeading((nextHeading + 360) % 360);
      setHeadingStatus('active');
    };

    window.addEventListener('deviceorientationabsolute', handleOrientation as EventListener, true);
    window.addEventListener('deviceorientation', handleOrientation as EventListener, true);

    return () => {
      window.removeEventListener('deviceorientationabsolute', handleOrientation as EventListener, true);
      window.removeEventListener('deviceorientation', handleOrientation as EventListener, true);
    };
  }, [isHeadingMode]);

  const loadRoutes = async () => {
    const data = await apiService.getRoutes();
    setRoutes(data);
  };

  const cloneWaypoints = (waypoints: Waypoint[]) => waypoints.map(w => ({ ...w }));
  const isCompactViewport = () => typeof window !== 'undefined' && window.innerWidth < 1024;
  const cooldownRemainingSec = Math.max(0, Math.ceil((cooldownUntil - nowTick) / 1000));
  const isCoolingDown = cooldownRemainingSec > 0;
  const hasDuplicateRouteName = useMemo(() => {
    if (editingId || !newRouteName.trim()) return false;
    const normalizedDraftName = normalizeRouteName(newRouteName);
    return routes.some(route => normalizeRouteName(route.name) === normalizedDraftName);
  }, [editingId, newRouteName, routes]);

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
    setPublishError(null);
    if (!newRouteName || !newAuthor || newRouteWaypoints.length < 2) return;
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
    const route: JeepneyRoute = {
      id: editingId || `route-${now}`,
      name: newRouteName,
      // Refinements keep original ownership; forks create a new contributor.
      author: existingRoute?.author ?? newAuthor,
      waypoints: newRouteWaypoints,
      path: newRoutePath,
      color: ROUTE_COLORS[Math.floor(Math.random() * ROUTE_COLORS.length)],
      score: existingRoute?.score ?? 1,
      votes: existingRoute?.votes ?? 1,
      createdAt: existingRoute?.createdAt ?? now,
      lastRefinedAt: now
    };

    const saved = await apiService.saveRoute(route);
    setRoutes(prev => editingId ? prev.map(r => r.id === saved.id ? saved : r) : [...prev, saved]);
    setCooldownUntil(Date.now() + PUBLISH_COOLDOWN_MS);
    setPublishError(null);
    setIsAddingRoute(false);
    setActiveRoute(saved);
    setEditingId(null);
    setNewRouteName('');
    setNewAuthor('');
    setNewRouteWaypoints([]);
  };

  const startRefine = (route: JeepneyRoute) => {
    setPublishError(null);
    setIsAddingRoute(true);
    setIsSidebarOpen(false);
    setEditingId(route.id);
    setNewRouteName(route.name);
    setNewAuthor(route.author);
    setNewRouteWaypoints(cloneWaypoints(route.waypoints));
    setActiveRoute(null);
    setFocusedPoint(null);
    setFocusedPointSource(null);
  };

  const startFork = (route: JeepneyRoute) => {
    setPublishError(null);
    setIsAddingRoute(true);
    setIsSidebarOpen(false);
    setEditingId(null);
    setNewRouteName(route.name);
    setNewAuthor('');
    setNewRouteWaypoints(cloneWaypoints(route.waypoints));
    setActiveRoute(null);
    setFocusedPoint(null);
    setFocusedPointSource(null);
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

  const selectRoute = (route: JeepneyRoute) => {
    setActiveRoute(route);
    if (isCompactViewport()) setIsSidebarOpen(false);
  };

  const returnToRouteList = () => {
    setActiveRoute(null);
    if (isCompactViewport()) setIsSidebarOpen(true);
  };

  const clearFocusedFilter = () => {
    setFocusedPoint(null);
    setFocusedPointSource(null);
    setSearchQuery('');
    setSearchStatus('idle');
    setSearchLabel(null);
  };

  const toggleHeadingMode = async () => {
    if (isHeadingMode) {
      setIsHeadingMode(false);
      setHeading(0);
      setHeadingStatus('idle');
      return;
    }

    if (locationStatus !== 'granted' || !userLocation) {
      return;
    }

    if (typeof window === 'undefined' || typeof window.DeviceOrientationEvent === 'undefined') {
      setHeadingStatus('unsupported');
      return;
    }

    const orientationEvent = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<PermissionState>;
    };

    try {
      if (typeof orientationEvent.requestPermission === 'function') {
        const permission = await orientationEvent.requestPermission();
        if (permission !== 'granted') {
          setHeadingStatus('denied');
          return;
        }
      }

      setHeadingStatus('active');
      setIsHeadingMode(true);
      setCenterOnUserLocationRequest(value => value + 1);
    } catch {
      setHeadingStatus('denied');
    }
  };

  const filteredRoutes = useMemo(() => {
    if (focusedPoint) {
      const threshold = focusedPointSource === 'search' ? CONNECTING_ROUTE_RADIUS_M : 120;
      const sortedRoutes = getSortedRoutesByDistance(focusedPoint, routes);
      const nearbyRoutes = sortedRoutes
        .filter(({ distance }) => distance <= threshold)
        .map(({ route }) => route);

      if (nearbyRoutes.length || focusedPointSource !== 'search') return nearbyRoutes;
      return sortedRoutes.slice(0, 5).map(({ route }) => route);
    }

    if (userLocation) {
      return getSortedRoutesByDistance(userLocation, routes)
        .filter(({ distance }) => distance <= NEARBY_ROUTE_RADIUS_M)
        .map(({ route }) => route);
    }

    return routes;
  }, [routes, focusedPoint, focusedPointSource, userLocation]);

  const isShowingNearbyRoutes = !!userLocation && !focusedPoint;

  const visibleRoutes = useMemo(() => {
    if (filteredRoutes.length || focusedPoint || !userLocation) return filteredRoutes;
    return getSortedRoutesByDistance(userLocation, routes).map(({ route }) => route);
  }, [filteredRoutes, focusedPoint, routes, userLocation]);

  const isPlaceSearchActive = focusedPointSource === 'search' && searchQuery.trim().length >= 3;
  const canShowNearbyRoutes = locationStatus === 'granted' || isPlaceSearchActive;
  const canUseHeadingMode = locationStatus === 'granted' && !!userLocation;
  const resolvedTheme = themeMode === 'auto' ? systemTheme : themeMode;
  const routeGuideOrigin = userLocation ?? (focusedPointSource === 'search' ? focusedPoint : null);
  const routeGuideTarget = activeRoute && routeGuideOrigin ? getNearestRoutePoint(routeGuideOrigin, activeRoute) : null;
  const routeGuide = routeGuideTarget && routeGuideOrigin
    ? { from: routeGuideOrigin, to: routeGuideTarget.point }
    : null;
  const routeGuideDistance = routeGuideTarget ? Math.round(routeGuideTarget.distance) : null;

  return (
    <div className={`flex h-dvh w-full font-sans overflow-hidden relative text-sm antialiased ${
      resolvedTheme === 'dark' ? 'bg-slate-950 text-slate-50' : 'bg-[#f6f7fb] text-slate-950'
    }`}>
      <RouteSidebar 
        routes={canShowNearbyRoutes ? visibleRoutes : []} 
        totalRoutesCount={routes.length}
        activeRoute={activeRoute} 
        locationStatus={locationStatus}
        isShowingNearbyRoutes={canShowNearbyRoutes}
        searchQuery={searchQuery}
        searchStatus={searchStatus}
        searchLabel={searchLabel}
        isPlaceSearchActive={isPlaceSearchActive}
        onRequestLocation={requestUserLocation}
        onSearchQueryChange={setSearchQuery}
        onSelectRoute={selectRoute}
        onAddRouteClick={() => { 
          setPublishError(null);
          setIsAddingRoute(true); 
          setIsSidebarOpen(false);
          setActiveRoute(null); 
          setEditingId(null); 
          setNewRouteName(''); 
          setNewAuthor(''); 
          setNewRouteWaypoints([]); 
          setFocusedPoint(null); 
          setFocusedPointSource(null);
        }}
        isAddingRoute={isAddingRoute}
        isOpen={isSidebarOpen} 
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        onClearFilter={clearFocusedFilter}
        isFiltered={!!focusedPoint}
      />

      <main className="flex-1 relative overflow-hidden">
        <header className="fixed top-0 left-0 right-0 lg:left-80 z-[1200] px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pointer-events-none">
          <div className="flex items-start justify-end gap-3">
            <div className="pointer-events-auto flex items-center gap-2">
              {!isAddingRoute && !activeRoute && (
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  className="lg:hidden h-12 w-12 rounded-full bg-white/90 text-slate-950 shadow-[0_10px_28px_rgba(15,23,42,0.16)] border border-white/80 backdrop-blur-md active:scale-95 transition-transform flex items-center justify-center"
                  aria-label="Open route search"
                >
                  <RouteSearchIcon className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Backend Connection Status Indicator - Only show when offline or just reconnected */}
        {showConnectionStatus && (
          <div className={`fixed top-[calc(env(safe-area-inset-top)+4.25rem)] left-4 right-4 md:left-1/2 md:right-auto md:-translate-x-1/2 md:min-w-72 z-[4000] flex items-center justify-center gap-2 px-4 py-2 rounded-lg backdrop-blur-md border border-white/60 shadow-lg animate-in fade-in duration-300 ${
            isBackendConnected 
              ? 'bg-emerald-600/95 text-white' 
              : 'bg-white/95 text-slate-950'
          }`}>
            <div className={`w-2.5 h-2.5 rounded-full ${isBackendConnected ? 'bg-white animate-pulse' : 'bg-rose-500'}`}></div>
            <p className="text-[11px] font-black uppercase tracking-wider">
              {isBackendConnected ? 'Backend reconnected' : 'Backend offline'}
            </p>
          </div>
        )}

        <JeepneyMap 
          routes={routes} activeRoute={activeRoute} isAddingRoute={isAddingRoute}
          onWaypointAdd={p => setNewRouteWaypoints(prev => [...prev, p])}
          onWaypointUpdate={(i, p) => setNewRouteWaypoints(prev => { const n = [...prev]; n[i] = p; return n; })}
          onRouteSelect={selectRoute} newRouteWaypoints={newRouteWaypoints} newRoutePath={newRoutePath}
          focusedPoint={focusedPoint} userLocation={userLocation}
          centerOnUserLocationRequest={centerOnUserLocationRequest}
          mapTheme={resolvedTheme} routeGuide={routeGuide}
        />

        {!isAddingRoute && !activeRoute && (
          <div className={`fixed left-4 lg:left-[calc(20rem+1rem)] bottom-[calc(env(safe-area-inset-bottom)+2.75rem)] z-[1200] h-11 rounded-full bg-white/90 text-slate-950 shadow-[0_10px_28px_rgba(15,23,42,0.16)] border border-white/80 backdrop-blur-md p-1 items-center gap-1 ${
            isSidebarOpen ? 'hidden lg:flex' : 'flex'
          }`}>
            {(['light', 'dark', 'auto'] as ThemeMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setThemeMode(mode)}
                className={`h-9 w-9 rounded-full transition-colors active:scale-95 flex items-center justify-center ${
                  themeMode === mode ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-100'
                }`}
                aria-label={`Use ${mode} theme`}
              >
                {mode === 'light' ? <SunIcon className="h-4 w-4" /> : mode === 'dark' ? <MoonIcon className="h-4 w-4" /> : <AutoThemeIcon className="h-4 w-4" />}
              </button>
            ))}
          </div>
        )}

        {!isAddingRoute && !activeRoute && (
          <button
            onClick={toggleHeadingMode}
            disabled={!canUseHeadingMode}
            className={`fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+2.75rem)] z-[1200] h-11 w-11 rounded-full shadow-[0_10px_28px_rgba(15,23,42,0.16)] border backdrop-blur-md active:scale-95 transition-all items-center justify-center ${
              isSidebarOpen ? 'hidden lg:flex' : 'flex'
            } ${
              !canUseHeadingMode
                ? 'bg-slate-100/80 text-slate-400 border-white/70 opacity-70 cursor-not-allowed shadow-none'
                : isHeadingMode
                ? 'bg-slate-950 text-white border-slate-900'
                : 'bg-white/90 text-slate-950 border-white/80'
            }`}
            aria-label={canUseHeadingMode ? 'Toggle heading mode' : 'Location required for heading mode'}
            title={
              !canUseHeadingMode
                ? 'Enable location to use heading mode'
                : headingStatus === 'unsupported'
                ? 'Device heading unavailable'
                : headingStatus === 'denied'
                  ? 'Motion permission denied'
                  : 'Toggle heading mode'
            }
          >
            <CompassIcon className="h-[18px] w-[18px] transition-transform" rotation={isHeadingMode ? heading : 0} />
          </button>
        )}

        {/* Route Info Popup - Compact & SEO Friendly */}
        {activeRoute && !isAddingRoute && (
          <div className="fixed left-0 right-0 bottom-0 md:left-auto md:right-4 md:bottom-4 md:w-[360px] z-[2002] bg-white/95 backdrop-blur-md rounded-t-lg md:rounded-lg shadow-2xl border border-white/80 overflow-hidden max-h-[82dvh] flex flex-col animate-in slide-in-from-bottom-2 duration-300 pb-[env(safe-area-inset-bottom)]">
            <header className="p-4 text-slate-950 flex items-start gap-3 border-b border-slate-100">
              <button 
                onClick={returnToRouteList} 
                className="h-11 w-11 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all flex-shrink-0 flex items-center justify-center active:scale-95"
                aria-label="Back to routes"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.6" d="M15 18l-6-6 6-6"/></svg>
              </button>
              <div className="flex-1 truncate">
                <h2 className="text-lg font-black leading-tight truncate">{activeRoute.name}</h2>
                <p className="text-xs font-bold text-slate-500 truncate mt-1">Posted by {activeRoute.author}</p>
              </div>
              <div className={`px-2.5 py-1 rounded-full text-xs font-black ${activeRoute.score >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                {activeRoute.score > 0 ? `+${activeRoute.score}` : activeRoute.score}
              </div>
            </header>
            
            <div className="p-4 overflow-y-auto space-y-4 scrollbar-hide flex-1">
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => handleVote(1)}
                  className={`flex-1 min-h-12 flex items-center justify-center gap-2 rounded-lg border transition-all font-black text-xs uppercase tracking-wider active:scale-95 ${
                    votedIds[activeRoute.id] === 1 
                      ? 'bg-emerald-600 text-white border-emerald-600' 
                      : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                  }`}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/></svg>
                  Like
                </button>
                <button 
                  onClick={() => handleVote(-1)}
                  className={`flex-1 min-h-12 flex items-center justify-center gap-2 rounded-lg border transition-all font-black text-xs uppercase tracking-wider active:scale-95 ${
                    votedIds[activeRoute.id] === -1 
                      ? 'bg-rose-600 text-white border-rose-600' 
                      : 'bg-rose-50 text-rose-700 border-rose-100'
                  }`}
                >
                  <svg className="w-4 h-4 transform rotate-180" fill="currentColor" viewBox="0 0 24 24"><path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/></svg>
                  Dislike
                </button>
              </div>

              <div className={`p-3 rounded-lg border ${
                routeGuide
                  ? 'bg-sky-50 border-sky-100 text-slate-900'
                  : 'bg-amber-50 border-amber-100 text-amber-900'
              }`}>
                <p className="text-[11px] font-black uppercase tracking-wider">
                  {routeGuide ? 'Waypoint guide active' : 'Waypoint guide needs location'}
                </p>
                <p className="mt-1 text-xs font-semibold leading-snug">
                  {routeGuide && routeGuideDistance !== null
                    ? `${routeGuideDistance}m to the nearest point on this route. Follow the dashed line to meet the jeepney path.`
                    : 'Enable location to draw a guide from you to the nearest point on this selected route.'}
                </p>
              </div>

              {!analysis && !isAnalyzing ? (
                <button 
                  onClick={handleAnalyze}
                  className="w-full min-h-12 bg-slate-950 text-white font-black rounded-lg text-xs uppercase tracking-wider shadow-lg hover:bg-black transition-all flex items-center justify-center gap-2 active:scale-[0.99]"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                  Route intel
                </button>
              ) : isAnalyzing ? (
                <div className="flex flex-col items-center py-3 space-y-2 animate-pulse">
                  <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Checking landmarks...</p>
                </div>
              ) : analysis && (
                <div className="space-y-2 animate-in fade-in slide-in-from-bottom-1">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <p className="text-sm text-slate-800 leading-snug font-medium">"{analysis.guide}"</p>
                  </div>
                  {analysis.landmarks.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {analysis.landmarks.slice(0, 3).map((l, i) => (
                        <span key={i} className="px-2 py-1 bg-white text-slate-700 text-[11px] font-bold rounded-full border border-slate-200">{l}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 space-y-1.5">
                <p className="text-[11px] text-slate-600 font-bold uppercase tracking-wider">
                  Created: <span className="text-indigo-950">{formatRouteDate(activeRoute.createdAt)}</span>
                </p>
                <p className="text-[11px] text-slate-600 font-bold uppercase tracking-wider">
                  Refined: <span className="text-indigo-950">{formatRouteDate(activeRoute.lastRefinedAt)}</span>
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => startRefine(activeRoute)}
                  className="min-h-12 bg-slate-100 text-slate-950 font-black rounded-lg text-xs uppercase tracking-wider border border-slate-200 hover:bg-slate-200 active:scale-95"
                >
                  Refine Path
                </button>
                <button
                  onClick={() => startFork(activeRoute)}
                  className="min-h-12 bg-amber-300 text-slate-950 font-black rounded-lg text-xs uppercase tracking-wider border border-amber-400 hover:bg-amber-200 active:scale-95"
                >
                  Fork Route
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Route Drawing/Editing UI - Compact and Non-overflowing */}
        {isAddingRoute && (
          <>
            <div className="fixed top-[calc(env(safe-area-inset-top)+0.75rem)] left-3 right-3 md:left-auto md:right-4 md:w-[360px] z-[1000] bg-white rounded-lg shadow-xl p-4 border border-white/80 animate-in fade-in duration-200 max-h-[42dvh] overflow-y-auto">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-slate-950 text-amber-300 rounded-lg flex items-center justify-center">
                   <JeepneyIcon className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-slate-950 uppercase tracking-wider">{editingId ? 'Refine Path' : 'Map New Route'}</h2>
                  <p className="text-xs text-slate-500 font-semibold">Tap the map to add route points.</p>
                </div>
              </div>
              <div className="space-y-2.5">
                <input 
                  value={newRouteName} 
                  onChange={e => { setNewRouteName(e.target.value); setPublishError(null); }} 
                  placeholder="Route (e.g. PITX - Monumento)" 
                  className="w-full min-h-12 bg-slate-50 border border-slate-200 rounded-lg px-4 text-sm font-bold text-slate-950 outline-none focus:border-slate-950"
                />
                <input 
                  value={newAuthor} 
                  onChange={e => { setNewAuthor(e.target.value); setPublishError(null); }} 
                  placeholder="Contributor Name" 
                  disabled={!!editingId}
                  className={`w-full min-h-12 border rounded-lg px-4 text-sm font-bold text-slate-950 outline-none ${
                    editingId
                      ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                      : 'bg-slate-50 border-slate-200 focus:border-slate-950'
                  }`}
                />
                {editingId && (
                  <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">
                    Contributor is locked while refining. Use "Fork Route" to publish under your name.
                  </p>
                )}
                {hasDuplicateRouteName && (
                  <p className="text-[11px] text-rose-600 font-bold uppercase tracking-wider">
                    Route name already exists.
                  </p>
                )}
                {isCoolingDown && (
                  <p className="text-[11px] text-amber-700 font-bold uppercase tracking-wider">
                    Publish cooldown: {cooldownRemainingSec}s
                  </p>
                )}
                {publishError && (
                  <p className="text-[11px] text-rose-700 font-bold uppercase tracking-wider">
                    {publishError}
                  </p>
                )}
              </div>
            </div>

            <div className="fixed bottom-0 left-0 right-0 md:left-auto md:w-[360px] md:bottom-4 md:right-4 z-[1000] flex flex-col gap-2 p-3 md:p-0 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
              <div className="bg-slate-950 text-white px-4 py-3 rounded-lg flex justify-between items-center shadow-lg border border-slate-800">
                <p className="text-xs font-black uppercase tracking-wider text-slate-300">
                  <span className="text-amber-300">{newRouteWaypoints.length}</span> Points
                </p>
                <button 
                  onClick={() => setNewRouteWaypoints(p => p.slice(0, -1))} 
                  className="h-10 px-4 text-xs font-black bg-white/10 hover:bg-white/20 rounded-lg border border-white/20 active:scale-95 disabled:opacity-40"
                  disabled={newRouteWaypoints.length === 0}
                >
                  Undo
                </button>
              </div>

              <div className="bg-white p-2 rounded-lg shadow-2xl border border-white/80 flex flex-row gap-2">
                <button 
                  onClick={() => { setPublishError(null); setIsAddingRoute(false); setEditingId(null); setNewRouteName(''); setNewAuthor(''); setNewRouteWaypoints([]); }} 
                  className="flex-1 text-xs font-black text-slate-600 uppercase tracking-wider rounded-lg hover:bg-slate-50 bg-slate-50 min-h-14 active:scale-95"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSave} 
                  disabled={isSnapping || isCoolingDown || hasDuplicateRouteName || newRouteWaypoints.length < 2 || !newRouteName || !newAuthor} 
                  className="flex-[1.5] bg-amber-300 text-slate-950 font-black rounded-lg text-xs uppercase tracking-wider shadow-lg disabled:opacity-50 active:scale-95 flex items-center justify-center gap-2 min-h-14"
                >
                  {isSnapping ? 'Snapping...' : isCoolingDown ? `Wait ${cooldownRemainingSec}s` : 'Publish'}
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
