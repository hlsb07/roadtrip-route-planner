import { showSuccess, showError, showConfirm } from './utils.js';

/**
 * AllPlacesManager - Manages the "All Places" list (non-route places)
 * Shows all places that are NOT in the current route
 */
export class AllPlacesManager {
    constructor(filterManager, placeManager) {
        this.filterManager = filterManager;
        this.placeManager = placeManager;
        this.allPlaces = []; // All non-route places
        this.filteredPlaces = []; // Filtered non-route places
        this.searchQuery = '';
        this.selectedIndex = null; // Selected place index
    }

    /**
     * Get all places that are NOT in the current route
     */
    getNonRoutePlaces() {
        const routePlaceIds = new Set(this.placeManager.getPlaces().map(p => p.id));
        return this.filterManager.allPlaces.filter(p => !routePlaceIds.has(p.id));
    }

    /**
     * Update the all places list
     */
    updateAllPlacesList() {
        this.allPlaces = this.getNonRoutePlaces();
        this.applySearch();
        this.renderAllPlacesList();
    }

    /**
     * Apply search query to filter places
     */
    applySearch() {
        if (!this.searchQuery || this.searchQuery.trim() === '') {
            this.filteredPlaces = this.allPlaces;
        } else {
            const query = this.searchQuery.toLowerCase();
            this.filteredPlaces = this.allPlaces.filter(place =>
                place.name.toLowerCase().includes(query)
            );
        }
    }

    /**
     * Handle search input change
     */
    onSearchChange(query) {
        this.searchQuery = query;
        this.applySearch();
        this.renderAllPlacesList();
    }

    /**
     * Render the all places list in both desktop and mobile views
     */
    renderAllPlacesList() {
        const desktopList = document.getElementById('allPlacesList');
        const mobileList = document.getElementById('mobileAllPlacesList');
        const desktopCount = document.getElementById('allPlacesCount');
        const mobileCount = document.getElementById('mobileAllPlacesCount');

        // Update counts
        const countText = `${this.filteredPlaces.length} place${this.filteredPlaces.length !== 1 ? 's' : ''}`;
        if (desktopCount) desktopCount.textContent = countText;
        if (mobileCount) mobileCount.textContent = countText;

        // Generate HTML
        const html = this.generatePlacesListHTML();

        // Update both desktop and mobile
        if (desktopList) desktopList.innerHTML = html;
        if (mobileList) mobileList.innerHTML = html;

        // Attach search listeners
        this.attachSearchListeners();
    }

    /**
     * Generate HTML for all places list
     */
    generatePlacesListHTML() {
        if (this.filteredPlaces.length === 0) {
            if (this.searchQuery) {
                return `
                    <div class="empty-state">
                        <i class="fas fa-search" style="font-size: 3rem; opacity: 0.3;"></i>
                        <p>No places found matching "${this.searchQuery}"</p>
                    </div>
                `;
            }
            return `
                <div class="empty-state">
                    <i class="fas fa-database" style="font-size: 3rem; opacity: 0.3;"></i>
                    <p>No saved places yet</p>
                    <p style="font-size: 0.9rem; opacity: 0.7;">Use "Save Place" to add places to your library</p>
                </div>
            `;
        }

        // Sort places alphabetically by name
        const sortedPlaces = [...this.filteredPlaces].sort((a, b) =>
            a.name.localeCompare(b.name)
        );

        return sortedPlaces.map((place, index) => {
            // Get first category icon if available
            const categoryIcon = place.categories && place.categories.length > 0
                ? place.categories[0].icon || '📍'
                : '📍';

            // Get category names
            const categories = place.categories && place.categories.length > 0
                ? place.categories.map(c => c.name).join(', ')
                : '';

            // Get country names
            const countries = place.countries && place.countries.length > 0
                ? place.countries.map(c => c.name).join(', ')
                : '';

            // Build tags string
            const tags = [countries, categories].filter(t => t).join(' · ');

            // Check if this card is selected
            const isSelected = this.selectedIndex === index;

            return `
                <div class="all-place-card ${isSelected ? 'selected' : ''}"
                     data-place-id="${place.id}"
                     data-index="${index}"
                     onclick="allPlacesManager.selectCard(${index})">
                    <div class="all-place-card-icon">${categoryIcon}</div>
                    <div class="all-place-card-content">
                        <div class="all-place-card-name">${place.name}</div>
                        ${tags ? `<div class="all-place-card-tags">${tags}</div>` : ''}
                    </div>
                    <div class="all-place-card-actions">
                        <button class="all-place-btn add-btn" onclick="event.stopPropagation(); allPlacesManager.addToRoute(${place.id}, '${place.name.replace(/'/g, "\\'")}')">
                            <i class="fas fa-plus"></i> Add
                        </button>
                        <button class="all-place-btn edit-btn" onclick="event.stopPropagation(); allPlacesManager.editPlace(${place.id})">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="all-place-btn delete-btn" onclick="event.stopPropagation(); allPlacesManager.deletePlace(${place.id}, '${place.name.replace(/'/g, "\\'")}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Select a card by index
     */
    selectCard(index) {
        // Toggle selection
        if (this.selectedIndex === index) {
            this.selectedIndex = null; // Deselect if clicking the same card
            // Deselect map marker if app is available
            if (window.app?.mapService) {
                window.app.mapService.deselectAllPlace();
            }
        } else {
            this.selectedIndex = index; // Select the card
            // Select map marker if app is available
            if (window.app?.mapService) {
                window.app.mapService.selectAllPlace(index);
            }
        }
        this.updateAllPlacesList(); // Re-render to show selection

        // Show place on map
        const place = this.filteredPlaces[index];
        if (place) {
            this.viewPlaceOnMap(place.id);
        }
    }

    /**
     * Deselect the current card
     */
    deselectCard() {
        this.selectedIndex = null;
        // Deselect map marker if app is available
        if (window.app?.mapService) {
            window.app.mapService.deselectAllPlace();
        }
        this.updateAllPlacesList();
    }

    /**
     * Attach search input listeners
     */
    attachSearchListeners() {
        const desktopSearch = document.getElementById('allPlacesSearch');
        const mobileSearch = document.getElementById('mobileAllPlacesSearch');

        if (desktopSearch && !desktopSearch.dataset.listenerAttached) {
            desktopSearch.addEventListener('input', (e) => {
                this.onSearchChange(e.target.value);
            });
            desktopSearch.dataset.listenerAttached = 'true';
        }

        if (mobileSearch && !mobileSearch.dataset.listenerAttached) {
            mobileSearch.addEventListener('input', (e) => {
                this.onSearchChange(e.target.value);
            });
            mobileSearch.dataset.listenerAttached = 'true';
        }
    }

    /**
     * Add a place to the current route (opens position selector)
     */
    addToRoute(placeId, placeName) {
        if (this.placeManager) {
            this.placeManager.showAddPlacePositionModal(placeId, placeName);
        }
    }

    /**
     * Edit a place (opens edit modal)
     */
    async editPlace(placeId) {
        // Find the place in allPlaces
        const place = this.filterManager.allPlaces.find(p => p.id === placeId);
        if (!place) {
            showError('Place not found');
            return;
        }

        // Temporarily add to placeManager's places array so edit modal can work
        const tempIndex = this.placeManager.places.length;
        this.placeManager.places.push({
            id: place.id,
            name: place.name,
            coords: [place.latitude, place.longitude]
        });

        // Show edit modal
        await this.placeManager.showRenamePlaceModal(tempIndex);

        // Remove temporary place after modal closes
        this.placeManager.places.splice(tempIndex, 1);
    }

    /**
     * Delete a place from the database
     */
    async deletePlace(placeId, placeName) {
        const confirmed = await showConfirm({
            title: 'Delete Place Permanently',
            message: `Delete "${placeName}" permanently?\n\nThis will remove it from all routes and cannot be undone.`,
            type: 'danger',
            confirmText: 'Delete',
            cancelText: 'Cancel'
        });

        if (!confirmed) {
            return;
        }

        try {
            const response = await fetch(`${window.CONFIG.API_BASE}/places/${placeId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Failed to delete place');
            }

            showSuccess(`Deleted "${placeName}"`);

            // Refresh data
            await this.filterManager.refreshPlaces(this.placeManager.getPlaces());

            // Update UI
            this.updateAllPlacesList();

            // Update map if app is available
            if (window.app) {
                window.app.updateUI();
            }

        } catch (error) {
            console.error('Failed to delete place:', error);
            showError(error.message || 'Failed to delete place');
        }
    }

    /**
     * View a place on the map (center and open popup)
     */
    viewPlaceOnMap(placeId) {
        // Find the place
        const place = this.filterManager.allPlaces.find(p => p.id === placeId);
        if (!place) return;

        // Get map service
        if (!window.app || !window.app.mapService) return;

        const mapService = window.app.mapService;

        // Center map on the place
        mapService.map.setView([place.latitude, place.longitude], 13);

        // Find the gray marker for this place and open its popup
        const marker = mapService.nonRouteMarkers.find(m => {
            const latlng = m.getLatLng();
            return Math.abs(latlng.lat - place.latitude) < 0.0001 &&
                   Math.abs(latlng.lng - place.longitude) < 0.0001;
        });

        if (marker) {
            marker.openPopup();
        }
    }

    /**
     * Clear search
     */
    clearSearch() {
        this.searchQuery = '';
        const desktopSearch = document.getElementById('allPlacesSearch');
        const mobileSearch = document.getElementById('mobileAllPlacesSearch');

        if (desktopSearch) desktopSearch.value = '';
        if (mobileSearch) mobileSearch.value = '';

        this.applySearch();
        this.renderAllPlacesList();
    }
}
