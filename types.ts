
export interface Waypoint {
  lat: number;
  lng: number;
}

export type SyncStatus = 'synced' | 'pending' | 'error';

export interface JeepneyRoute {
  id: string;
  name: string;
  author: string;
  waypoints: Waypoint[];
  path: [number, number][]; 
  color: string;
  score: number;
  votes: number;
  createdAt: number;
  lastRefinedAt: number;
  syncStatus?: SyncStatus;
}

export interface GeminiAnalysis {
  guide: string;
  landmarks: string[];
  tips: string[];
}
