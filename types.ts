
export interface Waypoint {
  lat: number;
  lng: number;
}

export type SyncStatus = 'synced' | 'pending' | 'error';

export interface RouteRefinement {
  id: string;
  contributor: string;
  createdAt: number;
  score: number;
  votes: number;
}

export interface JeepneyRoute {
  id: string;
  name: string;
  author: string;
  parentRouteId?: string;
  waypoints: Waypoint[];
  path: [number, number][];
  color: string;
  score: number;
  votes: number;
  createdAt: number;
  lastRefinedAt: number;
  refinementHistory: RouteRefinement[];
  activeRefinementId?: string;
  syncStatus?: SyncStatus;
}

export interface GeminiAnalysis {
  guide: string;
  landmarks: string[];
  tips: string[];
}
