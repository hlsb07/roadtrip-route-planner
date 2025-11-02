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

    async showRenamePlaceModal(index) {
        if (!this.places[index]) return;

        const place = this.places[index];
        const modal = document.getElementById('editPlaceModal');
        const nameInput = document.getElementById('placeName');
        const latInput = document.getElementById('placeLatitude');
        const lngInput = document.getElementById('placeLongitude');

        if (!modal || !nameInput || !latInput || !lngInput) return;

        // Set current values
        nameInput.value = place.name;
        latInput.value = place.coords[0];
        lngInput.value = place.coords[1];

        // Store the index and placeId for saving
        modal.dataset.placeIndex = index;
        modal.dataset.placeId = place.id;

        // Load categories and countries
        await this.loadCategoriesAndCountries(place.id);

        // Show modal
        modal.classList.add('active');
        nameInput.focus();
        nameInput.select();
    }

    startLocationChange() {
        // Hide the modal completely by adding class to the modal itself
        const modal = document.getElementById('editPlaceModal');
        if (modal) {
            modal.classList.add('location-change-mode');
        }

        // Hide sidebar for better map focus (desktop)
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.add('location-change-hidden');

        // Hide mobile navigation and panel for better map focus
        const mobileNav = document.getElementById('mobileNav');
        if (mobileNav) mobileNav.classList.add('location-change-hidden');

        const mobilePanel = document.getElementById('mobilePanel');
        if (mobilePanel) mobilePanel.classList.add('location-change-hidden');

        // Enable map coordinate selection
        this.enableMapCoordinateSelection();

        // Show instruction banner on map
        this.showLocationChangeInstructions();
    }

    showLocationChangeInstructions() {
        // Remove existing banner if any
        const existingBanner = document.getElementById('locationChangeBanner');
        if (existingBanner) {
            existingBanner.remove();
        }

        // Create instruction banner
        const banner = document.createElement('div');
        banner.id = 'locationChangeBanner';
        banner.className = 'location-change-banner';
        banner.innerHTML = `
            <div class="location-banner-content">
                <i class="fas fa-map-marker-alt"></i>
                <span>Click on the map to select new location</span>
            </div>
            <button class="btn-location-done" onclick="placeManager.finishLocationChange()">
                <i class="fas fa-check"></i> Done
            </button>
        `;

        // Add to map container
        const mapContainer = document.getElementById('map');
        if (mapContainer) {
            mapContainer.appendChild(banner);
        }
    }

    finishLocationChange() {
        // Remove instruction banner
        const banner = document.getElementById('locationChangeBanner');
        if (banner) {
            banner.remove();
        }

        // Show modal again by removing the class from modal itself
        const modal = document.getElementById('editPlaceModal');
        if (modal) {
            modal.classList.remove('location-change-mode');
        }

        // Show sidebar again (desktop)
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.remove('location-change-hidden');

        // Show mobile navigation and panel again
        const mobileNav = document.getElementById('mobileNav');
        if (mobileNav) mobileNav.classList.remove('location-change-hidden');

        const mobilePanel = document.getElementById('mobilePanel');
        if (mobilePanel) mobilePanel.classList.remove('location-change-hidden');

        // Disable coordinate selection mode
        this.disableMapCoordinateSelection();
    }

    enableMapCoordinateSelection() {
        // Set flag that we're in coordinate selection mode
        if (window.app && window.app.mapService) {
            window.app.mapService.setCoordinateSelectionMode(true, (lat, lng) => {
                // Update coordinate inputs when map is clicked
                const latInput = document.getElementById('placeLatitude');
                const lngInput = document.getElementById('placeLongitude');

                if (latInput && lngInput) {
                    latInput.value = lat.toFixed(6);
                    lngInput.value = lng.toFixed(6);

                    // Visual feedback
                    latInput.classList.add('coords-updated');
                    lngInput.classList.add('coords-updated');

                    setTimeout(() => {
                        latInput.classList.remove('coords-updated');
                        lngInput.classList.remove('coords-updated');
                    }, 1000);
                }
            });
        }
    }

    disableMapCoordinateSelection() {
        if (window.app && window.app.mapService) {
            window.app.mapService.setCoordinateSelectionMode(false);
        }
    }

    async loadCategoriesAndCountries(placeId) {
        try {
            // Fetch all categories and countries
            const [allCategories, allCountries, placeCategories, placeCountries] = await Promise.all([
                ApiService.getAllCategories(),
                ApiService.getAllCountries(),
                ApiService.getPlaceCategories(placeId),
                ApiService.getPlaceCountries(placeId)
            ]);

            // Get selected IDs
            const selectedCategoryIds = placeCategories.map(c => c.id);
            const selectedCountryIds = placeCountries.map(c => c.id);

            // Render categories
            const categoriesContainer = document.getElementById('categoriesContainer');
            if (categoriesContainer) {
                categoriesContainer.innerHTML = allCategories.map(cat => `
                    <label class="checkbox-item">
                        <input
                            type="checkbox"
                            class="category-checkbox"
                            data-id="${cat.id}"
                            ${selectedCategoryIds.includes(cat.id) ? 'checked' : ''}
                        >
                        <span class="checkbox-icon">${cat.icon || '📍'}</span>
                        <span class="checkbox-label">${cat.name}</span>
                    </label>
                `).join('');
            }

            // Render countries
            const countriesContainer = document.getElementById('countriesContainer');
            if (countriesContainer) {
                countriesContainer.innerHTML = allCountries.map(country => `
                    <label class="checkbox-item">
                        <input
                            type="checkbox"
                            class="country-checkbox"
                            data-id="${country.id}"
                            ${selectedCountryIds.includes(country.id) ? 'checked' : ''}
                        >
                        <span class="checkbox-icon">${country.icon || '🌍'}</span>
                        <span class="checkbox-label">${country.name}</span>
                    </label>
                `).join('');
            }

        } catch (error) {
            console.error('Failed to load categories and countries:', error);
            showError('Failed to load categories and countries');
        }
    }

    closePlaceModal() {
        const modal = document.getElementById('editPlaceModal');
        if (modal) {
            modal.classList.remove('active');
            // Remove location change mode if active
            modal.classList.remove('location-change-mode');
        }

        // Show sidebar again if it was hidden (desktop)
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.remove('location-change-hidden');

        // Show mobile navigation and panel again if they were hidden
        const mobileNav = document.getElementById('mobileNav');
        if (mobileNav) mobileNav.classList.remove('location-change-hidden');

        const mobilePanel = document.getElementById('mobilePanel');
        if (mobilePanel) mobilePanel.classList.remove('location-change-hidden');

        // Remove location change banner if exists
        const banner = document.getElementById('locationChangeBanner');
        if (banner) {
            banner.remove();
        }

        // Disable map coordinate selection
        this.disableMapCoordinateSelection();
    }

    async savePlaceEdit() {
        const modal = document.getElementById('editPlaceModal');
        const nameInput = document.getElementById('placeName');
        const latInput = document.getElementById('placeLatitude');
        const lngInput = document.getElementById('placeLongitude');

        if (!modal || !nameInput || !latInput || !lngInput) return;

        const index = parseInt(modal.dataset.placeIndex);
        const placeId = parseInt(modal.dataset.placeId);
        const newName = nameInput.value.trim();
        const newLat = parseFloat(latInput.value);
        const newLng = parseFloat(lngInput.value);

        // Validation
        if (!newName) {
            showError('Please enter a name');
            return;
        }

        if (isNaN(newLat) || newLat < -90 || newLat > 90) {
            showError('Latitude must be between -90 and 90');
            return;
        }

        if (isNaN(newLng) || newLng < -180 || newLng > 180) {
            showError('Longitude must be between -180 and 180');
            return;
        }

        try {
            // Update place name and coordinates
            await ApiService.updatePlace(placeId, newName, newLat, newLng);

            // Get selected categories and countries
            const selectedCategories = Array.from(document.querySelectorAll('.category-checkbox:checked'))
                .map(cb => parseInt(cb.dataset.id));
            const selectedCountries = Array.from(document.querySelectorAll('.country-checkbox:checked'))
                .map(cb => parseInt(cb.dataset.id));

            // Get current categories and countries
            const currentCategories = await ApiService.getPlaceCategories(placeId);
            const currentCountries = await ApiService.getPlaceCountries(placeId);

            const currentCategoryIds = currentCategories.map(c => c.id);
            const currentCountryIds = currentCountries.map(c => c.id);

            // Update categories
            const categoriesToAdd = selectedCategories.filter(id => !currentCategoryIds.includes(id));
            const categoriesToRemove = currentCategoryIds.filter(id => !selectedCategories.includes(id));

            for (const catId of categoriesToAdd) {
                await ApiService.assignCategoryToPlace(placeId, catId);
            }
            for (const catId of categoriesToRemove) {
                await ApiService.removeCategoryFromPlace(placeId, catId);
            }

            // Update countries
            const countriesToAdd = selectedCountries.filter(id => !currentCountryIds.includes(id));
            const countriesToRemove = currentCountryIds.filter(id => !selectedCountries.includes(id));

            for (const countryId of countriesToAdd) {
                await ApiService.assignCountryToPlace(placeId, countryId);
            }
            for (const countryId of countriesToRemove) {
                await ApiService.removeCountryFromPlace(placeId, countryId);
            }

            // Reload route and update UI
            this.places = await this.routeManager.loadCurrentRoute();
            await this.routeManager.loadRoutes();

            showSuccess(`Updated "${newName}"`);
            this.closePlaceModal();

            if (this.onUpdate) {
                this.onUpdate();
            }

            // Silently refresh filter data without triggering map zoom
            if (window.filterManager) {
                await window.filterManager.refreshPlacesData();
            }

        } catch (error) {
            console.error('Failed to update place:', error);
            showError('Failed to update place');
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

    /**
     * Show modal to select position for adding an existing place to route
     */
    showAddPlacePositionModal(placeId, placeName) {
        const modal = document.getElementById('addPlacePositionModal');
        const placeNameSpan = document.getElementById('placeToAddName');
        const positionButtons = document.getElementById('positionButtons');

        if (!modal || !placeNameSpan || !positionButtons) return;

        // Set place name
        placeNameSpan.textContent = placeName;

        // Store placeId in modal dataset
        modal.dataset.placeId = placeId;

        // Generate position buttons based on current route length
        const routeLength = this.places.length;
        let buttonsHTML = '';

        // Generate buttons for each position: [1], [2], [3], ..., [End]
        for (let i = 1; i <= routeLength; i++) {
            buttonsHTML += `
                <button class="position-btn" onclick="placeManager.addExistingPlaceToRouteAtPosition(${placeId}, ${i - 1})">
                    <i class="fas fa-arrow-down"></i>
                    <span>Before ${i}. ${this.places[i - 1].name}</span>
                </button>
            `;
        }

        // Add "End" button
        buttonsHTML += `
            <button class="position-btn position-btn-end" onclick="placeManager.addExistingPlaceToRouteAtPosition(${placeId}, ${routeLength})">
                <i class="fas fa-plus"></i>
                <span>Add to End</span>
            </button>
        `;

        positionButtons.innerHTML = buttonsHTML;

        // Show modal
        modal.classList.add('active');
    }

    /**
     * Close the add place position modal
     */
    closeAddPlacePositionModal() {
        const modal = document.getElementById('addPlacePositionModal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    /**
     * Add an existing place to the route at a specific position
     * @param {number} placeId - The ID of the place to add
     * @param {number} position - The position index (0-based) where to insert
     */
    async addExistingPlaceToRouteAtPosition(placeId, position) {
        const currentRouteId = this.routeManager.getCurrentRouteId();
        if (!currentRouteId) {
            showError('No route selected. Create a route first.');
            return false;
        }

        try {
            // Add place to route (backend will handle position insertion)
            await ApiService.addPlaceToRoute(currentRouteId, placeId);

            // Reload current route to get updated order
            this.places = await this.routeManager.loadCurrentRoute();

            // If position is not at the end, reorder to put it at the desired position
            if (position < this.places.length - 1) {
                // Find the newly added place (it will be at the end)
                const newlyAddedPlace = this.places[this.places.length - 1];

                // Create new order array with place at desired position
                const newOrder = [...this.places];
                newOrder.splice(this.places.length - 1, 1); // Remove from end
                newOrder.splice(position, 0, newlyAddedPlace); // Insert at position

                // Get place IDs in new order
                const reorderedIds = newOrder.map(p => p.id);

                // Update order on backend
                await ApiService.reorderPlaces(currentRouteId, reorderedIds);

                // Reload to confirm
                this.places = await this.routeManager.loadCurrentRoute();
            }

            await this.routeManager.loadRoutes(); // For place count update

            showSuccess(`Added to route!`);

            // Close modal
            this.closeAddPlacePositionModal();

            // Update UI
            if (this.onUpdate) {
                this.onUpdate();
            }

            return true;

        } catch (error) {
            console.error('Failed to add place to route:', error);
            showError(error.message || 'Failed to add place to route');
            return false;
        }
    }
}