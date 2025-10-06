import { ApiService } from './api.js';
import { parseGoogleMapsLink, validateCoordinates, formatPlaceName, showError } from './utils.js';
import { googleMapsBackendClient } from './google-maps-backend-client.js';

export class SearchManager {
    constructor() {
        this.currentTab = 'search';
        this.useGoogleMaps = true; // Try Google Maps backend first
        this.onSelectCallback = null; // Store callback for selecting places
    }

    setOnSelectCallback(callback) {
        this.onSelectCallback = callback;
    }

    switchTab(tab) {
        this.currentTab = tab;
        const tabs = document.querySelectorAll('.tab-btn');
        tabs.forEach(t => t.classList.remove('active'));

        // Find and activate the clicked tab
        const activeTab = Array.from(tabs).find(t => t.onclick.toString().includes(`'${tab}'`));
        if (activeTab) activeTab.classList.add('active');

        const input = document.getElementById('searchInput');
        const searchResults = document.getElementById('searchResults');
        searchResults.classList.remove('active');

        if (tab === 'search') {
            input.placeholder = 'Search for a place...';
        } else if (tab === 'coords') {
            input.placeholder = 'Click map or enter: lat, lng';
        } else if (tab === 'link') {
            input.placeholder = 'Paste Google Maps link...';
        }

        input.value = '';
        input.focus();
    }

    async handleSearch() {
        const input = document.getElementById('searchInput').value.trim();
        if (!input) return;

        if (this.currentTab === 'search') {
            return await this.searchPlace(input);
        } else if (this.currentTab === 'coords') {
            return this.addPlaceFromCoords(input);
        } else if (this.currentTab === 'link') {
            return this.parseGoogleMapsLink(input);
        }
    }

    async searchPlace(query) {
        const loading = document.getElementById('loading');
        const results = document.getElementById('searchResults');

        loading.classList.add('active');
        results.classList.remove('active');

        try {
            let data;
            let fromCache = false;

            if (this.useGoogleMaps) {
                // Try Google Maps backend first
                try {
                    const backendResponse = await googleMapsBackendClient.searchPlaces(query);

                    if (backendResponse.results && backendResponse.results.length > 0) {
                        // Convert Google Maps backend format to app format
                        data = backendResponse.results.map(result => ({
                            display_name: result.formattedAddress,
                            lat: result.latitude,
                            lon: result.longitude,
                            googlePlaceId: result.placeId,
                            name: result.name,
                            fromCache: result.fromCache
                        }));
                        fromCache = backendResponse.fromCache;

                        // Log statistics if available
                        if (backendResponse.statistics) {
                            console.log(`📊 Cache Stats - Hit Rate: ${backendResponse.statistics.cacheHitRate}%, Savings: $${backendResponse.statistics.estimatedCostSavings.toFixed(2)}`);
                        }
                    } else {
                        throw new Error('No results from Google Maps');
                    }
                } catch (googleError) {
                    console.warn('Google Maps backend failed, falling back to Nominatim:', googleError.message);
                    // Fallback to Nominatim
                    data = await ApiService.searchPlaces(query);
                    fromCache = false;
                }
            } else {
                // Use Nominatim directly
                data = await ApiService.searchPlaces(query);
                fromCache = false;
            }

            loading.classList.remove('active');

            if (data && data.length > 0) {
                this.displaySearchResults(data, fromCache, this.onSelectCallback);
                return data;
            } else {
                showError('No results found. Try different keywords.');
                return [];
            }
        } catch (error) {
            loading.classList.remove('active');
            showError('Search failed. Please try again.');
            return [];
        }
    }

    displaySearchResults(results, fromCache = false, onSelect) {
        const resultsDiv = document.getElementById('searchResults');
        resultsDiv.innerHTML = '';

        // Show cache indicator
        if (fromCache) {
            const cacheIndicator = document.createElement('div');
            cacheIndicator.className = 'cache-indicator';
            cacheIndicator.style.cssText = 'background: rgba(52, 168, 83, 0.1); color: #34a853; padding: 8px; border-radius: 6px; margin-bottom: 10px; font-weight: 600; font-size: 0.85rem; text-align: center;';
            cacheIndicator.innerHTML = '✅ From Cache (FREE - No API Cost)';
            resultsDiv.appendChild(cacheIndicator);
        } else if (results.some(r => r.googlePlaceId)) {
            const apiIndicator = document.createElement('div');
            apiIndicator.className = 'api-indicator';
            apiIndicator.style.cssText = 'background: rgba(251, 188, 4, 0.1); color: #f9ab00; padding: 8px; border-radius: 6px; margin-bottom: 10px; font-weight: 600; font-size: 0.85rem; text-align: center;';
            apiIndicator.innerHTML = '💸 Google API Call ($0.017) - Now Cached';
            resultsDiv.appendChild(apiIndicator);
        }

        results.forEach(result => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.innerHTML = `
                <strong>${result.name || result.display_name.split(',')[0]}</strong><br>
                <small>${result.display_name}</small>
                ${result.fromCache ? '<span style="color: #34a853; font-size: 0.75rem;">✓ cached</span>' : ''}
            `;
            item.onclick = () => {
                const place = {
                    name: result.name || result.display_name.split(',')[0],
                    coords: [parseFloat(result.lat), parseFloat(result.lon)],
                    googlePlaceId: result.googlePlaceId
                };
                onSelect(place);
                resultsDiv.classList.remove('active');
                document.getElementById('searchInput').value = '';
            };
            resultsDiv.appendChild(item);
        });

        resultsDiv.classList.add('active');
    }

    addPlaceFromCoords(coordsStr) {
        const validation = validateCoordinates(coordsStr);
        if (!validation.valid) {
            showError(validation.error);
            return null;
        }
        
        const place = {
            name: formatPlaceName(validation.lat, validation.lng),
            coords: [validation.lat, validation.lng]
        };
        
        document.getElementById('searchInput').value = '';
        return place;
    }

    parseGoogleMapsLink(url) {
        const result = parseGoogleMapsLink(url);
        
        if (result.shouldSearch) {
            return this.searchPlace(result.query);
        } else if (result.coords) {
            const place = { name: result.name, coords: result.coords };
            document.getElementById('searchInput').value = '';
            return place;
        } else {
            showError('Could not parse Google Maps link. Try copying the coordinates instead.');
            return null;
        }
    }

    onMapClick(coords, latlng) {
        if (this.currentTab === 'coords') {
            document.getElementById('searchInput').value = coords;
        }
    }

    getCurrentTab() {
        return this.currentTab;
    }
}