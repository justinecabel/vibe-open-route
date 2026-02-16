# Open Route

Open Route is a crowdsourced Jeepney route map and commuter helper for the Philippines.  
Users can discover routes, filter by map point, vote on route quality, and refine paths with road snapping.

## Core Features

- Interactive Leaflet map with active route highlighting
- Crowdsourced route creation and route refinement
- OSRM road-snapped polylines for cleaner route geometry
- Nearby-route filtering by clicked point
- Local cache fallback when backend is unavailable
- Optional AI route analysis via backend endpoint

## Tech Stack

- Frontend: React + TypeScript + Vite
- Map: Leaflet
- Routing snap: OSRM public API
- Backend API: REST (`/api/routes`, `/api/analyze`) via `services/apiService.ts`

## Quick Start

### Prerequisites

- Node.js 20+
- npm 10+

### Install and run

```bash
npm install
npm run dev
```

App runs on `http://localhost:3000`.

## Configuration

### Environment variables

Set in `.env` or `.env.local`:

```bash
VITE_BACKEND_API=http://localhost:3001/api
GEMINI_API_KEY=your_key_here
```

Use `.env.example` as the template.

## Scripts

- `npm run dev`: start development server
- `npm run build`: production build
- `npm run preview`: preview production build locally

## Crawlability and SEO

This repo includes baseline crawlability support:

- Canonical URL and social metadata in `index.html`
- JSON-LD structured data in `index.html`
- `robots.txt` in `public/robots.txt`
- `sitemap.xml` in `public/sitemap.xml`

For stronger indexing on JS-heavy pages, use prerendering or SSR in production.

## Deployment Checklist

1. Set `VITE_BACKEND_API` for the deployment environment.
2. Ensure canonical domain in `index.html` matches production.
3. Update `public/sitemap.xml` with real URLs and `lastmod`.
4. Submit sitemap in Google Search Console and Bing Webmaster Tools.
5. Validate structured data with Rich Results Test.
