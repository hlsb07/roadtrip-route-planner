import { ApiService } from './api.js';
import { parseGoogleMapsLink, validateCoordinates, formatPlaceName, showError, showConfirm } from './utils.js';
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

    // Helper methods to get current elements (desktop or mobile)
    getSearchInput() {
        if (window.innerWidth <= 768) {
            return document.getElementById('mobileSearchInput') || document.getElementById('searchInput');
        } else {
            return document.getElementById('searchInput') || document.getElementById('mobileSearchInput');
        }
    }

    getSearchResults() {
        if (window.innerWidth <= 768) {
            return document.getElementById('mobileSearchResults') || document.getElementById('searchResults');
        } else {
            return document.getElementById('searchResults') || document.getElementById('mobileSearchResults');
        }
    }

    getLoadingElement() {
        if (window.innerWidth <= 768) {
            return document.getElementById('mobileLoading') || document.getElementById('loading');
        } else {
            return document.getElementById('loading') || document.getElementById('mobileLoading');
        }
    }

    switchTab(tab) {
        this.currentTab = tab;
        const tabs = document.querySelectorAll('.tab-btn');
        tabs.forEach(t => t.classList.remove('active'));

        // Find and activate the clicked tab
        const activeTab = Array.from(tabs).find(t => t.onclick.toString().includes(`'${tab}'`));
        if (activeTab) activeTab.classList.add('active');

        const input = this.getSearchInput();
        const searchResults = this.getSearchResults();
        if (searchResults) searchResults.classList.remove('active');

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
        const inputElement = this.getSearchInput();
        const input = inputElement.value.trim();
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
        const loading = this.getLoadingElement();
        const results = this.getSearchResults();

        if (loading) loading.classList.add('active');
        if (results) results.classList.remove('active');

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
                            fromCache: result.fromCache,
                            // Extended data
                            rating: result.rating,
                            userRatingsTotal: result.userRatingsTotal,
                            priceLevel: result.priceLevel,
                            website: result.website,
                            phoneNumber: result.phoneNumber,
                            openingHours: result.openingHours,
                            photos: result.photos || []
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

            if (loading) loading.classList.remove('active');

            if (data && data.length > 0) {
                this.displaySearchResults(data, fromCache, this.onSelectCallback);
                return data;
            } else {
                showError('No results found. Try different keywords.');
                return [];
            }
        } catch (error) {
            if (loading) loading.classList.remove('active');
            showError('Search failed. Please try again.');
            return [];
        }
    }

    displaySearchResults(results, fromCache = false, onSelect) {
        const resultsDiv = this.getSearchResults();
        if (!resultsDiv) return;

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

            // Build rating display
            let ratingHtml = '';
            if (result.rating) {
                const fullStars = Math.floor(result.rating);
                const hasHalfStar = result.rating % 1 >= 0.5;
                const starsHtml = '⭐'.repeat(fullStars) + (hasHalfStar ? '½' : '');
                const reviewCount = result.userRatingsTotal ? ` (${result.userRatingsTotal})` : '';
                ratingHtml = `<div class="place-rating">${starsHtml} ${result.rating.toFixed(1)}${reviewCount}</div>`;
            }

            // Build price level display
            let priceLevelHtml = '';
            if (result.priceLevel !== null && result.priceLevel !== undefined) {
                const dollarSigns = '$'.repeat(result.priceLevel);
                priceLevelHtml = `<span class="place-price">${dollarSigns}</span>`;
            }

            // Build photo thumbnail
            let photoHtml = '';
            if (result.photos && result.photos.length > 0 && result.photos[0].photoUrl) {
                photoHtml = `
                    <div class="place-photo">
                        <img src="${result.photos[0].photoUrl}" alt="${result.name}" />
                    </div>
                `;
            }

            item.innerHTML = `
                ${photoHtml}
                <div class="place-info">
                    <div class="place-header">
                        <strong>${result.name || result.display_name.split(',')[0]}</strong>
                        ${priceLevelHtml}
                        ${result.fromCache ? '<span class="cached-badge">✓ cached</span>' : ''}
                    </div>
                    ${ratingHtml}
                    <small class="place-address">${result.display_name}</small>
                </div>
            `;
            item.onclick = () => {
                const place = {
                    name: result.name || result.display_name.split(',')[0],
                    coords: [parseFloat(result.lat), parseFloat(result.lon)],
                    googlePlaceId: result.googlePlaceId,
                    // Pass extended data
                    rating: result.rating,
                    userRatingsTotal: result.userRatingsTotal,
                    priceLevel: result.priceLevel,
                    website: result.website,
                    phoneNumber: result.phoneNumber,
                    openingHours: result.openingHours,
                    photos: result.photos || []
                };

                // If it's a Google place, show save options modal
                if (place.googlePlaceId) {
                    this.showSaveOptionsModal(place);
                } else {
                    // Regular place without Google data - use existing flow
                    onSelect(place);
                }

                resultsDiv.classList.remove('active');
                const input = this.getSearchInput();
                if (input) input.value = '';
            };
            resultsDiv.appendChild(item);
        });

        resultsDiv.classList.add('active');
    }

    /**
     * Show modal with options to save Google place
     * @param {Object} place - Place data from Google
     */
    showSaveOptionsModal(place) {
        const modal = document.getElementById('saveOptionsModal');
        if (!modal) {
            console.error('Save options modal not found');
            // Fallback to old behavior
            if (this.onSelectCallback) {
                this.onSelectCallback(place);
            }
            return;
        }

        // Populate modal
        document.getElementById('saveOptionsPlaceName').textContent = place.name;
        const notesInput = document.getElementById('saveOptionsNotes');
        if (notesInput) {
            notesInput.value = '';
        }

        // Set up button handlers
        const saveOnlyBtn = document.getElementById('saveOptionsOnlyBtn');
        const addToRouteBtn = document.getElementById('saveOptionsAddToRouteBtn');
        const cancelBtn = document.getElementById('saveOptionsCancelBtn');

        const cleanup = () => {
            modal.classList.remove('active');
            if (saveOnlyBtn) saveOnlyBtn.onclick = null;
            if (addToRouteBtn) addToRouteBtn.onclick = null;
            if (cancelBtn) cancelBtn.onclick = null;
        };

        if (saveOnlyBtn) {
            saveOnlyBtn.onclick = async () => {
                const notes = notesInput ? notesInput.value.trim() : null;
                cleanup();

                // Get placeManager from window.app
                if (window.app && window.app.placeManager) {
                    await window.app.placeManager.addPlaceFromGoogle(
                        place.googlePlaceId,
                        place.name,
                        notes,
                        false // Don't add to route
                    );
                }
            };
        }

        if (addToRouteBtn) {
            addToRouteBtn.onclick = async () => {
                const notes = notesInput ? notesInput.value.trim() : null;
                cleanup();

                // Get placeManager from window.app
                if (window.app && window.app.placeManager) {
                    await window.app.placeManager.addPlaceFromGoogle(
                        place.googlePlaceId,
                        place.name,
                        notes,
                        true // Add to route
                    );

                    // Update UI
                    if (window.app.updateUI) {
                        window.app.updateUI();
                    }
                }
            };
        }

        if (cancelBtn) {
            cancelBtn.onclick = () => {
                cleanup();
            };
        }

        // Show modal
        modal.classList.add('active');
    }

    addPlaceFromCoords(coordsStr) {
        const validation = validateCoordinates(coordsStr);
        if (!validation.valid) {
            showError(validation.error);
            return null;
        }

        // Show options modal: Manual or Nearby Search
        this.showCoordinatesOptionsModal(validation.lat, validation.lng);
        return null; // Let modal handle the rest
    }

    /**
     * Show modal with options for coordinates: manual or nearby search
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     */
    showCoordinatesOptionsModal(lat, lng) {
        const modal = document.getElementById('coordinatesOptionsModal');
        if (!modal) {
            console.error('Coordinates options modal not found');
            // Fallback: create manual place
            const place = {
                name: formatPlaceName(lat, lng),
                coords: [lat, lng]
            };
            if (this.onSelectCallback) {
                this.onSelectCallback(place);
            }
            return;
        }

        // Populate modal
        document.getElementById('coordsOptionsLatLng').textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

        // Set up button handlers
        const manualBtn = document.getElementById('coordsOptionsManualBtn');
        const nearbyBtn = document.getElementById('coordsOptionsNearbyBtn');
        const cancelBtn = document.getElementById('coordsOptionsCancelBtn');

        const cleanup = () => {
            modal.classList.remove('active');
            if (manualBtn) manualBtn.onclick = null;
            if (nearbyBtn) nearbyBtn.onclick = null;
            if (cancelBtn) cancelBtn.onclick = null;
        };

        if (manualBtn) {
            manualBtn.onclick = () => {
                cleanup();
                // Create manual place
                const place = {
                    name: formatPlaceName(lat, lng),
                    coords: [lat, lng]
                };
                if (this.onSelectCallback) {
                    this.onSelectCallback(place);
                }
            };
        }

        if (nearbyBtn) {
            nearbyBtn.onclick = async () => {
                cleanup();
                await this.searchNearbyGooglePlaces(lat, lng);
            };
        }

        if (cancelBtn) {
            cancelBtn.onclick = () => {
                cleanup();
            };
        }

        // Show modal
        modal.classList.add('active');
    }

    /**
     * Search for nearby Google Places at coordinates
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @param {number} radius - Search radius in meters (default 100)
     */
    async searchNearbyGooglePlaces(lat, lng, radius = 100) {
        const loading = this.getLoadingElement();
        const results = this.getSearchResults();

        if (loading) loading.classList.add('active');
        if (results) results.classList.remove('active');

        try {
            // Call nearby search endpoint
            const response = await googleMapsBackendClient.nearbySearch(lat, lng, radius);

            if (loading) loading.classList.remove('active');

            if (response.results && response.results.length > 0) {
                // Convert nearby results to same format as search results
                const formattedResults = response.results.map(result => ({
                    display_name: result.formattedAddress || result.name,
                    lat: result.latitude,
                    lon: result.longitude,
                    googlePlaceId: result.placeId,
                    name: result.name,
                    rating: result.rating,
                    userRatingsTotal: result.userRatingsTotal,
                    priceLevel: result.priceLevel,
                    website: result.website,
                    phoneNumber: result.phoneNumber,
                    openingHours: result.openingHours,
                    photos: result.photos || []
                }));

                // Show results in search results display
                this.displaySearchResults(formattedResults, false, this.onSelectCallback);
                showSuccess(`Found ${formattedResults.length} nearby places within ${radius}m`);
            } else {
                showError(`No nearby places found within ${radius}m. Try manual coordinates instead.`);
                // Offer to create manual place
                const place = {
                    name: formatPlaceName(lat, lng),
                    coords: [lat, lng]
                };
                const confirmed = await showConfirm({
                    title: 'No Places Found',
                    message: 'Create a manual place at these coordinates instead?',
                    type: 'question',
                    confirmText: 'Create',
                    cancelText: 'Cancel'
                });

                if (confirmed && this.onSelectCallback) {
                    this.onSelectCallback(place);
                }
            }
        } catch (error) {
            if (loading) loading.classList.remove('active');
            console.error('Nearby search failed:', error);
            showError('Nearby search failed. Try manual coordinates instead.');
            // Fallback to manual place
            const place = {
                name: formatPlaceName(lat, lng),
                coords: [lat, lng]
            };
            if (this.onSelectCallback) {
                this.onSelectCallback(place);
            }
        }
    }

    parseGoogleMapsLink(url) {
        const result = parseGoogleMapsLink(url);

        if (result.shouldSearch) {
            return this.searchPlace(result.query);
        } else if (result.coords) {
            const place = { name: result.name, coords: result.coords };
            const input = this.getSearchInput();
            if (input) input.value = '';
            return place;
        } else {
            showError('Could not parse Google Maps link. Try copying the coordinates instead.');
            return null;
        }
    }

    onMapClick(coords, latlng) {
        if (this.currentTab === 'coords') {
            const input = this.getSearchInput();
            if (input) input.value = coords;
        }
    }

    getCurrentTab() {
        return this.currentTab;
    }
}