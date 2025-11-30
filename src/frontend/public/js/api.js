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

    static async updatePlace(placeId, name, latitude = null, longitude = null, notes = null) {
        const body = {};
        if (name !== null && name !== undefined) body.name = name;
        if (latitude !== null) body.latitude = latitude;
        if (longitude !== null) body.longitude = longitude;
        if (notes !== undefined) body.notes = notes; // Allow empty string to clear notes

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
            const errorText = await response.text().catch(() => '');
            const error = new Error(errorText || 'Failed to remove place from route');
            error.status = response.status;
            throw error;
        }
    }

    static async reorderPlaces(routeId, placeIds) {
        console.log('Reordering places:', { routeId, placeIds });
        const response = await fetch(`${CONFIG.API_BASE}/routes/${routeId}/places/reorder`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(placeIds)
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Reorder failed:', response.status, errorText);
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

    static async getCategory(categoryId) {
        const response = await fetch(`${CONFIG.API_BASE}/categories/${categoryId}`);
        if (!response.ok) {
            throw new Error(`Failed to load category: ${response.status}`);
        }
        return await response.json();
    }

    static async createCategory(name, icon = '') {
        const response = await fetch(`${CONFIG.API_BASE}/categories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, icon })
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to create category');
        }
        return await response.json();
    }

    static async updateCategory(categoryId, name, icon = '') {
        const response = await fetch(`${CONFIG.API_BASE}/categories/${categoryId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, icon })
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to update category');
        }
    }

    static async deleteCategory(categoryId) {
        const response = await fetch(`${CONFIG.API_BASE}/categories/${categoryId}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to delete category');
        }
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

    static async getCountry(countryId) {
        const response = await fetch(`${CONFIG.API_BASE}/countries/${countryId}`);
        if (!response.ok) {
            throw new Error(`Failed to load country: ${response.status}`);
        }
        return await response.json();
    }

    static async createCountry(name, icon = '') {
        const response = await fetch(`${CONFIG.API_BASE}/countries`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, icon })
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to create country');
        }
        return await response.json();
    }

    static async updateCountry(countryId, name, icon = '') {
        const response = await fetch(`${CONFIG.API_BASE}/countries/${countryId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, icon })
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to update country');
        }
    }

    static async deleteCountry(countryId) {
        const response = await fetch(`${CONFIG.API_BASE}/countries/${countryId}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to delete country');
        }
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

    // Place Category Management
    static async assignCategoryToPlace(placeId, categoryId) {
        const response = await fetch(`${CONFIG.API_BASE}/places/${placeId}/categories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ categoryId })
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to assign category');
        }
    }

    static async removeCategoryFromPlace(placeId, categoryId) {
        const response = await fetch(`${CONFIG.API_BASE}/places/${placeId}/categories/${categoryId}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            throw new Error('Failed to remove category');
        }
    }

    static async getPlaceCategories(placeId) {
        const response = await fetch(`${CONFIG.API_BASE}/places/${placeId}/categories`);
        if (!response.ok) {
            throw new Error('Failed to get place categories');
        }
        return await response.json();
    }

    // Place Country Management
    static async assignCountryToPlace(placeId, countryId) {
        const response = await fetch(`${CONFIG.API_BASE}/places/${placeId}/countries`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ countryId })
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to assign country');
        }
    }

    static async removeCountryFromPlace(placeId, countryId) {
        const response = await fetch(`${CONFIG.API_BASE}/places/${placeId}/countries/${countryId}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            throw new Error('Failed to remove country');
        }
    }

    static async getPlaceCountries(placeId) {
        const response = await fetch(`${CONFIG.API_BASE}/places/${placeId}/countries`);
        if (!response.ok) {
            throw new Error('Failed to get place countries');
        }
        return await response.json();
    }

    // ===== Google Places Integration API Methods =====

    /**
     * Create a place from Google Places data
     * @param {string} googlePlaceId - Google Place ID
     * @param {string|null} notes - Optional user notes
     * @returns {Promise<Object>} Created place
     */
    static async createPlaceFromGoogle(googlePlaceId, notes = null) {
        console.log('Creating place from Google:', { googlePlaceId, notes });
        const response = await fetch(`${CONFIG.API_BASE}/places/from-google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ googlePlaceId, notes })
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Error creating place from Google:', errorData);
            const errorMsg = errorData.error
                ? `${errorData.message}: ${errorData.error}`
                : (errorData.message || 'Failed to create place from Google');
            throw new Error(errorMsg);
        }
        return await response.json();
    }

    /**
     * Check if a Google Place is already saved for the current user
     * @param {string} googlePlaceId - Google Place ID
     * @returns {Promise<Object>} Duplicate check result
     */
    static async checkDuplicateGooglePlace(googlePlaceId) {
        const response = await fetch(`${CONFIG.API_BASE}/places/check-duplicate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ googlePlaceId })
        });
        if (!response.ok) {
            throw new Error('Failed to check duplicate');
        }
        return await response.json();
    }

    /**
     * Get enriched place data with Google information
     * @param {number} placeId - Place ID
     * @returns {Promise<Object>} Enriched place data
     */
    static async getEnrichedPlace(placeId) {
        const response = await fetch(`${CONFIG.API_BASE}/places/${placeId}/enriched`);
        if (!response.ok) {
            throw new Error('Failed to get enriched place data');
        }
        return await response.json();
    }

    /**
     * Refresh Google data for a place
     * @param {number} placeId - Place ID
     * @returns {Promise<Object>} Refresh result with updated fields
     */
    static async refreshGoogleData(placeId) {
        const response = await fetch(`${CONFIG.API_BASE}/places/${placeId}/refresh-google`, {
            method: 'POST'
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || 'Failed to refresh Google data');
        }
        return await response.json();
    }

    /**
     * Update notes for a place
     * @param {number} placeId - Place ID
     * @param {string|null} notes - Notes text
     * @returns {Promise<void>}
     */
    static async updatePlaceNotes(placeId, notes) {
        const response = await fetch(`${CONFIG.API_BASE}/places/${placeId}/notes`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes })
        });
        if (!response.ok) {
            throw new Error('Failed to update notes');
        }
    }

    /**
     * Reverse geocode existing places to link them with Google data
     * @returns {Promise<Object>} Result with count of linked places
     */
    static async reverseGeocodeExistingPlaces() {
        const response = await fetch(`${CONFIG.API_BASE}/places/reverse-geocode`, {
            method: 'POST'
        });
        if (!response.ok) {
            throw new Error('Failed to reverse geocode places');
        }
        return await response.json();
    }
}