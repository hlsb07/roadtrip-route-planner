import { ApiService } from './api.js';
import { showSuccess, showError, sleep } from './utils.js';

export class PlaceManager {
    constructor(routeManager, onUpdate = null) {
        this.routeManager = routeManager;
        this.places = [];
        this.onUpdate = onUpdate;
        this.selectedIndex = null;
        this.sortableInstances = {}; // Track Sortable instances
        this.sortingEnabled = false; // Track if sorting mode is active
    }

    async addPlace(place) {
        const currentRouteId = this.routeManager.getCurrentRouteId();
        if (!currentRouteId) {
            showError('No route selected. Create a route first.');
            return false;
        }
        
        try {
            // 1. Create place in Places table (if not already exists)
            let placeId = place.id;
            
            if (!placeId) {
                const newPlace = await ApiService.createPlace(
                    place.name,
                    place.coords[0],
                    place.coords[1]
                );
                placeId = newPlace.id;
            }
            
            // 2. Add place to current route
            await ApiService.addPlaceToRoute(currentRouteId, placeId);
            
            // 3. Reload current route and update UI
            this.places = await this.routeManager.loadCurrentRoute();
            await this.routeManager.loadRoutes(); // For place count update
            
            showSuccess(`Added "${place.name}" to route!`);
            return true;
            
        } catch (error) {
            console.error('Failed to add place:', error);
            showError(error.message || 'Failed to add place to route');
            return false;
        }
    }

    async removePlace(index) {
        const currentRouteId = this.routeManager.getCurrentRouteId();
        if (!currentRouteId || !this.places[index]) return false;

        const place = this.places[index];

        if (!confirm(`Remove "${place.name}" from this route?`)) {
            return false;
        }

        try {
            await ApiService.removePlaceFromRoute(currentRouteId, place.id);

            this.places = await this.routeManager.loadCurrentRoute();
            await this.routeManager.loadRoutes(); // For place count update

            // Clear selection if removed place was selected
            if (this.selectedIndex === index) {
                this.selectedIndex = null;
            } else if (this.selectedIndex > index) {
                this.selectedIndex--;
            }

            showSuccess(`Removed "${place.name}" from route`);
            return true;

        } catch (error) {
            console.error('Failed to remove place:', error);
            showError('Failed to remove place');
            return false;
        }
    }

    async renamePlace(index, newName) {
        if (!this.places[index]) return false;

        const place = this.places[index];

        try {
            await ApiService.updatePlace(place.id, newName);

            this.places = await this.routeManager.loadCurrentRoute();
            await this.routeManager.loadRoutes(); // For place count update

            showSuccess(`Renamed to "${newName}"`);
            return true;

        } catch (error) {
            console.error('Failed to rename place:', error);
            showError('Failed to rename place');
            return false;
        }
    }

    showRenamePlaceModal(index) {
        if (!this.places[index]) return;

        const place = this.places[index];
        const modal = document.getElementById('renamePlaceModal');
        const nameInput = document.getElementById('placeName');
        const coordsDisplay = document.getElementById('placeCoords');

        if (!modal || !nameInput || !coordsDisplay) return;

        // Set current values
        nameInput.value = place.name;
        coordsDisplay.textContent = `${place.coords[0].toFixed(6)}, ${place.coords[1].toFixed(6)}`;

        // Store the index for saving
        modal.dataset.placeIndex = index;

        // Show modal
        modal.classList.add('active');
        nameInput.focus();
        nameInput.select();
    }

    closePlaceModal() {
        const modal = document.getElementById('renamePlaceModal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    async savePlaceRename() {
        const modal = document.getElementById('renamePlaceModal');
        const nameInput = document.getElementById('placeName');

        if (!modal || !nameInput) return;

        const index = parseInt(modal.dataset.placeIndex);
        const newName = nameInput.value.trim();

        if (!newName) {
            showError('Please enter a name');
            return;
        }

        const success = await this.renamePlace(index, newName);

        if (success) {
            this.closePlaceModal();
            if (this.onUpdate) {
                this.onUpdate();
            }
        }
    }

    async reorderPlaces(newOrder) {
        const currentRouteId = this.routeManager.getCurrentRouteId();
        if (!currentRouteId) return false;
        
        try {
            await ApiService.reorderPlaces(currentRouteId, newOrder);
            this.places = await this.routeManager.loadCurrentRoute();
            return true;
            
        } catch (error) {
            console.error('Failed to reorder places:', error);
            showError('Failed to reorder places');
            return false;
        }
    }

    async importPlaces(placesToImport) {
        const currentRouteId = this.routeManager.getCurrentRouteId();
        if (!currentRouteId) {
            showError('Please select a route first!');
            return false;
        }
        
        let successCount = 0;
        
        for (const place of placesToImport) {
            if (place.name && place.coords && place.coords.length === 2) {
                const success = await this.addPlace({
                    name: place.name,
                    coords: place.coords
                });
                
                if (success) successCount++;
                
                // Short pause between adds
                await sleep(300);
            }
        }
        
        showSuccess(`Import completed! Added ${successCount} places to your current route.`);
        return successCount > 0;
    }

    updatePlacesList(onRemove) {
        const placesList = document.getElementById('placesList');
        const mobilePlacesList = document.querySelector('#mobilePanelContent .places-list');
        const currentRouteId = this.routeManager.getCurrentRouteId();

        const noRouteContent = `
            <div style="text-align: center; padding: 40px; color: #999;">
                <i class="fas fa-route" style="font-size: 2rem; margin-bottom: 10px; opacity: 0.5;"></i><br>
                No route selected.<br>
                <button class="btn" onclick="routeManager.showCreateRouteModal()" style="margin-top: 10px;">
                    <i class="fas fa-plus"></i> Create Your First Route
                </button>
            </div>`;

        const noPlacesContent = `
            <div style="text-align: center; padding: 40px; color: #999;">
                <i class="fas fa-map-marker-alt" style="font-size: 2rem; margin-bottom: 10px; opacity: 0.5;"></i><br>
                No places in this route yet.<br>
                Start by searching or clicking the map!
            </div>`;

        if (!currentRouteId) {
            placesList.innerHTML = noRouteContent;
            if (mobilePlacesList) mobilePlacesList.innerHTML = noRouteContent;
            return;
        }

        if (this.places.length === 0) {
            placesList.innerHTML = noPlacesContent;
            if (mobilePlacesList) mobilePlacesList.innerHTML = noPlacesContent;
            return;
        }

        // Add sorting mode banner if active
        const sortingBanner = this.sortingEnabled ? `
            <div class="sorting-mode-banner">
                <div class="sorting-banner-content">
                    <i class="fas fa-grip-vertical"></i>
                    <span>Sorting Mode Active - Drag items to reorder</span>
                </div>
                <button class="btn-done" onclick="placeManager.disableSorting()">
                    <i class="fas fa-check"></i> Done
                </button>
            </div>
        ` : '';

        const placesHTML = this.places.map((place, index) => {
            const isSelected = this.selectedIndex === index;
            return `
            <div class="place-item ${isSelected ? 'selected' : ''} ${this.sortingEnabled ? 'sorting-mode' : ''}"
                 data-index="${index}"
                 data-place-id="${place.id}"
                 onclick="placeManager.togglePlaceSelection(${index})">
                <div class="place-header">
                    <div class="place-number">${index + 1}</div>
                    <div class="place-name">${place.name}</div>
                    ${this.sortingEnabled ? '<div class="sort-handle"><i class="fas fa-grip-vertical"></i></div>' : ''}
                    ${isSelected && !this.sortingEnabled ? `
                    <div class="place-actions">
                        <button class="action-btn rename-btn"
                                onclick="event.stopPropagation(); placeManager.showRenamePlaceModal(${index})"
                                title="Rename place">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="action-btn sort-btn"
                                onclick="event.stopPropagation(); placeManager.enableSorting()"
                                title="Enable sorting mode">
                            <i class="fas fa-grip-vertical"></i>
                        </button>
                        <button class="action-btn delete-btn"
                                onclick="event.stopPropagation(); placeManager.removePlace(${index})"
                                title="Remove from route">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                    ` : ''}
                </div>
                ${!this.sortingEnabled ? `
                <div class="place-links">
                    <a href="https://www.google.com/maps/search/?api=1&query=${place.coords[0]},${place.coords[1]}"
                    target="_blank"
                    class="link-btn google-maps"
                    onclick="event.stopPropagation()">
                        <i class="fas fa-map"></i> Maps
                    </a>
                    <a href="https://www.google.com/maps/dir/?api=1&destination=${place.coords[0]},${place.coords[1]}"
                    target="_blank"
                    class="link-btn google-nav"
                    onclick="event.stopPropagation()">
                        <i class="fas fa-directions"></i> Navigate
                    </a>
                </div>
                ` : ''}
            </div>
        `}).join('');

        placesList.innerHTML = sortingBanner + placesHTML;
        if (mobilePlacesList) mobilePlacesList.innerHTML = sortingBanner + placesHTML;

        // Initialize sortable for drag & drop (disabled by default)
        this.initSortable(placesList);

        // Initialize sortable for mobile if exists
        if (mobilePlacesList) {
            this.initSortable(mobilePlacesList);
        }
    }

    initSortable(element) {
        if (!element) return;

        // Get unique key for this element
        const elementKey = element.id || element.className;

        // Destroy existing Sortable instance if it exists
        if (this.sortableInstances[elementKey]) {
            this.sortableInstances[elementKey].destroy();
            delete this.sortableInstances[elementKey];
        }

        // Create new Sortable instance (disabled by default)
        this.sortableInstances[elementKey] = new Sortable(element, {
            animation: 300,
            ghostClass: 'dragging',
            disabled: !this.sortingEnabled, // Only enabled when sorting mode is active
            handle: '.sort-handle', // Allow dragging the entire item when sorting is enabled
            scrollSensitivity: 100, // Better scroll detection
            scrollSpeed: 5, // Scroll speed while dragging
            touchStartThreshold: 5, // Pixels of movement before starting drag
            onStart: (evt) => {
                // Add visual feedback when dragging starts
                evt.item.style.opacity = '0.7';
            },
            onEnd: async (evt) => {
                // Remove visual feedback
                evt.item.style.opacity = '1';

                // Determine new order - filter out banner and only get place items
                const newOrder = Array.from(element.children)
                    .filter(item => item.classList.contains('place-item'))
                    .map(item => {
                        const placeId = parseInt(item.dataset.placeId);
                        return placeId;
                    })
                    .filter(id => !isNaN(id)); // Remove any NaN values

                console.log('New order:', newOrder);

                if (newOrder.length === 0) {
                    console.error('No valid place IDs found');
                    return;
                }

                // API call for reorder
                const success = await this.reorderPlaces(newOrder);
                if (success) {
                    // Keep sorting mode enabled - user can continue reordering
                    // or exit manually by clicking selected item / done button

                    // Update UI AND MAP on success - important for seeing new order
                    if (this.onUpdate) {
                        this.onUpdate(); // This will update both list and map
                    }
                } else {
                    // Reset UI on failure
                    this.updatePlacesList();
                }
            }
        });
    }

    togglePlaceSelection(index) {
        if (this.sortingEnabled) {
            // In sorting mode: only allow changing selection, not exiting
            this.selectedIndex = index;
            this.updatePlacesList();

            // Update map selection
            if (window.app) {
                window.app.selectPlace(index);
            }
            return;
        }

        // Normal mode (not sorting):
        if (this.selectedIndex === index) {
            // Deselect if clicking the same item
            this.selectedIndex = null;
        } else {
            // Select the new item
            this.selectedIndex = index;
        }

        this.updatePlacesList();

        // Update map selection
        if (window.app && this.selectedIndex !== null) {
            window.app.selectPlace(this.selectedIndex);
        }
    }

    enableSorting() {
        this.sortingEnabled = true;

        // Enable all sortable instances
        Object.values(this.sortableInstances).forEach(instance => {
            if (instance) {
                instance.option('disabled', false);
            }
        });

        // Update UI to show sorting mode (visual feedback via styling)
        this.updatePlacesList();
    }

    disableSorting() {
        this.sortingEnabled = false;

        // Disable all sortable instances
        Object.values(this.sortableInstances).forEach(instance => {
            if (instance) {
                instance.option('disabled', true);
            }
        });

        // Update UI
        this.updatePlacesList();
    }

    getPlaces() {
        return this.places;
    }

    setPlaces(places) {
        this.places = places;
    }

    async exportRoute() {
        const currentRoute = this.routeManager.getCurrentRoute();
        if (!currentRoute) {
            showError('No route selected');
            return;
        }
        
        try {
            const exportData = {
                name: currentRoute.name,
                description: currentRoute.description,
                created: new Date().toISOString(),
                places: this.places.map(p => ({
                    name: p.name,
                    coords: p.coords
                }))
            };
            
            const blob = new Blob([JSON.stringify(exportData, null, 2)], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${currentRoute.name.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
            a.click();
            
        } catch (error) {
            showError('Export failed');
        }
    }

    clearRoute() {
        if (this.places.length === 0) return;

        if (confirm('Clear all places from your route?')) {
            // Note: This would need API implementation
            this.places = [];
            return true;
        }
        return false;
    }

    selectPlace(index) {
        if (index < 0 || index >= this.places.length) return;
        this.selectedIndex = index;

        // Scroll to the selected place in the list
        setTimeout(() => {
            const selectedElement = document.querySelector(`.place-item[data-index="${index}"]`);
            if (selectedElement) {
                selectedElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }, 100);
    }

    deselectPlace() {
        this.selectedIndex = null;
    }
}