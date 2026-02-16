const LEGACY_BACKEND_API = 'https://rhino-primary-fish.ngrok-free.app/api';

export const ENV = {
  // Backend API endpoint loaded at build-time from Vite env.
  BACKEND_API: import.meta.env.VITE_BACKEND_API || LEGACY_BACKEND_API || 'http://localhost:3001/api'
};
