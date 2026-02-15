import { JeepneyRoute, GeminiAnalysis } from '../types';
import { ENV } from '../env';

const API_BASE = ENV.BACKEND_API;
const LOCAL_CACHE_KEY = 'open_route_store_v2';

// Connection status tracking with debounce
let isBackendConnected = true; // Start as true to avoid false offline on initial load
let syncInProgressCallbacks: ((connected: boolean) => void)[] = [];
let failureCount = 0;

/**
 * Common headers for all API requests.
 * 'ngrok-skip-browser-warning' is required to bypass ngrok's interstitial page.
 * 'Accept' header helps ensure the server knows we expect JSON.
 */
const getHeaders = (extraHeaders: Record<string, string> = {}) => {
  return {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true', 
    ...extraHeaders,
  };
};

const getLocalData = (): JeepneyRoute[] => {
  try {
    const data = localStorage.getItem(LOCAL_CACHE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

const saveLocalData = (routes: JeepneyRoute[]) => {
  localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(routes));
};

/**
 * Check if backend is connected and update connection status
 */
const checkBackendConnection = async (): Promise<boolean> => {
  try {
    const res = await fetch(`${API_BASE}/routes`, {
      method: 'GET',
      headers: getHeaders(),
      mode: 'cors',
      cache: 'no-cache',
      signal: AbortSignal.timeout(3000) // 3 second timeout
    });
    const connected = res.ok;
    
    // Successful response resets failure count
    if (connected) {
      failureCount = 0;
      if (!isBackendConnected) {
        isBackendConnected = true;
        // Notify listeners of connection status change
        syncInProgressCallbacks.forEach(cb => cb(true));
        // Sync pending routes when reconnected
        syncPendingRoutes();
      }
    }
    
    return connected;
  } catch (error) {
    // Increment failure count, only mark as disconnected after 2 consecutive failures
    failureCount++;
    
    if (failureCount >= 2 && isBackendConnected) {
      isBackendConnected = false;
      // Notify listeners of connection status change
      syncInProgressCallbacks.forEach(cb => cb(false));
    }
    
    return false;
  }
};

/**
 * Sync all pending routes to the backend
 */
const syncPendingRoutes = async () => {
  const routes = getLocalData();
  const pendingRoutes = routes.filter(r => r.syncStatus === 'pending');
  
  for (const route of pendingRoutes) {
    try {
      const res = await fetch(`${API_BASE}/routes`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(route),
        mode: 'cors'
      });
      if (res.ok) {
        const synced = { ...(await res.json()), syncStatus: 'synced' as const };
        const updated = routes.map(r => r.id === synced.id ? synced : r);
        saveLocalData(updated);
      }
    } catch (error) {
      console.error(`Failed to sync route ${route.id}:`, error);
    }
  }
};

/**
 * Subscribe to backend connection status changes
 */
const onConnectionStatusChange = (callback: (connected: boolean) => void) => {
  syncInProgressCallbacks.push(callback);
  return () => {
    syncInProgressCallbacks = syncInProgressCallbacks.filter(cb => cb !== callback);
  };
};

/**
 * Get current backend connection status
 */
const getBackendStatus = (): boolean => {
  return isBackendConnected;
};

export const apiService = {
  async getRoutes(): Promise<JeepneyRoute[]> {
    try {
      const res = await fetch(`${API_BASE}/routes`, {
        method: 'GET',
        headers: getHeaders(),
        mode: 'cors',
        cache: 'no-cache'
      });
      
      if (!res.ok) {
        console.error(`Backend Error: ${res.status} ${res.statusText}`);
        throw new Error(`API unreachable: ${res.status}`);
      }
      
      const data = await res.json();
      saveLocalData(data);
      isBackendConnected = true;
      return data;
    } catch (error) {
      console.error("Fetch failed. If this is a CORS error, ensure your backend has 'cors' middleware installed and configured to allow the 'ngrok-skip-browser-warning' header.", error);
      isBackendConnected = false;
      return getLocalData();
    }
  },

  async saveRoute(route: JeepneyRoute): Promise<JeepneyRoute> {
    const localRoutes = getLocalData();
    const pendingRoute = { ...route, syncStatus: 'pending' as const };
    saveLocalData([...localRoutes.filter(r => r.id !== route.id), pendingRoute]);

    try {
      const res = await fetch(`${API_BASE}/routes`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(route),
        mode: 'cors'
      });
      if (!res.ok) throw new Error(`Sync failed: ${res.status}`);
      const synced = { ...(await res.json()), syncStatus: 'synced' as const };
      saveLocalData([...getLocalData().filter(r => r.id !== synced.id), synced]);
      return synced;
    } catch (error) {
      console.error("Failed to save route to backend:", error);
      return pendingRoute;
    }
  },

  async voteRoute(id: string, delta: number): Promise<JeepneyRoute> {
    try {
      const res = await fetch(`${API_BASE}/routes/${id}/vote`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ delta }),
        mode: 'cors'
      });
      if (!res.ok) throw new Error(`Vote failed: ${res.status}`);
      return await res.json();
    } catch (error) {
      const cache = getLocalData();
      const idx = cache.findIndex(r => r.id === id);
      if (idx > -1) {
        cache[idx].score += delta;
        saveLocalData(cache);
        return cache[idx];
      }
      throw error;
    }
  },

  async analyzeRoute(routeName: string): Promise<GeminiAnalysis> {
    try {
      const res = await fetch(`${API_BASE}/analyze`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ routeName }),
        mode: 'cors'
      });
      if (!res.ok) throw new Error(`Analysis failed: ${res.status}`);
      return await res.json();
    } catch (e) {
      console.error("AI Analysis error:", e);
      return { 
        guide: "Client ready. Analysis service unavailable.", 
        landmarks: [], 
        tips: [] 
      };
    }
  },

  // Connection monitoring
  checkBackendConnection,
  onConnectionStatusChange,
  getBackendStatus,
  syncPendingRoutes
};