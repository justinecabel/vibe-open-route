
import { Waypoint } from "../types";

/**
 * Fetches a road-aligned path between multiple waypoints using OSRM.
 */
export const getSnappedPath = async (waypoints: Waypoint[]): Promise<[number, number][]> => {
  if (waypoints.length < 2) return waypoints.map(w => [w.lat, w.lng]);

  const coordinates = waypoints.map(w => `${w.lng},${w.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      console.warn("OSRM could not find a road path, falling back to straight lines.");
      return waypoints.map(w => [w.lat, w.lng]);
    }

    // OSRM returns [lng, lat], Leaflet needs [lat, lng]
    return data.routes[0].geometry.coordinates.map((coord: number[]) => [coord[1], coord[0]]);
  } catch (error) {
    console.error("Routing Error:", error);
    return waypoints.map(w => [w.lat, w.lng]);
  }
};
