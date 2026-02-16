
import React, { useEffect, useRef, useState } from 'react';
import { JeepneyRoute, Waypoint } from '../types';
import L from 'leaflet';

interface JeepneyMapProps {
  routes: JeepneyRoute[];
  activeRoute: JeepneyRoute | null;
  isAddingRoute: boolean;
  onWaypointAdd: (point: Waypoint) => void;
  onWaypointUpdate: (index: number, point: Waypoint) => void;
  onMapClick: (point: Waypoint) => void;
  newRouteWaypoints: Waypoint[];
  newRoutePath: [number, number][];
  focusedPoint: Waypoint | null;
  userLocation: Waypoint | null;
}

const MIN_ZOOM_FOR_WAYPOINTS = 15;

const JeepneyMap: React.FC<JeepneyMapProps> = ({ 
  routes, 
  activeRoute, 
  isAddingRoute, 
  onWaypointAdd,
  onWaypointUpdate,
  onMapClick,
  newRouteWaypoints,
  newRoutePath,
  focusedPoint,
  userLocation
}) => {
  const mapRef = useRef<L.Map | null>(null);
  const routeLayersRef = useRef<{ [key: string]: L.LayerGroup }>({});
  const editMarkerRef = useRef<L.Marker[]>([]);
  const newRoutePolylineRef = useRef<L.Polyline | null>(null);
  const focusMarkerRef = useRef<L.Marker | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const [currentZoom, setCurrentZoom] = useState(14);
  const [showZoomWarning, setShowZoomWarning] = useState(false);

  useEffect(() => {
    if (!mapRef.current) {
      const container = document.getElementById('map-container');
      if (!container) return;

      // Philippines bounds to prevent wrapping - includes all of Palawan (Balabac)
      const philippinesBounds = L.latLngBounds(
        [3.0, 116.5],   // Southwest corner (includes Balabac, Palawan)
        [21.3, 129.2]   // Northeast corner
      );

      mapRef.current = L.map(container, { 
        zoomControl: false,
        maxBounds: philippinesBounds,
        maxBoundsViscosity: 1.0
      }).setView([14.575, 120.990], 14);

      // Track zoom changes
      mapRef.current.on('zoom', () => {
        setCurrentZoom(mapRef.current?.getZoom() || 14);
      });

      // Base layer - CartoDB with no wrapping
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CARTO',
        noWrap: true
      }).addTo(mapRef.current);
    }
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    const clickHandler = (e: L.LeafletMouseEvent) => {
      if (isAddingRoute) {
        if (currentZoom < MIN_ZOOM_FOR_WAYPOINTS) {
          setShowZoomWarning(true);
          setTimeout(() => setShowZoomWarning(false), 3000);
          return;
        }
        onWaypointAdd({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
      else onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
    };
    mapRef.current.on('click', clickHandler);
    return () => { mapRef.current?.off('click', clickHandler); };
  }, [isAddingRoute, onWaypointAdd, onMapClick, currentZoom]);

  // GPS User Location - Pulsing Blue Dot
  useEffect(() => {
    if (!mapRef.current || !userLocation) return;
    if (userMarkerRef.current) userMarkerRef.current.remove();
    
    userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], {
      icon: L.divIcon({
        className: 'custom-div-icon',
        html: `<div class="user-location-dot"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      }),
      zIndexOffset: 1000
    }).addTo(mapRef.current);
    
    // Auto-center on user location once if not already focused
    if (!focusedPoint && !activeRoute) {
       mapRef.current.setView([userLocation.lat, userLocation.lng], 15);
    }
  }, [userLocation]);

  // Focused / Drop-off Point - Distinct Orange/Red Pin
  useEffect(() => {
    if (!mapRef.current) return;
    if (focusMarkerRef.current) focusMarkerRef.current.remove();
    
    if (focusedPoint && !isAddingRoute) {
      focusMarkerRef.current = L.marker([focusedPoint.lat, focusedPoint.lng], {
        icon: L.divIcon({
          className: 'custom-div-icon focused-pin',
          html: `
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2Z" fill="#f97316" stroke="white" stroke-width="2"/>
              <circle cx="12" cy="9" r="3" fill="white"/>
            </svg>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 32]
        }),
        zIndexOffset: 1001
      }).addTo(mapRef.current);
    }
  }, [focusedPoint, isAddingRoute]);

  useEffect(() => {
    if (!mapRef.current) return;
    
    // Clear existing route layers from the map
    (Object.values(routeLayersRef.current) as L.LayerGroup[]).forEach(g => g.remove());
    routeLayersRef.current = {};

    routes.forEach(route => {
      const group = L.layerGroup().addTo(mapRef.current!);
      const isActive = route.id === activeRoute?.id;
      const polyline = L.polyline(route.path, { 
        color: route.color, weight: isActive ? 8 : 3, opacity: isActive ? 1 : 0.4
      }).addTo(group);

      if (isActive) polyline.bringToFront();

      if (isActive && route.path.length > 1) {
        const step = Math.max(5, Math.floor(route.path.length / 10));
        for (let i = 0; i < route.path.length - 1; i += step) {
          const p1 = route.path[i];
          const p2 = route.path[i + 1];
          const angle = (Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) * 180) / Math.PI;
          L.marker(p1, {
            icon: L.divIcon({
              className: 'custom-arrow',
              html: `<div style="transform: rotate(${angle}deg); color: white; width: 14px; height: 14px;">
                      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z"/></svg>
                    </div>`,
              iconSize: [14, 14],
              iconAnchor: [7, 7]
            }),
            interactive: false
          }).addTo(group);
        }
      }
      routeLayersRef.current[route.id] = group;
      if (isActive) mapRef.current?.fitBounds(polyline.getBounds(), { padding: [50, 50], animate: true });
    });
  }, [routes, activeRoute]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (newRoutePolylineRef.current) newRoutePolylineRef.current.remove();
    editMarkerRef.current.forEach(m => m.remove());
    editMarkerRef.current = [];

    if (newRoutePath.length > 0) {
      newRoutePolylineRef.current = L.polyline(newRoutePath, { 
        color: '#6366f1', dashArray: '5, 10', weight: 4, opacity: 0.7
      }).addTo(mapRef.current);
      
      newRouteWaypoints.forEach((w, idx) => {
        const marker = L.marker([w.lat, w.lng], {
          draggable: true,
          icon: L.divIcon({
            className: 'custom-div-icon',
            html: `<div class="w-4 h-4 bg-indigo-600 rounded-full border-2 border-white flex items-center justify-center text-[7px] text-white font-black">${idx+1}</div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8]
          })
        }).addTo(mapRef.current!);
        marker.on('dragend', (e) => onWaypointUpdate(idx, { lat: e.target.getLatLng().lat, lng: e.target.getLatLng().lng }));
        editMarkerRef.current.push(marker);
      });
    }
  }, [newRoutePath, newRouteWaypoints, onWaypointUpdate]);

  return (
    <div className="h-full w-full relative">
      <div id="map-container" className="h-full w-full" />
      
      {/* Zoom warning message */}
      {showZoomWarning && isAddingRoute && (
        <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[3000] bg-amber-100 border-2 border-amber-400 text-amber-900 px-4 py-3 rounded-lg font-bold text-sm shadow-lg animate-in fade-in duration-200">
          📍 Zoom in to add waypoints
        </div>
      )}
    </div>
  );
};

export default JeepneyMap;
