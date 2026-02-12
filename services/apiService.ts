import { JeepneyRoute, GeminiAnalysis } from '../types';
import { ENV } from '../env';

const API_BASE = ENV.BACKEND_API;
const LOCAL_CACHE_KEY = 'open_route_store_v2';

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
      const res = await fetch(`${API_BASE}/routes`);
      if (!res.ok) throw new Error('API unreachable');
      const data = await res.json();
      saveLocalData(data);
      return data;
    } catch (error) {
      console.warn("Backend unavailable, using local cache.");
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(route)
      });
      if (!res.ok) throw new Error('Sync failed');
      const synced = { ...(await res.json()), syncStatus: 'synced' as const };
      saveLocalData([...getLocalData().filter(r => r.id !== synced.id), synced]);
      return synced;
    } catch (error) {
      return pendingRoute;
    }
  },

  async voteRoute(id: string, delta: number): Promise<JeepneyRoute> {
    try {
      const res = await fetch(`${API_BASE}/routes/${id}/vote`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta })
      });
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routeName })
      });
      return await res.json();
    } catch (e) {
      return { guide: "Commuter guide unavailable offline.", landmarks: [], tips: [] };
    }
  }
};