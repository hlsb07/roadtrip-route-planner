import { CONFIG } from './config.js';

// API service functions
export class ApiService {
    static async getAllRoutes() {
        const response = await fetch(`${CONFIG.API_BASE}/routes`);
        if (!response.ok) {
            throw new Error(`Failed to load routes: ${response.status}`);
        }
        return await response.json();
    }

    static async getRoute(routeId) {
        const response = await fetch(`${CONFIG.API_BASE}/routes/${routeId}`);
        if (!response.ok) {
            throw new Error(`Failed to load route: ${response.status}`);
        }
        return await response.json();
    }

    static async createRoute(name, description = '') {
        const response = await fetch(`${CONFIG.API_BASE}/routes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description })
        });
        if (!response.ok) {
            throw new Error(`Failed to create route: ${response.status}`);
        }
        return await response.json();
    }

    static async updateRoute(routeId, name, description = '') {
        const response = await fetch(`${CONFIG.API_BASE}/routes/${routeId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description })
        });
        if (!response.ok) {
            throw new Error(`Failed to update route: ${response.status}`);
        }
    }

    static async deleteRoute(routeId) {
        const response = await fetch(`${CONFIG.API_BASE}/routes/${routeId}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            throw new Error(`Failed to delete route: ${response.status}`);
        }
    }

    static async createPlace(name, latitude, longitude) {
        const response = await fetch(`${CONFIG.API_BASE}/places`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, latitude, longitude })
        });
        if (!response.ok) {
            throw new Error('Failed to create place');
        }
        return await response.json();
    }

    static async addPlaceToRoute(routeId, placeId) {
        const response = await fetch(`${CONFIG.API_BASE}/routes/${routeId}/places`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ placeId })
        });
        if (!response.ok) {
            const errorText = await response.text();
            if (errorText.includes('already in route')) {
                throw new Error('This place is already in your route');
            }
            throw new Error('Failed to add place to route');
        }
    }

    static async removePlaceFromRoute(routeId, placeId) {
        const response = await fetch(`${CONFIG.API_BASE}/routes/${routeId}/places/${placeId}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            throw new Error('Failed to remove place from route');
        }
    }

    static async reorderPlaces(routeId, placeIds) {
        const response = await fetch(`${CONFIG.API_BASE}/routes/${routeId}/places/reorder`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(placeIds)
        });
        if (!response.ok) {
            throw new Error('Failed to reorder places');
        }
    }

    static async searchPlaces(query) {
        const response = await fetch(
            `${CONFIG.NOMINATIM_URL}?format=json&q=${encodeURIComponent(query)}&limit=${CONFIG.SEARCH_LIMIT}`
        );
        if (!response.ok) {
            throw new Error('Search failed');
        }
        return await response.json();
    }
}