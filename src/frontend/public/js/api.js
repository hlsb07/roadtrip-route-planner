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

    static async updatePlace(placeId, name, latitude = null, longitude = null) {
        const body = {};
        if (name !== null && name !== undefined) body.name = name;
        if (latitude !== null) body.latitude = latitude;
        if (longitude !== null) body.longitude = longitude;

        const response = await fetch(`${CONFIG.API_BASE}/places/${placeId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!response.ok) {
            throw new Error('Failed to update place');
        }
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

    // Campsite API methods
    static async getAllCampsites() {
        const response = await fetch(`${CONFIG.API_BASE}/campsites/all`);
        if (!response.ok) {
            throw new Error(`Failed to load campsites: ${response.status}`);
        }
        return await response.json();
    }

    static async getCampsite(campsiteId) {
        const response = await fetch(`${CONFIG.API_BASE}/campsites/${campsiteId}`);
        if (!response.ok) {
            throw new Error(`Failed to load campsite: ${response.status}`);
        }
        return await response.json();
    }

    static async searchCampsites(query) {
        const response = await fetch(`${CONFIG.API_BASE}/campsites/search?query=${encodeURIComponent(query)}`);
        if (!response.ok) {
            throw new Error(`Failed to search campsites: ${response.status}`);
        }
        return await response.json();
    }

    static async deleteCampsite(campsiteId) {
        const response = await fetch(`${CONFIG.API_BASE}/campsites/${campsiteId}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            throw new Error(`Failed to delete campsite: ${response.status}`);
        }
    }

    // Category API methods
    static async getAllCategories() {
        const response = await fetch(`${CONFIG.API_BASE}/categories`);
        if (!response.ok) {
            throw new Error(`Failed to load categories: ${response.status}`);
        }
        return await response.json();
    }

    static async getPlacesByCategory(categoryId) {
        const response = await fetch(`${CONFIG.API_BASE}/categories/${categoryId}/places`);
        if (!response.ok) {
            throw new Error(`Failed to load places for category: ${response.status}`);
        }
        return await response.json();
    }

    // Country API methods
    static async getAllCountries() {
        const response = await fetch(`${CONFIG.API_BASE}/countries`);
        if (!response.ok) {
            throw new Error(`Failed to load countries: ${response.status}`);
        }
        return await response.json();
    }

    static async getPlacesByCountry(countryId) {
        const response = await fetch(`${CONFIG.API_BASE}/countries/${countryId}/places`);
        if (!response.ok) {
            throw new Error(`Failed to load places for country: ${response.status}`);
        }
        return await response.json();
    }

    // Get all places (for filtering)
    static async getAllPlaces() {
        const response = await fetch(`${CONFIG.API_BASE}/places`);
        if (!response.ok) {
            throw new Error(`Failed to load places: ${response.status}`);
        }
        return await response.json();
    }
}