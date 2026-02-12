import { JeepneyRoute, GeminiAnalysis } from '../types';
import { ENV } from '../env';

const API_BASE = ENV.BACKEND_API;
const LOCAL_CACHE_KEY = 'open_route_store_v2';

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
      return data;
    } catch (error) {
      console.error("Fetch failed. If this is a CORS error, ensure your backend has 'cors' middleware installed and configured to allow the 'ngrok-skip-browser-warning' header.", error);
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
        guide: "Commuter guide unavailable. Ensure your backend allows CORS and the 'ngrok-skip-browser-warning' header.", 
        landmarks: [], 
        tips: [] 
      };
    }
  }
};