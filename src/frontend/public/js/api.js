import { CONFIG } from './config.js';
import { AuthManager } from './authManager.js';

// API service functions
export class ApiService {
    /**
     * Make an authenticated API request
     * @param {string} url - API endpoint URL
     * @param {Object} options - Fetch options
     * @returns {Promise<Response>} Fetch response
     */
    static async authenticatedFetch(url, options = {}) {
        try {
            const authHeaders = await AuthManager.getAuthHeaders();
            const headers = {
                ...options.headers,
                ...authHeaders
            };

            const response = await fetch(url, { ...options, headers });

            // Handle 401 Unauthorized - token might be expired
            if (response.status === 401) {
                // Try to refresh token
                const refreshed = await AuthManager.refreshAccessToken();
                if (refreshed) {
                    // Retry request with new token
                    const newAuthHeaders = await AuthManager.getAuthHeaders();
                    const retryHeaders = {
                        ...options.headers,
                        ...newAuthHeaders
                    };
                    return await fetch(url, { ...options, headers: retryHeaders });
                } else {
                    // Refresh failed - user needs to login
                    throw new Error('AUTHENTICATION_REQUIRED');
                }
            }

            return response;
        } catch (error) {
            if (error.message === 'Not authenticated') {
                throw new Error('AUTHENTICATION_REQUIRED');
            }
            throw error;
        }
    }

    static async getAllRoutes() {
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/routes`);
        if (!response.ok) {
            throw new Error(`Failed to load routes: ${response.status}`);
        }
        return await response.json();
    }

    static async getRoute(routeId) {
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/routes/${routeId}`);
        if (!response.ok) {
            throw new Error(`Failed to load route: ${response.status}`);
        }
        return await response.json();
    }

    static async createRoute(name, description = '') {
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/routes`, {
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
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/routes/${routeId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description })
        });
        if (!response.ok) {
            throw new Error(`Failed to update route: ${response.status}`);
        }
    }

    static async deleteRoute(routeId) {
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/routes/${routeId}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            throw new Error(`Failed to delete route: ${response.status}`);
        }
    }

    static async createPlace(name, latitude, longitude) {
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/places`, {
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

        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/places/${placeId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!response.ok) {
            throw new Error('Failed to update place');
        }
    }

    static async deletePlace(placeId) {
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/places/${placeId}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            const error = new Error(errorData?.message || 'Failed to delete place');
            error.status = response.status;
            error.data = errorData;
            throw error;
        }
    }

    static async forceDeletePlace(placeId) {
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/places/${placeId}/force`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            throw new Error('Failed to force delete place');
        }
    }

    static async addPlaceToRoute(routeId, placeId) {
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/routes/${routeId}/places`, {
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
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/routes/${routeId}/places/${placeId}`, {
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
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/routes/${routeId}/places/reorder`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                placeIds: placeIds,
                recalculateSchedule: true,
                preserveLockedDays: false
            })
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
    static async addCampsite(url) {
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/campsites?url=${encodeURIComponent(url)}`);
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || `Failed to add campsite: ${response.status}`);
        }
        return data;
    }

    static async getAllCampsites() {
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/campsites/all`);
        if (!response.ok) {
            throw new Error(`Failed to load campsites: ${response.status}`);
        }
        return await response.json();
    }

    static async getCampsite(campsiteId) {
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/campsites/${campsiteId}`);
        if (!response.ok) {
            throw new Error(`Failed to load campsite: ${response.status}`);
        }
        return await response.json();
    }

    static async searchCampsites(query) {
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/campsites/search?query=${encodeURIComponent(query)}`);
        if (!response.ok) {
            throw new Error(`Failed to search campsites: ${response.status}`);
        }
        return await response.json();
    }

    static async deleteCampsite(campsiteId) {
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/campsites/${campsiteId}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            throw new Error(`Failed to delete campsite: ${response.status}`);
        }
    }

    // Category API methods
    static async getAllCategories() {
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/categories`);
        if (!response.ok) {
            throw new Error(`Failed to load categories: ${response.status}`);
        }
        return await response.json();
    }

    static async getCategory(categoryId) {
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/categories/${categoryId}`);
        if (!response.ok) {
            throw new Error(`Failed to load category: ${response.status}`);
        }
        return await response.json();
    }

    static async createCategory(name, icon = '') {
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/categories`, {
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
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/categories/${categoryId}`, {
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
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/categories/${categoryId}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to delete category');
        }
    }

    static async getPlacesByCategory(categoryId) {
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/categories/${categoryId}/places`);
        if (!response.ok) {
            throw new Error(`Failed to load places for category: ${response.status}`);
        }
        return await response.json();
    }

    // Country API methods
    static async getAllCountries() {
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/countries`);
        if (!response.ok) {
            throw new Error(`Failed to load countries: ${response.status}`);
        }
        return await response.json();
    }

    static async getCountry(countryId) {
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/countries/${countryId}`);
        if (!response.ok) {
            throw new Error(`Failed to load country: ${response.status}`);
        }
        return await response.json();
    }

    static async createCountry(name, icon = '') {
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/countries`, {
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
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/countries/${countryId}`, {
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
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/countries/${countryId}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to delete country');
        }
    }

    static async getPlacesByCountry(countryId) {
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/countries/${countryId}/places`);
        if (!response.ok) {
            throw new Error(`Failed to load places for country: ${response.status}`);
        }
        return await response.json();
    }

    // Get all places (for filtering)
    static async getAllPlaces() {
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/places`);
        if (!response.ok) {
            throw new Error(`Failed to load places: ${response.status}`);
        }
        return await response.json();
    }

    // Place Category Management
    static async assignCategoryToPlace(placeId, categoryId) {
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/places/${placeId}/categories`, {
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
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/places/${placeId}/categories/${categoryId}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            throw new Error('Failed to remove category');
        }
    }

    static async getPlaceCategories(placeId) {
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/places/${placeId}/categories`);
        if (!response.ok) {
            throw new Error('Failed to get place categories');
        }
        return await response.json();
    }

    // Place Country Management
    static async assignCountryToPlace(placeId, countryId) {
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/places/${placeId}/countries`, {
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
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/places/${placeId}/countries/${countryId}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            throw new Error('Failed to remove country');
        }
    }

    static async getPlaceCountries(placeId) {
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/places/${placeId}/countries`);
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
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/places/from-google`, {
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
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/places/check-duplicate`, {
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
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/places/${placeId}/enriched`);
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
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/places/${placeId}/refresh-google`, {
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
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/places/${placeId}/notes`, {
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
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/places/reverse-geocode`, {
            method: 'POST'
        });
        if (!response.ok) {
            throw new Error('Failed to reverse geocode places');
        }
        return await response.json();
    }

    // ===== Timeline / Schedule API Methods =====

    /**
     * Get complete route itinerary with schedule settings, stops, and legs
     * @param {number} routeId - Route ID
     * @returns {Promise<Object>} Route itinerary with schedule data
     */
    static async getItinerary(routeId) {
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/routes/${routeId}/itinerary`);
        if (!response.ok) {
            throw new Error(`Failed to load itinerary: ${response.status}`);
        }
        return await response.json();
    }

    /**
     * Update route-level schedule settings
     * @param {number} routeId - Route ID
     * @param {Object} dto - Schedule settings DTO
     * @returns {Promise<void>}
     */
    static async updateRouteScheduleSettings(routeId, dto) {
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/routes/${routeId}/schedule-settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dto)
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to update route schedule settings');
        }
    }

    /**
     * Update schedule data for a specific stop in the route
     * @param {number} routeId - Route ID
     * @param {number} routePlaceId - RoutePlace ID
     * @param {Object} dto - Schedule update DTO
     * @returns {Promise<Object|null>} Response object if contains conflict info, null otherwise
     */
    static async updateStopSchedule(routeId, routePlaceId, dto) {
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/routes/${routeId}/places/${routePlaceId}/schedule`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dto)
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to update stop schedule');
        }
        // If response has content (conflict info), return it
        const text = await response.text();
        return text ? JSON.parse(text) : null;
    }

    /**
     * Rebuild leg skeleton for a route (creates legs for consecutive stop pairs)
     * @param {number} routeId - Route ID
     * @returns {Promise<void>}
     */
    static async rebuildLegs(routeId) {
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/routes/${routeId}/legs/rebuild`, {
            method: 'POST'
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to rebuild legs');
        }
    }

    /**
     * Update distance and duration metrics for a specific leg
     * @param {number} routeId - Route ID
     * @param {number} legId - Leg ID
     * @param {Object} dto - Leg metrics DTO {distanceMeters, durationSeconds}
     * @returns {Promise<void>}
     */
    static async updateLegMetrics(routeId, legId, dto) {
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/routes/${routeId}/legs/${legId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dto)
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to update leg metrics');
        }
    }

    /**
     * Update schedule (start/end times) for a specific leg
     * @param {number} routeId - Route ID
     * @param {number} legId - Leg ID
     * @param {Object} dto - Leg schedule DTO {plannedStart, plannedEnd}
     * @returns {Promise<void>}
     */
    static async updateLegSchedule(routeId, legId, dto) {
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/routes/${routeId}/legs/${legId}/schedule`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dto)
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to update leg schedule');
        }
    }

    /**
     * Recalculate route legs from OSRM (distance, duration, geometry)
     * @param {number} routeId - Route ID
     * @returns {Promise<Object>} - Success message
     */
    static async recalculateLegsFromOsrm(routeId) {
        const response = await this.authenticatedFetch(`${CONFIG.API_BASE}/routes/${routeId}/legs/recalculate`, {
            method: 'POST'
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to recalculate route legs');
        }
        return await response.json();
    }

    // ===== Conflict Management Methods =====

    /**
     * Get itinerary with conflict information
     * @param {number} routeId - Route ID
     * @returns {Promise<Object>} Itinerary with conflict info
     */
    static async getItineraryWithConflicts(routeId) {
        const response = await this.authenticatedFetch(
            `${CONFIG.API_BASE}/routes/${routeId}/itinerary?includeConflicts=true`
        );
        if (!response.ok) {
            throw new Error(`Failed to load itinerary: ${response.status}`);
        }
        return await response.json();
    }

    /**
     * Check if a schedule change would create a conflict
     * @param {number} routeId - Route ID
     * @param {number} routePlaceId - RoutePlace ID
     * @param {string} newStart - New planned start (ISO string)
     * @param {string} newEnd - New planned end (ISO string)
     * @returns {Promise<Object>} Conflict information
     */
    static async checkScheduleChangeConflict(routeId, routePlaceId, newStart, newEnd) {
        const response = await this.authenticatedFetch(
            `${CONFIG.API_BASE}/routes/${routeId}/conflicts/check-schedule-change`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    routePlaceId,
                    newPlannedStart: newStart,
                    newPlannedEnd: newEnd
                })
            }
        );
        if (!response.ok) {
            throw new Error('Failed to check conflicts');
        }
        return await response.json();
    }

    /**
     * Resolve conflicts by reordering route based on timeline
     * @param {number} routeId - Route ID
     * @param {boolean} recalculateSchedule - Whether to recalculate schedule after reordering
     * @returns {Promise<Object>} Success message
     */
    static async resolveConflictByReorder(routeId, recalculateSchedule = false) {
        const response = await this.authenticatedFetch(
            `${CONFIG.API_BASE}/routes/${routeId}/conflicts/resolve-by-reorder`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recalculateScheduleAfter: recalculateSchedule })
            }
        );
        if (!response.ok) {
            throw new Error('Failed to resolve conflicts');
        }
        return await response.json();
    }

    /**
     * Recalculate schedule after route reorder
     * @param {number} routeId - Route ID
     * @param {boolean} preserveLockedDays - Whether to preserve locked days
     * @returns {Promise<Object>} Recalculation result
     */
    static async recalculateSchedule(routeId, preserveLockedDays = true) {
        const response = await this.authenticatedFetch(
            `${CONFIG.API_BASE}/routes/${routeId}/schedule/recalculate?preserveLockedDays=${preserveLockedDays}`,
            {
                method: 'POST'
            }
        );
        if (!response.ok) {
            throw new Error('Failed to recalculate schedule');
        }
        return await response.json();
    }

    /**
     * Reorder places with schedule recalculation options
     * @param {number} routeId - Route ID
     * @param {number[]} placeIds - Array of place IDs in new order
     * @param {boolean} recalculateSchedule - Whether to recalculate schedule
     * @param {boolean} preserveLockedDays - Whether to preserve locked days
     * @returns {Promise<void>}
     */
    static async reorderPlacesWithSchedule(routeId, placeIds, recalculateSchedule = true, preserveLockedDays = true) {
        const response = await this.authenticatedFetch(
            `${CONFIG.API_BASE}/routes/${routeId}/places/reorder`,
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    placeIds,
                    recalculateSchedule,
                    preserveLockedDays
                })
            }
        );
        if (!response.ok) {
            throw new Error('Failed to reorder places');
        }
    }
}
