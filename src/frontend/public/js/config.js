// Configuration constants
export const CONFIG = {
    // When using Nginx reverse proxy (production):
    // - Nginx serves frontend at http://localhost
    // - Nginx proxies /api/ to backend at localhost:5166
    // - Nginx serves /images/ from shared directory
    API_BASE: '/api',  // Proxied by Nginx to http://localhost:5166/api

    // For development without Nginx, uncomment this:
    // API_BASE: 'http://localhost:5166/api',

    MAP_CENTER: [-41.2865, 174.7762], // New Zealand
    MAP_ZOOM: 6,
    PLACE_SELECTION_ZOOM:10, // Zoom level when selecting a place (higher = more zoomed in)
    SEARCH_LIMIT: 5,
    NOMINATIM_URL: 'https://nominatim.openstreetmap.org/search',
    LEAFLET_TILE_URL: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    LEAFLET_ATTRIBUTION: '© OpenStreetMap'
};