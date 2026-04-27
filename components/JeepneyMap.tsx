
import React, { useEffect, useRef, useState } from 'react';
import { JeepneyRoute, Waypoint } from '../types';
import L from 'leaflet';

interface JeepneyMapProps {
  routes: JeepneyRoute[];
  activeRoute: JeepneyRoute | null;
  isAddingRoute: boolean;
  onWaypointAdd: (point: Waypoint) => void;
  onWaypointUpdate: (index: number, point: Waypoint) => void;
  onRouteSelect: (route: JeepneyRoute) => void;
  newRouteWaypoints: Waypoint[];
  newRoutePath: [number, number][];
  focusedPoint: Waypoint | null;
  userLocation: Waypoint | null;
  centerOnUserLocationRequest: number;
  mapTheme: 'light' | 'dark';
  routeGuide: { from: Waypoint; to: Waypoint } | null;
}

const MIN_ZOOM_FOR_WAYPOINTS = 17;
const MAX_AUTO_FIT_ZOOM = 18;

const getTileUrl = (theme: 'light' | 'dark') =>
  theme === 'dark'
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

const getTileOptions = (): L.TileLayerOptions => ({
  attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  maxZoom: 20,
  maxNativeZoom: 20,
  noWrap: true,
});

const getRouteFitOptions = (): L.FitBoundsOptions => {
  if (typeof window === 'undefined' || window.innerWidth >= 768) {
    return { padding: [56, 56], animate: true, maxZoom: MAX_AUTO_FIT_ZOOM };
  }

  const bottomSheetSpace = Math.round(window.innerHeight * 0.52);
  return {
    paddingTopLeft: [48, 112],
    paddingBottomRight: [48, bottomSheetSpace],
    animate: true,
    maxZoom: 17,
  };
};

const isValidLatLng = (point: [number, number]) =>
  Number.isFinite(point[0]) &&
  Number.isFinite(point[1]) &&
  point[0] >= -90 &&
  point[0] <= 90 &&
  point[1] >= -180 &&
  point[1] <= 180;

const JeepneyMap: React.FC<JeepneyMapProps> = ({ 
  routes, 
  activeRoute, 
  isAddingRoute, 
  onWaypointAdd,
  onWaypointUpdate,
  onRouteSelect,
  newRouteWaypoints,
  newRoutePath,
  focusedPoint,
  userLocation,
  centerOnUserLocationRequest,
  mapTheme,
  routeGuide
}) => {
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const routeLayersRef = useRef<Record<string, { group: L.LayerGroup; polyline: L.Polyline; hitbox: L.Polyline }>>({});
  const activeArrowMarkersRef = useRef<L.Marker[]>([]);
  const editMarkerRef = useRef<L.Marker[]>([]);
  const newRoutePolylineRef = useRef<L.Polyline | null>(null);
  const routeGuideRef = useRef<L.LayerGroup | null>(null);
  const focusMarkerRef = useRef<L.Marker | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const zoomWarningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousActiveRouteIdRef = useRef<string | null>(null);
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
        maxBoundsViscosity: 1.0,
        maxZoom: 19,
        minZoom: 5
      }).setView([14.575, 120.990], 14);

      tileLayerRef.current = L.tileLayer(getTileUrl(mapTheme), getTileOptions()).addTo(mapRef.current);

      // Prevent white gaps after layout/viewport changes.
      mapRef.current.whenReady(() => {
        mapRef.current?.invalidateSize();
      });
    }

    return () => {
      if (zoomWarningTimeoutRef.current) {
        clearTimeout(zoomWarningTimeoutRef.current);
      }
      mapRef.current?.remove();
      mapRef.current = null;
      routeLayersRef.current = {};
      activeArrowMarkersRef.current = [];
      editMarkerRef.current = [];
      newRoutePolylineRef.current = null;
      tileLayerRef.current = null;
      routeGuideRef.current = null;
      focusMarkerRef.current = null;
      userMarkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !tileLayerRef.current) return;
    tileLayerRef.current.setUrl(getTileUrl(mapTheme));
  }, [mapTheme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const clickHandler = (e: L.LeafletMouseEvent) => {
      if (isAddingRoute) {
        if (map.getZoom() < MIN_ZOOM_FOR_WAYPOINTS) {
          setShowZoomWarning(true);
          if (zoomWarningTimeoutRef.current) {
            clearTimeout(zoomWarningTimeoutRef.current);
          }
          zoomWarningTimeoutRef.current = setTimeout(() => setShowZoomWarning(false), 3000);
          return;
        }
        onWaypointAdd({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
    };
    map.on('click', clickHandler);
    return () => { map.off('click', clickHandler); };
  }, [isAddingRoute, onWaypointAdd]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleResize = () => map.invalidateSize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  useEffect(() => {
    if (!mapRef.current || !userLocation || centerOnUserLocationRequest === 0) return;
    const nextZoom = Math.max(mapRef.current.getZoom(), 16);
    mapRef.current.flyTo([userLocation.lat, userLocation.lng], nextZoom, {
      animate: true,
      duration: 0.45,
    });
  }, [centerOnUserLocationRequest, userLocation]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (routeGuideRef.current) {
      routeGuideRef.current.remove();
      routeGuideRef.current = null;
    }

    if (!routeGuide || isAddingRoute) return;

    const guideGroup = L.layerGroup().addTo(mapRef.current);
    L.polyline(
      [
        [routeGuide.from.lat, routeGuide.from.lng],
        [routeGuide.to.lat, routeGuide.to.lng],
      ],
      {
        color: '#0f172a',
        dashArray: '7, 10',
        weight: 4,
        opacity: 0.78,
      }
    ).addTo(guideGroup);

    L.marker([routeGuide.to.lat, routeGuide.to.lng], {
      icon: L.divIcon({
        className: 'custom-div-icon',
        html: `<div class="route-guide-target"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
      zIndexOffset: 1100,
    }).addTo(guideGroup);

    routeGuideRef.current = guideGroup;
  }, [routeGuide, isAddingRoute]);

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
    const map = mapRef.current;
    const activeRouteId = activeRoute?.id ?? null;
    const nextRouteIds = new Set(routes.map(route => route.id));

    Object.entries(routeLayersRef.current).forEach(([routeId, layer]) => {
      if (!nextRouteIds.has(routeId)) {
        layer.group.remove();
        delete routeLayersRef.current[routeId];
      }
    });

    activeArrowMarkersRef.current.forEach(marker => marker.remove());
    activeArrowMarkersRef.current = [];

    routes.forEach(route => {
      const isActive = route.id === activeRoute?.id;
      const safePath = route.path.filter(isValidLatLng);
      let layer = routeLayersRef.current[route.id];

      if (!layer) {
        const group = L.layerGroup().addTo(map);
        const polyline = L.polyline(safePath).addTo(group);
        const hitbox = L.polyline(safePath, {
          color: route.color,
          weight: 18,
          opacity: 0,
          interactive: true,
        }).addTo(group);
        layer = { group, polyline, hitbox };
        routeLayersRef.current[route.id] = layer;
      }

      layer.polyline.setLatLngs(safePath);
      layer.hitbox.setLatLngs(safePath);
      layer.polyline.setStyle({
        color: route.color,
        weight: isActive ? 8 : 3,
        opacity: isActive ? 1 : 0.4
      });
      layer.hitbox.setStyle({
        color: route.color,
        weight: isActive ? 22 : 18,
        opacity: 0,
        interactive: !isAddingRoute,
      });
      layer.hitbox.off('click');
      layer.hitbox.on('click', event => {
        L.DomEvent.stopPropagation(event);
        if (!isAddingRoute) onRouteSelect(route);
      });

      if (isActive) {
        layer.polyline.bringToFront();
        layer.hitbox.bringToFront();
      }

      if (isActive && safePath.length > 1) {
        const step = Math.max(5, Math.floor(safePath.length / 10));
        for (let i = 0; i < safePath.length - 1; i += step) {
          const p1 = safePath[i];
          const p2 = safePath[i + 1];
          const angle = (Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) * 180) / Math.PI;
          const arrowMarker = L.marker(p1, {
            icon: L.divIcon({
              className: 'custom-arrow',
              html: `<div style="transform: rotate(${angle}deg); color: white; width: 14px; height: 14px;">
                      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z"/></svg>
                    </div>`,
              iconSize: [14, 14],
              iconAnchor: [7, 7]
            }),
            interactive: false
          }).addTo(layer.group);
          activeArrowMarkersRef.current.push(arrowMarker);
        }
      }
    });

    if (activeRouteId && activeRouteId !== previousActiveRouteIdRef.current) {
      const activeLayer = routeLayersRef.current[activeRouteId];
      if (activeLayer) {
        const bounds = activeLayer.polyline.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, getRouteFitOptions());
        }
      }
    }
    previousActiveRouteIdRef.current = activeRouteId;
  }, [routes, activeRoute, isAddingRoute, onRouteSelect]);

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
    <div className="h-full w-full relative overflow-hidden bg-slate-100">
      <div
        id="map-container"
        className="h-full w-full"
      />
      
      {/* Zoom warning message */}
      {showZoomWarning && isAddingRoute && (
        <div className="fixed top-1/2 left-4 right-4 md:left-1/2 md:right-auto md:min-w-72 md:-translate-x-1/2 transform -translate-y-1/2 z-[3000] bg-amber-100 border-2 border-amber-400 text-amber-900 px-4 py-3 rounded-lg font-bold text-sm text-center shadow-lg animate-in fade-in duration-200">
          Zoom in to add waypoints
        </div>
      )}
    </div>
  );
};

export default JeepneyMap;
