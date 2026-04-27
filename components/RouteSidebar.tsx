
import React, { useRef, useState } from 'react';
import { JeepneyRoute } from '../types';

interface RouteSidebarProps {
  routes: JeepneyRoute[];
  totalRoutesCount: number;
  activeRoute: JeepneyRoute | null;
  locationStatus: 'checking' | 'granted' | 'denied' | 'unsupported';
  isShowingNearbyRoutes: boolean;
  searchQuery: string;
  searchStatus: 'idle' | 'searching' | 'found' | 'empty' | 'error';
  searchLabel: string | null;
  isPlaceSearchActive: boolean;
  onRequestLocation: () => void;
  onSearchQueryChange: (query: string) => void;
  onSelectRoute: (route: JeepneyRoute) => void;
  onAddRouteClick: () => void;
  isAddingRoute: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onClearFilter: () => void;
  isFiltered: boolean;
}

const JeepneyIcon = (props: { className?: string }) => (
  <svg className={props.className || "w-6 h-6"} fill="currentColor" viewBox="0 0 24 24">
    <path d="M4,16c0,0.88,0.39,1.67,1,2.22V20a1,1,0,0,0,1,1H7a1,1,0,0,0,1-1V19h8v1a1,1,0,0,0,1,1h1a1,1,0,0,0,1-1V18.22c0.61-0.55,1-1.34,1-2.22V6 c0-1.52-1.03-2.74-2.42-3.1L12,2L6.42,2.9C5.03,3.26,4,4.48,4,6V16z M18,11H6V6h12V11z M16.5,17A1.5,1.5,0,1,1,18,15.5A1.5,1.5,0,0,1,16.5,17 z M7.5,17A1.5,1.5,0,1,1,9,15.5A1.5,1.5,0,0,1,7.5,17z" />
  </svg>
);

const SearchPlaceIcon = (props: { className?: string }) => (
  <svg className={props.className || "w-4 h-4"} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="10.5" cy="10.5" r="5.5" strokeWidth="2.4" />
    <path strokeLinecap="round" strokeWidth="2.4" d="m15 15 4.5 4.5" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.1" d="M10.5 7.75v5.5M7.75 10.5h5.5" />
  </svg>
);

const ClearIcon = (props: { className?: string }) => (
  <svg className={props.className || "w-4 h-4"} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.7" d="M7 7l10 10M17 7 7 17" />
  </svg>
);

const MIN_SHEET_HEIGHT = 32;
const DEFAULT_SHEET_HEIGHT = 58;
const MAX_SHEET_HEIGHT = 92;
const CLOSE_SHEET_THRESHOLD = 40;

const clampSheetHeight = (value: number) =>
  Math.min(MAX_SHEET_HEIGHT, Math.max(MIN_SHEET_HEIGHT, Math.round(value)));

const RouteSidebar: React.FC<RouteSidebarProps> = ({ 
  routes, totalRoutesCount, activeRoute, locationStatus, isShowingNearbyRoutes, searchQuery, searchStatus, searchLabel, isPlaceSearchActive, onRequestLocation, onSearchQueryChange, onSelectRoute, onAddRouteClick, 
  isOpen, onToggle, onClearFilter, isFiltered, isAddingRoute
}) => {
  const [sheetHeight, setSheetHeight] = useState(DEFAULT_SHEET_HEIGHT);
  const draggedSheetHeightRef = useRef(DEFAULT_SHEET_HEIGHT);

  const getSheetHeightFromPointer = (clientY: number) => {
    if (typeof window === 'undefined') return sheetHeight;
    const nextHeight = ((window.innerHeight - clientY) / window.innerHeight) * 100;
    return clampSheetHeight(nextHeight);
  };

  const updateSheetHeightFromPointer = (clientY: number) => {
    const nextHeight = getSheetHeightFromPointer(clientY);
    draggedSheetHeightRef.current = nextHeight;
    setSheetHeight(nextHeight);
    return nextHeight;
  };

  const settleSheetHeight = (clientY?: number) => {
    const nextHeight = typeof clientY === 'number'
      ? getSheetHeightFromPointer(clientY)
      : draggedSheetHeightRef.current;

    if (nextHeight <= CLOSE_SHEET_THRESHOLD) {
      setSheetHeight(DEFAULT_SHEET_HEIGHT);
      onToggle();
      return;
    }

    setSheetHeight(Math.max(nextHeight, DEFAULT_SHEET_HEIGHT));
  };

  return (
    <>
      {isOpen && !isAddingRoute && (
        <div
          className="lg:hidden fixed inset-0 z-[1900] bg-[radial-gradient(circle_at_50%_15%,rgba(255,255,255,0.2),rgba(15,23,42,0.26)_48%,rgba(15,23,42,0.38))] backdrop-blur-[3px] touch-none"
          aria-hidden="true"
        />
      )}

      <aside className={`fixed lg:static left-0 right-0 bottom-0 lg:inset-y-0 lg:right-auto lg:w-80 bg-white border-t lg:border-t-0 lg:border-r border-slate-200 flex flex-col z-[2000] sidebar-transition shadow-2xl lg:shadow-none ${
        isOpen ? 'translate-y-0 lg:translate-x-0' : 'translate-y-full lg:translate-y-0 lg:translate-x-0'
      } h-[var(--route-sheet-height)] lg:h-auto lg:max-h-dvh rounded-t-lg lg:rounded-none overflow-hidden pb-[env(safe-area-inset-bottom)] lg:pb-0`}
        style={{ '--route-sheet-height': `${sheetHeight}dvh` } as React.CSSProperties}
      >
        <div className="lg:hidden px-4 pt-2 pb-1">
          <div
            role="slider"
            tabIndex={0}
            aria-label="Route search sheet height"
            aria-valuemin={MIN_SHEET_HEIGHT}
            aria-valuemax={MAX_SHEET_HEIGHT}
            aria-valuenow={sheetHeight}
            className="mx-auto h-8 w-36 rounded-full flex items-center justify-center touch-none cursor-ns-resize select-none outline-none"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              updateSheetHeightFromPointer(event.clientY);
            }}
            onPointerMove={(event) => {
              if (event.buttons !== 1) return;
              updateSheetHeightFromPointer(event.clientY);
            }}
            onPointerUp={(event) => settleSheetHeight(event.clientY)}
            onPointerCancel={() => settleSheetHeight()}
            onKeyDown={(event) => {
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                setSheetHeight(value => clampSheetHeight(value + 6));
              }
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setSheetHeight(value => {
                  const nextHeight = clampSheetHeight(value - 6);
                  if (nextHeight <= CLOSE_SHEET_THRESHOLD) {
                    onToggle();
                    return DEFAULT_SHEET_HEIGHT;
                  }
                  return nextHeight;
                });
              }
            }}
          >
            <span className="h-1.5 w-20 rounded-full bg-slate-300 shadow-inner" />
          </div>
        </div>

        <header className="p-4 bg-white text-slate-950 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-slate-950 rounded-lg flex items-center justify-center text-amber-300 shadow-md flex-shrink-0">
              <JeepneyIcon className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-black leading-none truncate">Open Route</h1>
              <p className="text-xs font-bold text-slate-500 mt-1">{totalRoutesCount} community routes</p>
            </div>
          </div>
        </header>

        <section className="p-4 space-y-3 bg-white border-b border-slate-100">
          <div className="relative">
            <input 
              placeholder="Search landmark or building"
              value={searchQuery}
              onChange={e => onSearchQueryChange(e.target.value)}
              onFocus={() => setSheetHeight(Math.max(sheetHeight, 78))}
              className="w-full min-h-12 pl-11 pr-4 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-950 outline-none focus:border-slate-950 transition-all"
            />
            <SearchPlaceIcon className="w-4 h-4 absolute left-4 top-4 text-slate-400" />
          </div>

          {isFiltered && (
            <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-lg flex items-center justify-between gap-2">
              <span className="text-xs font-black text-slate-800">{routes.length} near selected point</span>
              <button 
                onClick={onClearFilter} 
                className="h-9 w-9 bg-slate-950 text-white rounded-lg shadow-sm active:scale-95 flex items-center justify-center flex-shrink-0"
                title="Clear filter"
              >
                <ClearIcon className="w-4 h-4" />
              </button>
            </div>
          )}
        </section>

        <nav className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-hide pb-16 lg:pb-4">
          <div className="ml-1 mb-2">
            <h2 className="text-[11px] font-black text-slate-400 uppercase tracking-wider">
              {isPlaceSearchActive ? 'Connecting Routes' : 'Nearby Routes'}
            </h2>
            {isPlaceSearchActive && (
              <div className="mt-2 rounded-lg border border-sky-100 bg-sky-50 px-3 py-2">
                <p className="text-[11px] font-bold text-sky-900">
                  {searchStatus === 'searching'
                    ? 'Finding that place...'
                    : searchStatus === 'found'
                      ? `Routes near ${searchLabel || 'searched place'}`
                      : searchStatus === 'empty'
                        ? 'No place found. Try a more specific landmark.'
                        : searchStatus === 'error'
                          ? 'Place search is unavailable right now.'
                          : 'Search a landmark to find connecting routes.'}
                </p>
              </div>
            )}
            {!isShowingNearbyRoutes && !isPlaceSearchActive && (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-[11px] font-bold text-amber-800">
                  {locationStatus === 'checking'
                    ? 'Checking location to find routes near you.'
                    : locationStatus === 'unsupported'
                      ? 'Location must be supported to show nearby routes.'
                      : 'Location must be enabled to show nearby routes.'}
                </p>
                {locationStatus !== 'unsupported' && (
                  <button
                    type="button"
                    onClick={onRequestLocation}
                    className="h-8 px-3 rounded-md bg-slate-950 text-white text-[10px] font-black uppercase tracking-wider active:scale-95 flex-shrink-0"
                  >
                    Enable
                  </button>
                )}
              </div>
            )}
          </div>
          {routes.map(route => (
            <div 
              key={route.id}
              onClick={() => onSelectRoute(route)}
              className={`group p-3.5 bg-white rounded-lg border transition-all cursor-pointer hover:shadow-md active:scale-[0.98] ${
                activeRoute?.id === route.id ? 'border-slate-950 bg-slate-50' : 'border-slate-200'
              }`}
            >
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-black text-slate-950 truncate pr-1">{route.name}</h3>
                  <p className="text-xs text-slate-500 font-semibold mt-1 truncate">By {route.author}</p>
                </div>
                <span className={`text-xs font-black px-2 py-1 rounded-full ml-auto flex-shrink-0 ${route.score >= 0 ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'}`}>
                  {route.score > 0 ? `+${route.score}` : route.score}
                </span>
              </div>
            </div>
          ))}
          {routes.length === 0 && (
            <div className="text-center py-12 text-xs text-slate-400 font-bold uppercase tracking-wider">
              {isPlaceSearchActive
                ? searchStatus === 'searching'
                  ? 'Searching places...'
                  : 'No connecting routes found'
                : isShowingNearbyRoutes ? 'No nearby routes found' : 'Enable location to show routes'}
            </div>
          )}
        </nav>

        <footer className="sticky bottom-0 px-4 py-2 border-t border-slate-100 bg-white/95 backdrop-blur shadow-lg z-10">
          <button 
            onClick={onAddRouteClick} 
            className="w-full min-h-11 bg-amber-300 text-slate-950 font-black rounded-lg text-[11px] uppercase tracking-wider shadow-sm hover:bg-amber-200 transition-all flex items-center justify-center gap-2 active:scale-[0.99]"
          >
            <JeepneyIcon className="w-3.5 h-3.5" />
            Contribute Route
          </button>
        </footer>
      </aside>
    </>
  );
};

export default RouteSidebar;
