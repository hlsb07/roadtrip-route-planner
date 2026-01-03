import { MapService } from './map.js';
import { RouteManager } from './routeManager.js';
import { SearchManager } from './searchManager.js';
import { PlaceManager } from './placeManager.js';
import { CampsiteManager } from './campsiteManager.js';
import { FilterManager } from './filterManager.js';
import { AllPlacesManager } from './allPlacesManager.js';
import { TagManager } from './tagManager.js';
import { ApiService } from './api.js';
import { showError, showSuccess, showConfirm } from './utils.js';
import { CONFIG } from './config.js';
import { SwipeHandler } from './swipeHandler.js';
import { TimelineService } from './timeline/TimelineService.js';
import { initializeScheduleIfNeeded } from './timeline/scheduleInitializer.js';
import { mapItineraryToTimelineStops, calculateTotalDays } from './timeline/timelineMapper.js';
import { AuthManager } from './authManager.js';
import { LoginModal } from './loginModal.js';

class App {
    constructor() {
        // Initialize authentication
        this.loginModal = new LoginModal();

        this.mapService = new MapService();
        this.filterManager = new FilterManager();  // Create filterManager first
        this.routeManager = new RouteManager(this.filterManager);  // Pass filterManager
        this.searchManager = new SearchManager();
        this.placeManager = new PlaceManager(
            this.routeManager,
            () => this.updateUI(),
            () => this.loadTimelineForCurrentRoute()  // Reload timeline after route reorder
        );
        this.campsiteManager = new CampsiteManager(() => this.updateCampsiteUI());
        this.allPlacesManager = new AllPlacesManager(this.filterManager, this.placeManager);
        this.tagManager = new TagManager();

        // Initialize Timeline Service
        this.timelineService = new TimelineService({
            onStopSelected: (index, stop) => this.handleTimelineStopSelected(index, stop),
            onStopScheduleChanged: (routePlaceId, dto) => this.handleStopScheduleChanged(routePlaceId, dto),
            onNeedRecalculateLegs: () => this.handleRecalculateLegs(),
            onResolveConflictByReorder: () => this.handleResolveConflictByReorder()
        });

        // Set callback for search result selection (save to database, don't add to route)
        this.searchManager.setOnSelectCallback((place) => this.addPlace(place));

        // Set callback for filter changes
        this.filterManager.onFilterChange((filtered, scope) => {
            this.updateMapWithFilteredPlaces(filtered, scope);
        });

        this.bindEventListeners();
        this.setupKeyboardShortcuts();
        this.setupMobilePopupSwipe();
        this.setupMobilePanelSwipe();
    }

    async init() {
        try {
            // Check authentication first
            const isAuthenticated = await AuthManager.ensureAuthenticated();
            if (!isAuthenticated) {
                // Show login modal
                this.loginModal.init(() => this.onLoginSuccess());
                this.loginModal.show();
                return; // Don't initialize app until logged in
            }

            // Initialize login modal for potential future use
            this.loginModal.init(() => this.onLoginSuccess());

            // Initialize map
            this.mapService.init();

            // Setup map click handler
            this.mapService.onMapClick((coords, latlng) => {
                this.searchManager.onMapClick(coords, latlng);
            });

            // Setup marker click handler
            this.mapService.setMarkerClickCallback((index) => {
                this.selectPlace(index);
            });

            // Setup campsite marker click handler
            this.mapService.setCampsiteMarkerClickCallback((index) => {
                this.selectCampsite(index);
            });

            // Setup non-route/filtered place marker click handler
            this.mapService.setNonRouteMarkerClickCallback((placeId, index) => {
                // This is called when clicking markers in All Places view
                this.allPlacesManager.selectCard(index);
            });

            // Setup route calculation callback to update route info panel
            this.mapService.setRouteCalculatedCallback((routeInfo) => {
                this.updateRouteInfoPanel(routeInfo);
            });

            // Initialize filters FIRST (fetches all places with full data)
            await this.filterManager.init();

            // Load routes and first route (now can use filterManager.allPlaces)
            const places = await this.routeManager.loadRoutes();
            if (places && places.length > 0) {
                this.placeManager.setPlaces(places);
                this.updateUI();
                await this.loadTimelineForCurrentRoute();
            }

            // Load campsites
            await this.campsiteManager.loadCampsites();
            this.updateCampsiteUI();

            // Initialize All Places Manager
            this.allPlacesManager.updateAllPlacesList();

        } catch (error) {
            console.error('Failed to initialize app:', error);
            showError('Failed to initialize application');
        }
    }

    bindEventListeners() {
        // Search input (desktop)
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleSearch();
                }
            });
        }

        // Search input (mobile)
        const mobileSearchInput = document.getElementById('mobileSearchInput');
        if (mobileSearchInput) {
            mobileSearchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleSearch();
                }
            });
        }

        // Campsite URL input (desktop)
        const campsiteUrlInput = document.getElementById('campsiteUrlInput');
        if (campsiteUrlInput) {
            campsiteUrlInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleAddCampsite();
                }
            });
        }

        // Campsite URL input (mobile)
        const mobileCampsiteUrlInput = document.getElementById('mobileCampsiteUrlInput');
        if (mobileCampsiteUrlInput) {
            mobileCampsiteUrlInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleAddCampsite();
                }
            });
        }

        // Import file
        const importFile = document.getElementById('importFile');
        if (importFile) {
            importFile.addEventListener('change', (e) => {
                this.handleFileImport(e);
            });
        }

        /*
        // Route selector change
        const routeSelect = document.getElementById('routeSelect');
        if (routeSelect) {
            routeSelect.addEventListener('change', async () => {
                if (routeSelect.value) {
                    this.routeManager.currentRouteId = parseInt(e.target.value);
                    const places = await this.routeManager.loadCurrentRoute();
                    this.placeManager.setPlaces(places);
                    this.updateUI();
                }
            });
        }
                    */
        document.addEventListener('change', async (e) => {
            if (e.target.id === 'routeSelect' || e.target.id === 'mobileRouteSelect') {
                if (e.target.value) {
                    this.routeManager.currentRouteId = parseInt(e.target.value);
                    const places = await this.routeManager.loadCurrentRoute();
                    this.placeManager.setPlaces(places);
                    this.updateUI();
                    await this.loadTimelineForCurrentRoute();
                }
            }
        });
    }

    /**
     * Get the currently active view context
     * @returns {Object} Context object with view info and selection
     */
    getActiveViewContext() {
        // Check desktop nav
        const activeDesktopNav = document.querySelector('.desktop-nav-item.active');
        const activeMobileNav = document.querySelector('.mobile-nav-item.active');
        const activeNav = activeDesktopNav || activeMobileNav;
        const mode = activeNav?.dataset.mode || 'places';

        // Check what's visible
        const allPlacesVisible = document.getElementById('allPlacesSection')?.style.display !== 'none' ||
                                 document.querySelector('.mobile-section[data-section="allplaces"]')?.style.display !== 'none';
        const campsitesVisible = document.getElementById('campsitesList')?.style.display !== 'none' ||
                                document.querySelector('.mobile-section[data-section="campsites"]')?.style.display !== 'none';

        let context = {
            mode: mode,
            view: 'places', // default
            selectedIndex: null,
            items: [],
            manager: null
        };

        if (allPlacesVisible || mode === 'allplaces') {
            context.view = 'allplaces';
            context.items = this.allPlacesManager.filteredPlaces || [];
            context.manager = this.allPlacesManager;
            context.selectedIndex = this.allPlacesManager.selectedIndex;
        } else if (campsitesVisible || mode === 'campsites') {
            context.view = 'campsites';
            context.selectedIndex = this.campsiteManager.selectedIndex;
            context.items = this.campsiteManager.campsites || [];
            context.manager = this.campsiteManager;
        } else {
            // Default to route places
            context.view = 'places';
            context.selectedIndex = this.placeManager.selectedIndex;
            context.items = this.placeManager.places || [];
            context.manager = this.placeManager;
        }

        return context;
    }

    /**
     * Deselect the current selection in the active view
     */
    deselectCurrentView() {
        const context = this.getActiveViewContext();
        if (context.view === 'places' && this.placeManager.selectedIndex !== null) {
            this.placeManager.deselectPlace();
            this.mapService.deselectPlace();
            this.updateUI();
        } else if (context.view === 'allplaces' && this.allPlacesManager.selectedIndex !== null) {
            this.allPlacesManager.deselectCard();
            this.mapService.deselectAllPlace();
            this.allPlacesManager.updateAllPlacesList();
        } else if (context.view === 'campsites' && this.campsiteManager.selectedIndex !== null) {
            this.campsiteManager.deselectCampsite();
            this.mapService.deselectCampsite();
        }
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', async (e) => {
            // Helper: Check if we should ignore shortcuts (typing in input/textarea)
            const isTyping = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
            const hasActiveModal = document.querySelector('.modal.active, .confirm-overlay.show');

            // ESC always works - closes fullscreen gallery, mobile popup, modal, or deselects
            if (e.key === 'Escape') {
                // Check if fullscreen image gallery is open (highest priority)
                const fullscreenGallery = document.getElementById('fullscreenImageGallery');
                if (fullscreenGallery && fullscreenGallery.classList.contains('show')) {
                    this.mapService.hideFullscreenImageGallery();
                    return;
                }

                // Check if mobile docked popup is open
                const mobilePopup = document.getElementById('mobileDockedPopup');
                if (mobilePopup && mobilePopup.classList.contains('show')) {
                    this.mapService.hideMobileDockedPopup();
                    return;
                }

                if (hasActiveModal) {
                    this.routeManager.closeRouteModal();
                } else {
                    this.deselectCurrentView();
                }
                return;
            }

            // Modal-specific shortcuts
            if (hasActiveModal) {
                // Enter in route modal saves
                if (e.key === 'Enter' && document.getElementById('routeModal')?.classList.contains('active')) {
                    this.routeManager.saveRoute().then(() => {
                        this.updateRoutesList();
                    });
                }
                // Enter in place edit modal saves
                if (e.key === 'Enter' && document.getElementById('editPlaceModal')?.classList.contains('active')) {
                    this.placeManager.savePlaceEdit();
                }
                return; // Don't process other shortcuts when modal is open
            }

            // Don't process shortcuts when typing in inputs
            if (isTyping && !['Escape'].includes(e.key)) {
                return;
            }

            // === Context-Aware Shortcuts ===
            const context = this.getActiveViewContext();
            const selectedIndex = context.selectedIndex;
            const items = context.items;

            // Delete key - Remove/delete item based on view
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIndex !== null && !e.shiftKey) {
                e.preventDefault();

                if (context.view === 'places') {
                    // Remove from route
                    const success = await this.removePlace(selectedIndex);
                    if (success) {
                        this.updateUI();
                    }
                } else if (context.view === 'allplaces') {
                    // All Places - permanently delete (with confirmation)
                    const item = items[selectedIndex];
                    if (item) {
                        await this.allPlacesManager.deletePlace(item.id, item.name);
                        this.allPlacesManager.updateAllPlacesList();
                    }
                } else if (context.view === 'campsites') {
                    // Campsites - just deselect for now
                    this.campsiteManager.deselectCampsite();
                }
                return;
            }

            // Shift + Delete - Permanently delete place (same as Delete in All Places)
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIndex !== null && e.shiftKey) {
                e.preventDefault();
                const item = items[selectedIndex];
                if (item && (context.view === 'places' || context.view === 'allplaces')) {
                    await this.deleteNonRoutePlace(item.id, item.name);
                    this.updateUI();
                    if (context.view === 'allplaces') {
                        this.allPlacesManager.updateAllPlacesList();
                    }
                }
                return;
            }

            // Arrow Down - Select next item
            if (e.key === 'ArrowDown' && items.length > 0) {
                e.preventDefault();
                const nextIndex = selectedIndex === null ? 0 : Math.min(selectedIndex + 1, items.length - 1);

                if (context.view === 'places') {
                    this.selectPlace(nextIndex);
                } else if (context.view === 'allplaces') {
                    this.allPlacesManager.selectCard(nextIndex);
                    this.mapService.selectAllPlace(nextIndex);
                    this.allPlacesManager.updateAllPlacesList();
                } else if (context.view === 'campsites') {
                    this.selectCampsite(nextIndex);
                }
                return;
            }

            // Arrow Up - Select previous item
            if (e.key === 'ArrowUp' && items.length > 0) {
                e.preventDefault();
                const prevIndex = selectedIndex === null ? items.length - 1 : Math.max(selectedIndex - 1, 0);

                if (context.view === 'places') {
                    this.selectPlace(prevIndex);
                } else if (context.view === 'allplaces') {
                    this.allPlacesManager.selectCard(prevIndex);
                    this.mapService.selectAllPlace(prevIndex);
                    this.allPlacesManager.updateAllPlacesList();
                } else if (context.view === 'campsites') {
                    this.selectCampsite(prevIndex);
                }
                return;
            }

            // Enter - Edit selected item
            if (e.key === 'Enter' && selectedIndex !== null) {
                e.preventDefault();
                const item = items[selectedIndex];
                if (item && context.view === 'places') {
                    await this.placeManager.showEditPlaceModal(selectedIndex);
                } else if (item && context.view === 'allplaces') {
                    await this.allPlacesManager.editPlace(item.id);
                }
                return;
            }

            // Ctrl/Cmd + A - Focus search input
            if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
                e.preventDefault();
                const searchInput = document.getElementById('search');
                if (searchInput) {
                    searchInput.focus();
                    searchInput.select();
                }
                return;
            }

            // ? - Show keyboard shortcuts help
            if (e.key === '?' && !e.shiftKey) {
                e.preventDefault();
                this.showKeyboardShortcutsModal();
                return;
            }
        });
    }

    showKeyboardShortcutsModal() {
        // Check if modal already exists
        let modal = document.getElementById('keyboardShortcutsModal');

        if (!modal) {
            // Create modal
            modal = document.createElement('div');
            modal.id = 'keyboardShortcutsModal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content modal-medium">
                    <div class="modal-header">
                        <h2><i class="fas fa-keyboard"></i> Keyboard Shortcuts</h2>
                        <button class="close-modal" onclick="document.getElementById('keyboardShortcutsModal').classList.remove('active')">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="shortcuts-section">
                            <h3><i class="fas fa-trash"></i> Place Management</h3>
                            <div class="shortcut-item">
                                <span class="shortcut-keys"><kbd>Delete</kbd> or <kbd>Backspace</kbd></span>
                                <span class="shortcut-description">Remove selected place from route</span>
                            </div>
                            <div class="shortcut-item">
                                <span class="shortcut-keys"><kbd>Shift</kbd> + <kbd>Delete</kbd></span>
                                <span class="shortcut-description">Permanently delete selected place</span>
                            </div>
                            <div class="shortcut-item">
                                <span class="shortcut-keys"><kbd>Enter</kbd></span>
                                <span class="shortcut-description">Edit selected place</span>
                            </div>
                        </div>

                        <div class="shortcuts-section">
                            <h3><i class="fas fa-arrows-alt-v"></i> Navigation</h3>
                            <div class="shortcut-item">
                                <span class="shortcut-keys"><kbd>↑</kbd> Arrow Up</span>
                                <span class="shortcut-description">Select previous place</span>
                            </div>
                            <div class="shortcut-item">
                                <span class="shortcut-keys"><kbd>↓</kbd> Arrow Down</span>
                                <span class="shortcut-description">Select next place</span>
                            </div>
                            <div class="shortcut-item">
                                <span class="shortcut-keys"><kbd>Esc</kbd></span>
                                <span class="shortcut-description">Deselect place or close modal</span>
                            </div>
                        </div>

                        <div class="shortcuts-section">
                            <h3><i class="fas fa-plus"></i> General</h3>
                            <div class="shortcut-item">
                                <span class="shortcut-keys"><kbd>Ctrl/Cmd</kbd> + <kbd>A</kbd></span>
                                <span class="shortcut-description">Focus search input</span>
                            </div>
                            <div class="shortcut-item">
                                <span class="shortcut-keys"><kbd>?</kbd></span>
                                <span class="shortcut-description">Show this help</span>
                            </div>
                        </div>

                        <div class="shortcuts-tip">
                            <i class="fas fa-info-circle"></i>
                            <strong>Tip:</strong> Select a place by clicking it in the list or on the map, then use shortcuts for quick actions!
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        modal.classList.add('active');
    }

    // Public methods for global access
    async handleSearch() {
        const result = await this.searchManager.handleSearch();

        if (result) {
            if (Array.isArray(result)) {
                // Search results - already displayed by SearchManager with callback
                // No need to do anything here
            } else if (result.coords) {
                // Direct place from coords or link
                await this.addPlace(result);
                this.mapService.clearClickMarker();
            }
        }
    }

    async handleAddCampsite() {
        // Get input from either desktop or mobile
        const desktopInput = document.getElementById('campsiteUrlInput');
        const mobileInput = document.getElementById('mobileCampsiteUrlInput');
        const input = desktopInput?.offsetParent ? desktopInput : mobileInput;

        const url = input?.value.trim();
        if (!url) {
            showError('Please enter a Park4Night URL');
            return;
        }

        // Get loading element
        const desktopLoading = document.getElementById('campsiteLoading');
        const mobileLoading = document.getElementById('mobileCampsiteLoading');
        const loading = desktopLoading?.offsetParent ? desktopLoading : mobileLoading;

        try {
            if (loading) loading.classList.add('active');

            const response = await fetch(`${CONFIG.API_BASE}/campsites?url=${encodeURIComponent(url)}`);
            const data = await response.json();

            if (loading) loading.classList.remove('active');

            if (response.ok && data.success) {
                showSuccess(data.message || 'Campsite added successfully!');
                input.value = '';

                // Refresh the map to show the new campsite
                await this.campsiteManager.loadCampsites();
                this.mapService.updateCampsiteMarkers(this.campsiteManager.getCampsites());
            } else if (response.status === 409) {
                // Campsite already exists
                showError(data.message || 'This campsite already exists');
            } else {
                showError(data.message || 'Failed to add campsite');
            }
        } catch (error) {
            if (loading) loading.classList.remove('active');
            console.error('Error adding campsite:', error);
            showError('Failed to add campsite. Please check the URL and try again.');
        }
    }

    async deleteCampsite(campsiteId, campsiteName) {
        const confirmed = await showConfirm({
            title: 'Delete Campsite',
            message: `Delete "${campsiteName}" permanently? This cannot be undone.`,
            type: 'danger',
            confirmText: 'Delete',
            cancelText: 'Cancel'
        });

        if (!confirmed) {
            return;
        }

        try {
            const response = await fetch(`${CONFIG.API_BASE}/campsites/${campsiteId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Failed to delete campsite');
            }

            showSuccess(`Deleted "${campsiteName}"`);

            // Refresh the map to remove the campsite marker
            await this.campsiteManager.loadCampsites();
            this.mapService.updateCampsiteMarkers(this.campsiteManager.getCampsites());

            // Close any open popups
            this.mapService.hideMobileDockedPopup();

        } catch (error) {
            console.error('Failed to delete campsite:', error);
            showError(error.message || 'Failed to delete campsite');
        }
    }

    switchTab(tab) {
        this.searchManager.switchTab(tab);
    }

    async addPlace(place) {
        // Save place to database (don't add to route yet)
        const result = await this.placeManager.addPlace(place, false);
        if (result.success) {
            // Refresh filter data to include new place
            await this.filterManager.refreshPlaces(this.placeManager.getPlaces());

            // Update all places list
            this.allPlacesManager.updateAllPlacesList();

            // Update UI
            this.updateUI();
        }
    }

    async removePlace(index) {
        const success = await this.placeManager.removePlace(index);
        if (success) {
            this.updateUI();
        }
    }

    // Route management methods
    showCreateRouteModal() {
        this.routeManager.showCreateRouteModal();
    }

    showRenameRouteModal() {
        this.routeManager.showRenameRouteModal();
    }

    closeRouteModal() {
        this.routeManager.closeRouteModal();
    }

    async saveRoute() {
        const success = await this.routeManager.saveRoute();
        if (success) {
            await this.updateRoutesList();
        }
    }

    async deleteCurrentRoute() {
        const places = await this.routeManager.deleteCurrentRoute();
        if (places !== undefined) {
            this.placeManager.setPlaces(places);
            this.updateUI();
        }
    }

    async updateRoutesList() {
        const places = await this.routeManager.loadRoutes();
        if (places && places.length > 0) {
            this.placeManager.setPlaces(places);
            this.updateUI();
        }
    }

    // Map controls
    centerMap() {
        this.mapService.centerMap(this.placeManager.getPlaces());
    }

    toggleRoute() {
        const showRoute = this.mapService.toggleRoute();
        this.mapService.updateMap(this.placeManager.getPlaces());
    }

    async getCurrentLocation() {
        try {
            const location = await this.mapService.getCurrentLocation();
            console.log('Current location:', location);
        } catch (error) {
            showError(error.message);
        }
    }

    // Import/Export
    exportRoute() {
        this.placeManager.exportRoute();
    }

    importRoute() {
        const input = document.getElementById('importFile');
        input.click();
    }

    async handleFileImport(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target.result);
                
                if (!data.places || !Array.isArray(data.places)) {
                    showError('Invalid file - no places found');
                    return;
                }
                
                console.log('Importing', data.places.length, 'places...');
                
                const success = await this.placeManager.importPlaces(data.places);
                if (success) {
                    this.updateUI();
                }
                
            } catch (error) {
                console.error('Import error:', error);
                showError('Invalid file format');
            }
        };
        
        reader.readAsText(file);
    }

    clearRoute() {
        const success = this.placeManager.clearRoute();
        if (success) {
            this.updateUI();
        }
    }

    // UI Updates
    updateUI(centerMap = true) {
        this.placeManager.updatePlacesList();

        // Update All Places list
        this.allPlacesManager.updateAllPlacesList();

        // Get current route places
        const routePlaces = this.placeManager.getPlaces();

        // Get route legs if available
        const routeLegs = this.routeManager.currentRouteLegs || null;

        // Get filtered places from FilterManager
        const filtered = this.filterManager.getFilteredPlaces(routePlaces);
        const scope = this.filterManager.filterScope;

        // Update map based on filter scope
        if (scope === 'route') {
            // Show only route places (existing behavior)
            this.mapService.updateMap(routePlaces, routeLegs);
        } else if (scope === 'all') {
            // Show only non-route places
            this.mapService.updateMapWithBothPlaceTypes([], filtered.nonRoutePlaces, null);
        } else {
            // Show both (default)
            this.mapService.updateMapWithBothPlaceTypes(routePlaces, filtered.nonRoutePlaces, routeLegs);
        }

        // Re-center map to show all visible places (optional based on parameter)
        if (centerMap && (routePlaces.length > 0 || filtered.nonRoutePlaces.length > 0)) {
            this.mapService.centerMap(routePlaces);
        }
    }

    /**
     * Update the route info panel with calculated route data
     * @param {Object} routeInfo - Object containing distance, duration, and formatted values
     */
    updateRouteInfoPanel(routeInfo) {
        const panel = document.getElementById('routeInfoPanel');
        const distanceSpan = document.getElementById('routeDistance');
        const durationSpan = document.getElementById('routeDuration');

        if (!panel || !distanceSpan || !durationSpan) return;

        // Update distance
        distanceSpan.textContent = `${routeInfo.distanceKm} km`;

        // Update duration
        if (routeInfo.durationHours > 0) {
            durationSpan.textContent = `${routeInfo.durationHours}h ${routeInfo.durationMinutes}min`;
        } else {
            durationSpan.textContent = `${routeInfo.durationMinutes}min`;
        }

        // Show the panel
        panel.style.display = 'block';
    }

    /**
     * Hide the route info panel
     */
    hideRouteInfoPanel() {
        const panel = document.getElementById('routeInfoPanel');
        if (panel) {
            panel.style.display = 'none';
        }
    }

    async selectPlace(index) {
        this.placeManager.selectPlace(index);
        this.mapService.selectedMarkerIndex = index;
        this.updateUI(false); // Don't re-center map when selecting a place
        this.mapService.selectPlace(index); // This will center on the selected place

        // Center timeline on selected place
        if (this.timelineService) {
            this.timelineService.setActiveStop(index);
        }

        // Show place details in sidebar (desktop only)
        const place = this.placeManager.getPlaces()[index];
        if (place && window.innerWidth > 768) {
            // Load Google data if available (like map marker click does)
            if (place.hasGoogleData && place.id) {
                try {
                    const enrichedPlace = await ApiService.getEnrichedPlace(place.id);
                    if (enrichedPlace && enrichedPlace.googleData) {
                        const enrichedPlaceWithCoords = {
                            ...place,
                            googleData: enrichedPlace.googleData
                        };
                        this.mapService.showPlaceDetailsInSidebar(enrichedPlaceWithCoords, index, false);
                    } else {
                        // No Google data returned, show basic info
                        this.mapService.showPlaceDetailsInSidebar(place, index, false);
                    }
                } catch (error) {
                    console.error('Failed to load Google data for sidebar:', error);
                    // Fall back to showing basic info
                    this.mapService.showPlaceDetailsInSidebar(place, index, false);
                }
            } else {
                // No Google data available, show basic info
                this.mapService.showPlaceDetailsInSidebar(place, index, false);
            }
        }

        // Collapse mobile panel if it's expanded
        if (window.innerWidth <= 768) {
            const panel = document.getElementById('mobilePanel');
            if (panel && panel.classList.contains('expanded')) {
                panel.classList.remove('expanded');
                // Update icon
                const expandBtn = panel.querySelector('.mobile-panel-expand i');
                if (expandBtn) {
                    expandBtn.className = 'fas fa-chevron-up';
                }
            }
        }
    }

    selectCampsite(index) {
        this.campsiteManager.selectCampsite(index);
        this.mapService.selectedCampsiteIndex = index;
        this.updateCampsiteUI();
        this.mapService.selectCampsite(index);

        // Collapse mobile panel if it's expanded
        if (window.innerWidth <= 768) {
            const panel = document.getElementById('mobilePanel');
            if (panel && panel.classList.contains('expanded')) {
                panel.classList.remove('expanded');
                // Update icon
                const expandBtn = panel.querySelector('.mobile-panel-expand i');
                if (expandBtn) {
                    expandBtn.className = 'fas fa-chevron-up';
                }
            }
        }
    }

    updateCampsiteUI() {
        this.campsiteManager.updateCampsitesList();
        this.mapService.updateCampsiteMarkers(this.campsiteManager.getCampsites());
    }

    updateMapWithFilteredPlaces(filtered, scope) {
        // Get current route places for context
        const routePlaces = this.placeManager.getPlaces();

        // Update map based on filter scope
        if (scope === 'route') {
            // Show only filtered route places
            this.mapService.updateFilteredPlaces(filtered.routePlaces);
        } else if (scope === 'all') {
            // Show only filtered non-route places (as gray markers)
            this.mapService.updateMapWithBothPlaceTypes([], filtered.nonRoutePlaces);
        } else {
            // Show both filtered route and non-route places
            this.mapService.updateMapWithBothPlaceTypes(
                routePlaces.filter(p => filtered.routePlaces.some(fp => fp.id === p.id)),
                filtered.nonRoutePlaces
            );
        }
    }

    // Methods for handling non-route place actions from map popup
    showAddPlacePositionModal(placeId, placeName) {
        this.placeManager.showAddPlacePositionModal(placeId, placeName);
    }

    async editNonRoutePlace(placeId) {
        // Find the place in filterManager's allPlaces
        const place = this.filterManager.allPlaces.find(p => p.id === placeId);
        if (!place) {
            showError('Place not found');
            return;
        }

        // Open edit modal using existing placeManager method
        // We need to temporarily add this place to the places list for the modal to work
        const tempIndex = this.placeManager.places.length;
        this.placeManager.places.push({
            id: place.id,
            name: place.name,
            coords: [place.latitude, place.longitude]
        });

        await this.placeManager.showRenamePlaceModal(tempIndex);

        // Remove temporary place after modal closes
        this.placeManager.places.splice(tempIndex, 1);
    }

    async deleteNonRoutePlace(placeId, placeName) {
        const confirmed = await showConfirm({
            title: 'Delete Place',
            message: `Delete "${placeName}" permanently? This cannot be undone.`,
            type: 'danger',
            confirmText: 'Delete',
            cancelText: 'Cancel'
        });

        if (!confirmed) {
            return;
        }

        try {
            // Delete the place
            const deleteResponse = await fetch(`${CONFIG.API_BASE}/places/${placeId}`, {
                method: 'DELETE'
            });

            if (!deleteResponse.ok) {
                // Parse error response for detailed information
                const errorData = await deleteResponse.json().catch(() => null);

                if (deleteResponse.status === 400 && errorData?.usedInRoutes) {
                    // Place is used in routes - ask if user wants to force delete
                    const routeList = errorData.usedInRoutes.join(', ');
                    const forceDelete = await showConfirm({
                        title: 'Place In Use',
                        message: `"${placeName}" is used in the following route(s): ${routeList}\n\nDo you want to remove it from these routes and delete it?`,
                        type: 'danger',
                        confirmText: 'Force Delete',
                        cancelText: 'Cancel'
                    });

                    if (!forceDelete) {
                        return;
                    }

                    // Force delete the place
                    const forceDeleteResponse = await fetch(`${CONFIG.API_BASE}/places/${placeId}/force`, {
                        method: 'DELETE'
                    });

                    if (!forceDeleteResponse.ok) {
                        throw new Error('Failed to force delete place');
                    }
                } else {
                    throw new Error(errorData?.message || 'Failed to delete place');
                }
            }

            showSuccess(`Deleted "${placeName}"`);

            // Refresh filter data
            await this.filterManager.refreshPlaces(this.placeManager.getPlaces());

            // Update UI
            this.updateUI();

        } catch (error) {
            console.error('Failed to delete place:', error);
            showError(error.message || 'Failed to delete place');
        }
    }

    // ============================================
    // MOBILE POPUP SWIPE NAVIGATION
    // ============================================

    setupMobilePopupSwipe() {
        const popup = document.getElementById('mobileDockedPopup');
        if (!popup) {
            console.warn('Mobile popup element not found during setup');
            return;
        }

        // Initialize SwipeHandler for mobile popup
        this.popupSwipeHandler = new SwipeHandler({
            element: popup,
            states: [
                { name: 'hidden', height: 0 },
                { name: 'compact', height: 320 },
                { name: 'expanded', height: () => window.innerHeight * 0.85 }
            ],
            initialState: 'compact',
            scrollElement: document.getElementById('mobilePopupContent'),
            enableHorizontalSwipe: true,
            onHorizontalSwipe: (direction) => {
                if (direction === 'left') {
                    this.navigateToNextPlace();
                } else {
                    this.navigateToPreviousPlace();
                }
            },
            onStateChange: (newState, oldState) => {
                console.log(`Mobile popup state changed: ${oldState} → ${newState}`);

                // Handle hide state
                if (newState === 'hidden') {
                    this.mapService.hideMobileDockedPopup();
                }
            },
            dataStateAttribute: 'data-state',
            scrollThreshold: 3,
            autoScrollThreshold: 20
        });

        console.log('Mobile popup swipe handler initialized');
    }

    setupMobilePanelSwipe() {
        const panel = document.getElementById('mobilePanel');
        const panelHeader = document.querySelector('.mobile-panel-header');

        if (!panel) {
            console.warn('Mobile panel element not found during setup');
            return;
        }

        if (!panelHeader) {
            console.warn('Mobile panel header element not found during setup');
            return;
        }

        // Initialize SwipeHandler for mobile panel
        // Attach touch events to header, but apply height changes to panel
        this.panelSwipeHandler = new SwipeHandler({
            element: panel,              // The element whose height/state changes
            handleElement: panelHeader,  // The element that receives touch events
            states: [
                { name: 'hidden', height: 0 },
                { name: 'active', height: '40vh' }, // replaces 'compact' for panel
                { name: 'expanded', height: '80vh' }
            ],
            initialState: 'active',
            scrollElement: document.querySelector('.mobile-panel-content'),
            enableHorizontalSwipe: false, // Panel doesn't need horizontal swipes
            onStateChange: (newState, oldState) => {
                console.log(`Mobile panel state changed: ${oldState} → ${newState}`);
            },
            useClasses: true, // Panel uses CSS classes (.active, .expanded, .hidden)
            scrollThreshold: 3,
            autoScrollThreshold: 20
        });

        console.log('Mobile panel swipe handler initialized (header handle, panel target)');
    }

    navigateToNextPlace() {
        console.log('navigateToNextPlace called');
        const popupData = this.mapService.getCurrentMobilePopupData();
        console.log('Popup data:', popupData);
        if (!popupData) {
            console.warn('No popup data available');
            return;
        }

        const { placeData } = popupData;
        const context = this.getActiveViewContext();
        console.log('Context:', context, 'Place data:', placeData);

        // Determine view based on placeData and context
        const isRoutePlace = placeData && placeData.index !== null && !placeData.isNonRoute;
        const isAllPlacesView = context.view === 'allplaces' || context.mode === 'allplaces';

        if (isRoutePlace) {
            // Route Places view (including when viewing from "Routes" tab)
            const currentIndex = placeData.index;
            const nextIndex = currentIndex + 1;
            console.log('Route Places - current:', currentIndex, 'next:', nextIndex, 'total:', this.placeManager.places.length);

            if (nextIndex < this.placeManager.places.length) {
                this.showPlaceInMobilePopup(nextIndex, false);
                this.updatePopupPositionIndicator(nextIndex + 1, this.placeManager.places.length);
            } else {
                console.log('Already at last place');
            }
        } else if (isAllPlacesView) {
            // All Places view
            const currentIndex = this.allPlacesManager.selectedIndex;
            const nextIndex = currentIndex !== null ? currentIndex + 1 : 0;
            console.log('All Places - current:', currentIndex, 'next:', nextIndex, 'total:', this.allPlacesManager.filteredPlaces.length);

            if (nextIndex < this.allPlacesManager.filteredPlaces.length) {
                this.allPlacesManager.selectCard(nextIndex);
                this.mapService.selectAllPlace(nextIndex);
                this.showAllPlaceInMobilePopup(nextIndex);
                this.updatePopupPositionIndicator(nextIndex + 1, this.allPlacesManager.filteredPlaces.length);
            } else {
                console.log('Already at last place');
            }
        } else {
            console.log('Unknown view - isRoutePlace:', isRoutePlace, 'isAllPlacesView:', isAllPlacesView);
        }
    }

    navigateToPreviousPlace() {
        console.log('navigateToPreviousPlace called');
        const popupData = this.mapService.getCurrentMobilePopupData();
        console.log('Popup data:', popupData);
        if (!popupData) {
            console.warn('No popup data available');
            return;
        }

        const { placeData } = popupData;
        const context = this.getActiveViewContext();
        console.log('Context:', context, 'Place data:', placeData);

        // Determine view based on placeData and context
        const isRoutePlace = placeData && placeData.index !== null && !placeData.isNonRoute;
        const isAllPlacesView = context.view === 'allplaces' || context.mode === 'allplaces';

        if (isRoutePlace) {
            // Route Places view (including when viewing from "Routes" tab)
            const currentIndex = placeData.index;
            const prevIndex = currentIndex - 1;
            console.log('Route Places - current:', currentIndex, 'prev:', prevIndex);

            if (prevIndex >= 0) {
                this.showPlaceInMobilePopup(prevIndex, false);
                this.updatePopupPositionIndicator(prevIndex + 1, this.placeManager.places.length);
            } else {
                console.log('Already at first place');
            }
        } else if (isAllPlacesView) {
            // All Places view
            const currentIndex = this.allPlacesManager.selectedIndex;
            const prevIndex = currentIndex !== null ? currentIndex - 1 : -1;
            console.log('All Places - current:', currentIndex, 'prev:', prevIndex);

            if (prevIndex >= 0) {
                this.allPlacesManager.selectCard(prevIndex);
                this.mapService.selectAllPlace(prevIndex);
                this.showAllPlaceInMobilePopup(prevIndex);
                this.updatePopupPositionIndicator(prevIndex + 1, this.allPlacesManager.filteredPlaces.length);
            } else {
                console.log('Already at first place');
            }
        } else {
            console.log('Unknown view - isRoutePlace:', isRoutePlace, 'isAllPlacesView:', isAllPlacesView);
        }
    }

    // ===== Timeline Methods =====

    async loadTimelineForCurrentRoute() {
        const routeId = this.routeManager.currentRouteId;
        if (!routeId) {
            // Hide timeline if no route selected
            const panel = document.getElementById('timelinePanel');
            if (panel) {
                panel.classList.remove('visible');
            }
            return;
        }

        try {
            // Show timeline
            const panel = document.getElementById('timelinePanel');
            if (panel) {
                panel.classList.add('visible');
            }

            // Get current route
            const route = await ApiService.getRoute(routeId);

            // Auto-initialize schedule if needed
            await initializeScheduleIfNeeded(routeId, route);

            // Load itinerary WITH conflict information
            const itinerary = await ApiService.getItineraryWithConflicts(routeId);

            // Map to timeline coordinates
            const timelineStops = mapItineraryToTimelineStops(itinerary);
            const totalDays = calculateTotalDays(timelineStops);
            const routeStartUtc = itinerary.scheduleSettings?.startDateTime;

            // Render with conflict information
            this.timelineService.renderWithConflicts(
                timelineStops,
                totalDays,
                routeStartUtc,
                itinerary.conflictInfo
            );
        } catch (error) {
            console.error('Failed to load timeline:', error);
            showError('Failed to load timeline');
        }
    }

    async handleTimelineStopSelected(index, stop) {
        // Select place on map (which will also update timeline)
        this.selectPlace(index);
    }

    async handleStopScheduleChanged(routePlaceId, dto) {
        const routeId = this.routeManager.currentRouteId;
        if (!routeId) return null;

        try {
            const response = await ApiService.updateStopSchedule(routeId, routePlaceId, dto);

            // Reload itinerary and refresh timeline
            await this.loadTimelineForCurrentRoute();

            // Return response (may contain conflict info)
            return response;
        } catch (error) {
            console.error('Failed to update stop schedule:', error);
            showError('Failed to update schedule');
            throw error;
        }
    }

    async handleRecalculateLegs() {
        // Optional: trigger leg recalculation after schedule changes

        // This could be implemented if we want to auto-update drive times
        console.log('Leg recalculation requested (not yet implemented)');
    }

    async handleResolveConflictByReorder() {
        const routeId = this.routeManager.currentRouteId;
        if (!routeId) return;

        try {
            // Resolve conflicts by applying time-based order
            await ApiService.resolveConflictByReorder(routeId, false);

            // Reload route to show new order
            const places = await this.routeManager.loadCurrentRoute();
            if (places && places.length > 0) {
                this.placeManager.setPlaces(places);
                this.updateUI();
            }

            // Reload timeline
            await this.loadTimelineForCurrentRoute();

            showSuccess('Route reordered to match timeline');
        } catch (error) {
            console.error('Failed to resolve conflicts:', error);
            showError('Failed to reorder route');
        }
    }

    // Add method to App class for rendering mobile timeline
    async renderMobileTimeline() {
        const routeId = this.routeManager.currentRouteId;
        if (!routeId) {
            const container = document.getElementById('mobileTimelineContent');
            if (container) {
                container.innerHTML = '<p style="text-align: center; padding: 20px; color: #666;">No route selected</p>';
            }
            return;
        }

        try {
            const itinerary = await ApiService.getItinerary(routeId);
            const container = document.getElementById('mobileTimelineContent');

            if (!container) return;

            if (!itinerary.places || itinerary.places.length === 0) {
                container.innerHTML = '<p style="text-align: center; padding: 20px; color: #666;">No places in route</p>';
                return;
            }

            // Render simple list view
            const html = itinerary.places.map((place, idx) => {
                const startDate = place.plannedStart ? new Date(place.plannedStart).toLocaleString() : 'Not scheduled';
                const endDate = place.plannedEnd ? new Date(place.plannedEnd).toLocaleString() : 'Not scheduled';
                const stopTypeLabel = place.stopType === 0 ? 'Overnight' : place.stopType === 1 ? 'Day Stop' : 'Waypoint';

                return `
                    <div class="mobile-timeline-place" style="background: white; padding: 15px; margin-bottom: 10px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <div style="display: flex; align-items: center; margin-bottom: 8px;">
                            <div style="background: linear-gradient(135deg, ${this.getColorForIndex(idx)}); width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; margin-right: 10px;">${idx + 1}</div>
                            <h4 style="margin: 0; flex: 1;">${place.placeName}</h4>
                            <span style="background: #e3f2fd; padding: 4px 8px; border-radius: 12px; font-size: 11px; color: #1976D2;">${stopTypeLabel}</span>
                        </div>
                        <div style="font-size: 13px; color: #666;">
                            <div style="margin-bottom: 4px;">
                                <i class="fas fa-sign-in-alt" style="width: 16px;"></i> <strong>Arrival:</strong> ${startDate}
                            </div>
                            <div>
                                <i class="fas fa-sign-out-alt" style="width: 16px;"></i> <strong>Departure:</strong> ${endDate}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            container.innerHTML = html;
        } catch (error) {
            console.error('Failed to render mobile timeline:', error);
            const container = document.getElementById('mobileTimelineContent');
            if (container) {
                container.innerHTML = '<p style="text-align: center; padding: 20px; color: #f44336;">Failed to load timeline</p>';
            }
        }
    }

    getColorForIndex(idx) {
        const colors = [
            '#FF6B6B, #EE5A52',
            '#4ECDC4, #44B3AA',
            '#FFE66D, #F4D03F',
            '#A8E6CF, #88D4AB',
            '#C7CEEA, #A8B3D7'
        ];
        return colors[idx % colors.length];
    }

    async showPlaceInMobilePopup(index, isNonRoute) {
        const place = this.placeManager.places[index];
        if (!place) return;

        // Build mobile popup content
        let mobileContent = this.mapService.buildPlacePopupContent(place, index, isNonRoute, true);

        // Try to load Google data if available
        if (place.hasGoogleData && place.id) {
            try {
                const enrichedPlace = await ApiService.getEnrichedPlace(place.id);
                if (enrichedPlace && enrichedPlace.googleData) {
                    const enrichedPlaceWithCoords = {
                        ...place,
                        googleData: enrichedPlace.googleData
                    };
                    mobileContent = this.mapService.buildPlacePopupContent(enrichedPlaceWithCoords, index, isNonRoute, true);
                }
            } catch (error) {
                console.warn('Failed to load Google data for mobile popup:', error);
            }
        }

        // Show docked popup
        this.mapService.showMobileDockedPopup(mobileContent, place.id, { place, index, isNonRoute });

        // Center map on place
        this.mapService.map.setView(place.coords, this.mapService.map.getZoom());
    }

    async showAllPlaceInMobilePopup(index) {
        const place = this.allPlacesManager.filteredPlaces[index];
        if (!place) return;

        const placeWithCoords = {
            ...place,
            coords: [place.latitude, place.longitude]
        };

        // Build mobile popup content
        let mobileContent = this.mapService.buildPlacePopupContent(placeWithCoords, null, true, true);

        // Try to load Google data if available
        if (place.hasGoogleData && place.id) {
            try {
                const enrichedPlace = await ApiService.getEnrichedPlace(place.id);
                if (enrichedPlace && enrichedPlace.googleData) {
                    const enrichedPlaceWithCoords = {
                        ...placeWithCoords,
                        googleData: enrichedPlace.googleData
                    };
                    mobileContent = this.mapService.buildPlacePopupContent(enrichedPlaceWithCoords, null, true, true);
                }
            } catch (error) {
                console.warn('Failed to load Google data for mobile popup:', error);
            }
        }

        // Show docked popup
        this.mapService.showMobileDockedPopup(mobileContent, place.id, { place: placeWithCoords, index: null, isNonRoute: true });

        // Center map on place
        this.mapService.map.setView([place.latitude, place.longitude], this.mapService.map.getZoom());
    }

    updatePopupPositionIndicator(current, total) {
        const positionEl = document.getElementById('mobilePopupPosition');
        if (positionEl) {
            positionEl.textContent = `${current} of ${total}`;
        }
    }

    // ============================================
    // MODAL MODE FUNCTIONS (View/Edit Place Details)
    // ============================================

    /**
     * Open place details modal in view or edit mode
     * @param {number} placeId - Place ID
     * @param {string} mode - 'view' or 'edit'
     */
    async showPlaceDetailsModal(placeId, mode = 'view') {
        // Find the place in current route or all places
        let place = null;
        let placeIndex = null;

        // Check if it's in the current route
        placeIndex = this.placeManager.places.findIndex(p => p.id === placeId);
        if (placeIndex >= 0) {
            place = this.placeManager.places[placeIndex];
        } else {
            // Check in all places
            place = this.filterManager.allPlaces.find(p => p.id === placeId);
        }

        if (!place) {
            showError('Place not found');
            return;
        }

        // Set modal mode
        const modal = document.getElementById('editPlaceModal');
        if (modal) {
            modal.setAttribute('data-mode', mode);

            // Update modal title based on mode
            const modalTitle = document.getElementById('editPlaceModalTitle');
            if (modalTitle) {
                if (mode === 'view') {
                    modalTitle.innerHTML = '<i class="fas fa-info-circle"></i> Place Details';
                } else {
                    modalTitle.innerHTML = '<i class="fas fa-edit"></i> Edit Place';
                }
            }
        }

        // Open the modal using existing showRenamePlaceModal
        if (placeIndex >= 0) {
            await this.placeManager.showRenamePlaceModal(placeIndex);
        } else {
            // For non-route places, use editNonRoutePlace
            await this.editNonRoutePlace(placeId);
        }
    }

    /**
     * Switch between view and edit modes in the place modal
     * @param {string} mode - 'view' or 'edit'
     */
    switchPlaceModalMode(mode) {
        const modal = document.getElementById('editPlaceModal');
        if (!modal) return;

        modal.setAttribute('data-mode', mode);

        // Update modal title
        const modalTitle = document.getElementById('editPlaceModalTitle');
        if (modalTitle) {
            if (mode === 'view') {
                modalTitle.innerHTML = '<i class="fas fa-info-circle"></i> Place Details';
            } else {
                modalTitle.innerHTML = '<i class="fas fa-edit"></i> Edit Place';
            }
        }

        // If switching to edit mode, make sure inputs are editable
        if (mode === 'edit') {
            const placeNameInput = document.getElementById('placeName');
            const notesTextarea = document.getElementById('placeNotes');
            if (placeNameInput) placeNameInput.removeAttribute('readonly');
            if (notesTextarea) notesTextarea.removeAttribute('readonly');
        }
    }

    /**
     * Open place details from mobile popup "View Details" button
     */
    openPlaceDetailsFromPopup() {
        const popupData = this.mapService.getCurrentMobilePopupData();
        if (!popupData) return;

        const { placeId, placeData } = popupData;

        // Hide mobile popup
        this.mapService.hideMobileDockedPopup();

        // Open details modal in view mode
        if (placeData?.place?.id) {
            this.showPlaceDetailsModal(placeData.place.id, 'view');
        } else if (placeId) {
            this.showPlaceDetailsModal(placeId, 'view');
        }
    }

    /**
     * Handle successful login - reload the application
     */
    async onLoginSuccess() {
        console.log('Login successful, initializing app...');
        try {
            // Reload the page to reinitialize everything with authentication
            window.location.reload();
        } catch (error) {
            console.error('Error after login:', error);
            showError('Error loading application after login. Please refresh the page.');
        }
    }

    /**
     * Handle authentication errors globally
     */
    handleAuthenticationError(error) {
        if (error.message === 'AUTHENTICATION_REQUIRED') {
            console.log('Authentication required, showing login modal');
            if (this.loginModal) {
                this.loginModal.show();
            }
            return true;
        }
        return false;
    }

    /**
     * Handle user logout
     */
    async handleLogout() {
        const confirmed = await showConfirm(
            'Are you sure you want to logout?',
            'You will need to login again to access your routes and places.'
        );

        if (confirmed) {
            try {
                await AuthManager.logout();
                showSuccess('Logged out successfully');

                // Reload page to clear state and show login modal
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            } catch (error) {
                console.error('Logout error:', error);
                // Still reload on error since tokens are cleared locally
                window.location.reload();
            }
        }
    }
}

// Initialize app when DOM is loaded
window.addEventListener('load', async () => {
    window.app = new App();
    window.mapService = window.app.mapService; // Expose for onclick handlers
    await window.app.init();
});

// Export for global access (for inline event handlers)
window.handleSearch = () => window.app?.handleSearch();
window.handleAddCampsite = () => window.app?.handleAddCampsite();
window.handleLogout = () => window.app?.handleLogout();
window.switchTab = (tab) => window.app?.switchTab(tab);
window.showCreateRouteModal = () => window.app?.showCreateRouteModal();
window.showRenameRouteModal = () => window.app?.showRenameRouteModal();
window.closeRouteModal = () => window.app?.closeRouteModal();
window.saveRoute = () => window.app?.saveRoute();
window.deleteCurrentRoute = () => window.app?.deleteCurrentRoute();
window.recalculateCurrentRoute = async () => {
    const routeId = window.app?.routeManager?.currentRouteId;
    if (!routeId) {
        showError('No route selected');
        return;
    }
    try {
        const result = await ApiService.recalculateLegsFromOsrm(routeId);
        showSuccess(result.message || 'Route recalculated successfully!');

        // Reload route to get fresh legs
        const places = await window.app?.routeManager?.loadCurrentRoute();
        window.app?.placeManager?.setPlaces(places);

        // Reload timeline to show updated data
        await window.app?.loadTimelineForCurrentRoute();

        // Update UI with fresh geometry
        window.app?.updateUI();
    } catch (error) {
        console.error('Failed to recalculate route:', error);
        showError(error.message || 'Failed to recalculate route');
    }
};
window.centerMap = () => window.app?.centerMap();
window.toggleRoute = () => window.app?.toggleRoute();
window.getCurrentLocation = () => window.app?.getCurrentLocation();
window.exportRoute = () => window.app?.exportRoute();
window.importRoute = () => window.app?.importRoute();
window.clearRoute = () => window.app?.clearRoute();
window.closePlaceModal = () => window.app?.placeManager?.closePlaceModal();
window.savePlaceEdit = () => window.app?.placeManager?.savePlaceEdit();
window.closeAddPlacePositionModal = () => window.app?.placeManager?.closeAddPlacePositionModal();
window.closePlaceAddedSuccessModal = () => window.app?.placeManager?.closePlaceAddedSuccessModal();
window.addSavedPlaceToRoute = () => window.app?.placeManager?.addSavedPlaceToRoute();

// Mobile popup gallery
window.openPhotosGallery = () => window.app?.mapService?.openCurrentPhotosGallery();
window.closePhotosGallery = () => window.app?.mapService?.hideFullscreenImageGallery();

// Mobile popup navigation
window.navigateToNextPlace = () => window.app?.navigateToNextPlace();
window.navigateToPreviousPlace = () => window.app?.navigateToPreviousPlace();

// Global access for managers
window.placeManager = null; // Will be set by app
window.routeManager = null; // Will be set by app
window.campsiteManager = null; // Will be set by app
window.filterManager = null; // Will be set by app
window.allPlacesManager = null; // Will be set by app
window.tagManager = null; // Will be set by app
window.CONFIG = CONFIG; // Make CONFIG available globally

// Set global references after app initialization
window.addEventListener('load', () => {
    setTimeout(() => {
        if (window.app) {
            window.placeManager = window.app.placeManager;
            window.routeManager = window.app.routeManager;
            window.campsiteManager = window.app.campsiteManager;
            window.filterManager = window.app.filterManager;
            window.allPlacesManager = window.app.allPlacesManager;
            window.tagManager = window.app.tagManager;
        }
    }, 100);
});
// Mobile mode switching function
window.switchMobileMode = function(mode) {
    console.log('Switching to mobile mode:', mode);
    
    // Update nav items
    const navItems = document.querySelectorAll('.mobile-nav-item');
    navItems.forEach(item => {
        if (item.dataset.mode === mode) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    // Update mobile sections
    const sections = document.querySelectorAll('.mobile-section');
    sections.forEach(section => {
        if (section.dataset.section === mode) {
            section.style.display = 'block';
        } else {
            section.style.display = 'none';
        }
    });
    
    // Update panel title
    const titles = {
        routes: 'Route Selection',
        search: 'Save Place',
        places: 'Route Places',
        allplaces: 'All Places',
        campsites: 'Campsites',
        controls: 'Tools',
        timeline: 'Route Timeline'
    };
    
    const titleEl = document.getElementById('mobilePanelTitle');
    if (titleEl && titles[mode]) {
        titleEl.textContent = titles[mode];
    }
    
    // If timeline mode, ensure timeline is rendered for mobile
    if (mode === 'timeline' && window.app) {
        // The timeline will use the same TimelineService instance
        // Just make sure it's visible and rendered
        setTimeout(() => {
            window.app.renderMobileTimeline();
        }, 100);
    }
};
