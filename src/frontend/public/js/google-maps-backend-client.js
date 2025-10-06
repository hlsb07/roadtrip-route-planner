/**
 * Google Maps Backend Client
 * Calls backend API instead of Google Maps directly
 */

import { CONFIG } from './config.js';

export class GoogleMapsBackendClient {
    constructor() {
        this.apiBase = CONFIG.API_BASE || 'http://localhost:5166/api';
    }

    /**
     * Search places via backend API
     * @param {string} query - Search query
     * @returns {Promise<Object>} - Search results with cache info
     */
    async searchPlaces(query) {
        try {
            const response = await fetch(
                `${this.apiBase}/googlemaps/search?query=${encodeURIComponent(query)}`
            );

            if (!response.ok) {
                throw new Error(`Search failed: ${response.status}`);
            }

            const data = await response.json();

            // Log cache status
            if (data.fromCache) {
                console.log(`✅ Cache HIT for "${query}" - FREE!`);
            } else {
                console.log(`💸 API Call for "${query}" - Cost: $0.017`);
            }

            // Log statistics
            if (data.statistics) {
                console.log(`📊 Cache Stats:`, {
                    hitRate: `${data.statistics.cacheHitRate}%`,
                    savings: `$${data.statistics.estimatedCostSavings.toFixed(2)}`
                });
            }

            return data;
        } catch (error) {
            console.error('Backend search failed:', error);
            throw error;
        }
    }

    /**
     * Get place details via backend API
     * @param {string} placeId - Google Place ID
     * @returns {Promise<Object>} - Place details
     */
    async getPlaceDetails(placeId) {
        try {
            const response = await fetch(
                `${this.apiBase}/googlemaps/place/${encodeURIComponent(placeId)}`
            );

            if (!response.ok) {
                throw new Error(`Place details failed: ${response.status}`);
            }

            const data = await response.json();

            // Log cache status
            if (data.fromCache) {
                console.log(`✅ Cache HIT for place ${placeId} - FREE!`);
            } else {
                console.log(`💸 API Call for place ${placeId} - Cost: $0.017`);
            }

            return data;
        } catch (error) {
            console.error('Failed to get place details:', error);
            throw error;
        }
    }

    /**
     * Get cache statistics
     * @returns {Promise<Object>} - Cache statistics
     */
    async getStatistics() {
        try {
            const response = await fetch(`${this.apiBase}/googlemaps/stats`);

            if (!response.ok) {
                throw new Error(`Stats failed: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Failed to get statistics:', error);
            throw error;
        }
    }

    /**
     * Clean expired cache entries
     * @returns {Promise<Object>} - Cleanup result
     */
    async cleanCache() {
        try {
            const response = await fetch(
                `${this.apiBase}/googlemaps/cache/clean`,
                { method: 'POST' }
            );

            if (!response.ok) {
                throw new Error(`Cache clean failed: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Failed to clean cache:', error);
            throw error;
        }
    }

    /**
     * Convert backend results to app format (compatible with existing code)
     * @param {Object} backendData - Backend search response
     * @returns {Array} - Array of places in app format
     */
    convertToAppFormat(backendData) {
        return backendData.results.map(result => ({
            // Nominatim-compatible format
            display_name: result.formattedAddress,
            lat: result.latitude,
            lon: result.longitude,
            // Google-specific data
            googlePlaceId: result.placeId,
            name: result.name,
            types: result.types,
            fromCache: result.fromCache
        }));
    }

    /**
     * Format place for adding to route
     * @param {Object} result - Backend search result
     * @returns {Object} - Place object for route
     */
    formatForRoute(result) {
        return {
            name: result.name || result.formattedAddress.split(',')[0],
            coords: [result.latitude, result.longitude],
            googlePlaceId: result.placeId,
            address: result.formattedAddress
        };
    }
}

// Create singleton instance
export const googleMapsBackendClient = new GoogleMapsBackendClient();

/**
 * Display cache statistics in UI
 */
export async function displayCacheStats() {
    try {
        const stats = await googleMapsBackendClient.getStatistics();

        console.log('📊 Google Maps Cache Statistics:');
        console.log(`Total Cached Places: ${stats.totalCachedPlaces}`);
        console.log(`Cache Hits: ${stats.cacheHits}`);
        console.log(`API Calls: ${stats.apiCalls}`);
        console.log(`Cache Hit Rate: ${stats.cacheHitRate}%`);
        console.log(`Estimated Savings: $${stats.estimatedCostSavings.toFixed(2)}`);

        // Update UI if elements exist
        const hitRateEl = document.getElementById('google-cache-hit-rate');
        if (hitRateEl) {
            hitRateEl.textContent = `${stats.cacheHitRate}%`;
        }

        const savingsEl = document.getElementById('google-cost-savings');
        if (savingsEl) {
            savingsEl.textContent = `$${stats.estimatedCostSavings.toFixed(2)}`;
        }

        return stats;
    } catch (error) {
        console.error('Failed to display cache stats:', error);
    }
}

// Make available globally
window.googleMapsBackendClient = googleMapsBackendClient;
window.displayGoogleCacheStats = displayCacheStats;
