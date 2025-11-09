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

class App {
    constructor() {
        this.mapService = new MapService();
        this.filterManager = new FilterManager();  // Create filterManager first
        this.routeManager = new RouteManager(this.filterManager);  // Pass filterManager
        this.searchManager = new SearchManager();
        this.placeManager = new PlaceManager(this.routeManager, () => this.updateUI());
        this.campsiteManager = new CampsiteManager(() => this.updateCampsiteUI());
        this.allPlacesManager = new AllPlacesManager(this.filterManager, this.placeManager);
        this.tagManager = new TagManager();

        // Set callback for search result selection (save to database, don't add to route)
        this.searchManager.setOnSelectCallback((place) => this.addPlace(place));

        // Set callback for filter changes
        this.filterManager.onFilterChange((filtered, scope) => {
            this.updateMapWithFilteredPlaces(filtered, scope);
        });

        this.bindEventListeners();
        this.setupKeyboardShortcuts();
        this.setupMobilePopupSwipe();
    }

    async init() {
        try {
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

            // Initialize filters FIRST (fetches all places with full data)
            await this.filterManager.init();

            // Load routes and first route (now can use filterManager.allPlaces)
            const places = await this.routeManager.loadRoutes();
            if (places && places.length > 0) {
                this.placeManager.setPlaces(places);
                this.updateUI();
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
    updateUI() {
        this.placeManager.updatePlacesList();

        // Update All Places list
        this.allPlacesManager.updateAllPlacesList();

        // Get current route places
        const routePlaces = this.placeManager.getPlaces();

        // Get filtered places from FilterManager
        const filtered = this.filterManager.getFilteredPlaces(routePlaces);
        const scope = this.filterManager.filterScope;

        // Update map based on filter scope
        if (scope === 'route') {
            // Show only route places (existing behavior)
            this.mapService.updateMap(routePlaces);
        } else if (scope === 'all') {
            // Show only non-route places
            this.mapService.updateMapWithBothPlaceTypes([], filtered.nonRoutePlaces);
        } else {
            // Show both (default)
            this.mapService.updateMapWithBothPlaceTypes(routePlaces, filtered.nonRoutePlaces);
        }

        // Re-center map to show all visible places
        if (routePlaces.length > 0 || filtered.nonRoutePlaces.length > 0) {
            this.mapService.centerMap(routePlaces);
        }
    }

    selectPlace(index) {
        this.placeManager.selectPlace(index);
        this.mapService.selectedMarkerIndex = index;
        this.updateUI();
        this.mapService.selectPlace(index);

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
            // Check if place is used in any routes
            const response = await fetch(`${CONFIG.API_BASE}/places/${placeId}`);
            if (!response.ok) {
                throw new Error('Failed to check place usage');
            }

            // Delete the place
            const deleteResponse = await fetch(`${CONFIG.API_BASE}/places/${placeId}`, {
                method: 'DELETE'
            });

            if (!deleteResponse.ok) {
                throw new Error('Failed to delete place');
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
        console.log('setupMobilePopupSwipe - popup element:', popup);
        if (!popup) {
            console.warn('Mobile popup element not found during setup');
            return;
        }

        let startX = 0;
        let startY = 0;
        let startTime = 0;
        let currentY = 0;
        let isDragging = false;
        let swipeDirection = null; // 'horizontal' or 'vertical'
        let initialHeight = 0;
        const compactHeight = 320; // px
        const expandedHeight = window.innerHeight * 0.85; // 85vh

        popup.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            currentY = startY;
            startTime = Date.now();
            isDragging = false;
            swipeDirection = null;

            // Get current height
            const currentState = popup.getAttribute('data-state');
            initialHeight = currentState === 'expanded' ? expandedHeight : compactHeight;

            console.log('Touch start:', startX, startY, 'Initial height:', initialHeight);
        }, { passive: true });

        popup.addEventListener('touchmove', (e) => {
            if (!isDragging && !swipeDirection) {
                // Determine swipe direction on first move
                const diffX = Math.abs(e.touches[0].clientX - startX);
                const diffY = Math.abs(e.touches[0].clientY - startY);

                if (diffX > 10 || diffY > 10) {
                    swipeDirection = diffX > diffY ? 'horizontal' : 'vertical';

                    // If vertical swipe down detected and near top, auto-scroll to top
                    if (swipeDirection === 'vertical') {
                        const currentState = popup.getAttribute('data-state');
                        const deltaY = currentY - startY;
                        const isSwipingDown = deltaY < 0; // Negative = down

                        if (currentState === 'expanded' && isSwipingDown) {
                            // Auto-scroll to top if near the top (makes collapse easier)
                            this.mapService.autoScrollToTopIfNear();
                        }
                    }
                }
            }

            currentY = e.touches[0].clientY;
            const deltaY = currentY - startY;

            // Only handle vertical swipes with follow-finger animation
            if (swipeDirection === 'vertical') {
                const currentState = popup.getAttribute('data-state');

                // Check if we should allow vertical dragging (now with threshold)
                const canDrag = currentState === 'compact' ||
                               (currentState === 'expanded' && this.mapService.isPopupScrolledToTop(50));

                if (canDrag) {
                    isDragging = true;

                    // Calculate new height (inverted: dragging down = taller, dragging up = shorter)
                    let newHeight = initialHeight - deltaY;

                    // Special handling for compact mode swipe down (to hide)
                    if (currentState === 'compact' && newHeight < compactHeight) {
                        // Swiping down from compact - slide the popup down to hide
                        const slideDistance = compactHeight - newHeight;
                        popup.style.maxHeight = `${compactHeight}px`;
                        popup.style.transform = `translateY(${slideDistance}px)`;
                        popup.style.transition = 'none'; // Disable transition during drag

                        // Fade out as it slides down
                        const fadeProgress = Math.min(slideDistance / 150, 1); // Fade over 150px
                        popup.style.opacity = 1 - (fadeProgress * 0.5); // Fade to 50% opacity
                    } else {
                        // Normal expand/collapse behavior
                        // Apply resistance at boundaries (rubber-banding effect)
                        if (newHeight < compactHeight) {
                            const overflow = compactHeight - newHeight;
                            newHeight = compactHeight - (overflow * 0.3); // 30% resistance
                        } else if (newHeight > expandedHeight) {
                            const overflow = newHeight - expandedHeight;
                            newHeight = expandedHeight + (overflow * 0.3); // 30% resistance
                        }

                        // Clamp to absolute min/max
                        newHeight = Math.max(compactHeight * 0.7, Math.min(expandedHeight * 1.1, newHeight));

                        // Update height in real-time
                        popup.style.maxHeight = `${newHeight}px`;
                        popup.style.transform = ''; // Clear any transform
                        popup.style.opacity = ''; // Clear any opacity change
                        popup.style.transition = 'none'; // Disable transition during drag

                        // Update swipe handle opacity for visual feedback
                        const swipeHandle = popup.querySelector('.mobile-popup-swipe-handle');
                        if (swipeHandle) {
                            const progress = (newHeight - compactHeight) / (expandedHeight - compactHeight);
                            swipeHandle.style.opacity = 0.3 + (progress * 0.4); // 0.3 to 0.7
                        }
                    }
                }
            }
        }, { passive: true });

        popup.addEventListener('touchend', (e) => {
            const endX = e.changedTouches[0].clientX;
            const endY = e.changedTouches[0].clientY;
            const endTime = Date.now();

            const diffX = startX - endX;
            const diffY = startY - endY;
            const deltaTime = endTime - startTime;
            const velocity = Math.abs(diffY) / deltaTime; // pixels per ms

            console.log('Touch end - diffX:', diffX, 'diffY:', diffY, 'velocity:', velocity);

            const absX = Math.abs(diffX);
            const absY = Math.abs(diffY);

            // Reset swipe handle
            const swipeHandle = popup.querySelector('.mobile-popup-swipe-handle');
            if (swipeHandle) {
                swipeHandle.style.opacity = '';
            }

            if (swipeDirection === 'horizontal' && absX > 50) {
                // Horizontal swipe - navigate between places
                console.log('Horizontal swipe detected:', diffX > 0 ? 'left (next)' : 'right (previous)');

                // Re-enable transitions before navigation
                popup.style.transition = '';

                if (diffX > 0) {
                    this.navigateToNextPlace();
                } else {
                    this.navigateToPreviousPlace();
                }
            } else if (swipeDirection === 'vertical' && isDragging) {
                // Vertical swipe - determine expand/collapse/hide based on position & velocity
                const currentState = popup.getAttribute('data-state');
                const currentHeight = parseInt(popup.style.maxHeight) || initialHeight;

                // Check if we're trying to hide from compact mode
                const transformMatch = popup.style.transform.match(/translateY\((-?\d+(?:\.\d+)?)px\)/);
                const slideDistance = transformMatch ? parseFloat(transformMatch[1]) : 0;

                if (currentState === 'compact' && slideDistance > 0) {
                    // Swiping down from compact - decide whether to hide or snap back
                    const shouldHide = velocity > 1.0 || slideDistance > 80; // Fast swipe or dragged far enough

                    if (shouldHide) {
                        // Hide the popup with slide-down animation
                        console.log('Hiding mobile popup - slide distance:', slideDistance, 'velocity:', velocity);
                        popup.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
                        popup.style.transform = `translateY(${compactHeight + 50}px)`; // Slide fully down
                        popup.style.opacity = '0';

                        // Actually hide after animation
                        setTimeout(() => {
                            this.mapService.hideMobileDockedPopup();
                            // Reset styles
                            popup.style.transform = '';
                            popup.style.opacity = '';
                            popup.style.transition = '';
                        }, 300);
                    } else {
                        // Snap back to compact
                        popup.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease';
                        popup.style.transform = '';
                        popup.style.opacity = '';
                        popup.style.maxHeight = '';
                        console.log('Snapping back to compact');
                    }
                } else {
                    // Normal expand/collapse behavior
                    const midPoint = (compactHeight + expandedHeight) / 2;

                    // Decision: expand or collapse?
                    let shouldExpand;
                    if (velocity > 1.5) {
                        // Fast swipe - use direction
                        shouldExpand = diffY > 0; // Swipe up = expand
                    } else {
                        // Slow swipe - use position threshold
                        shouldExpand = currentHeight > midPoint;
                    }

                    console.log('Vertical swipe - shouldExpand:', shouldExpand, 'velocity:', velocity, 'height:', currentHeight);

                    // Clear inline styles FIRST, then set state for immediate transition
                    popup.style.maxHeight = '';
                    popup.style.transform = '';
                    popup.style.opacity = '';

                    // Use requestAnimationFrame to ensure state change happens after style clear
                    requestAnimationFrame(() => {
                        // Re-enable transitions
                        popup.style.transition = '';

                        if (shouldExpand && currentState === 'compact') {
                            popup.setAttribute('data-state', 'expanded');
                            console.log('Mobile popup expanded');
                        } else if (!shouldExpand && currentState === 'expanded') {
                            popup.setAttribute('data-state', 'compact');
                            // Scroll content back to top
                            const popupContent = document.getElementById('mobilePopupContent');
                            if (popupContent) popupContent.scrollTop = 0;
                            console.log('Mobile popup collapsed');
                        }
                    });
                }
            } else if (swipeDirection === 'vertical' && absY > 50) {
                // Simple vertical swipe without dragging (fallback)
                const currentState = popup.getAttribute('data-state');

                // Clear any inline styles
                popup.style.transform = '';
                popup.style.opacity = '';
                popup.style.maxHeight = '';

                // Re-enable transitions
                popup.style.transition = '';

                if (diffY > 0 && currentState === 'compact') {
                    console.log('Swipe up detected - expanding popup');
                    this.mapService.expandMobilePopup();
                } else if (diffY < 0 && currentState === 'compact') {
                    console.log('Swipe down detected - hiding popup');
                    this.mapService.hideMobileDockedPopup();
                } else if (diffY < 0 && currentState === 'expanded' && this.mapService.isPopupScrolledToTop()) {
                    console.log('Swipe down detected - collapsing popup');
                    this.mapService.collapseMobilePopup();
                }
            } else {
                // No action needed - just clean up and re-enable transitions
                popup.style.transform = '';
                popup.style.opacity = '';
                popup.style.maxHeight = '';
                popup.style.transition = '';
            }

            // Reset state
            isDragging = false;
            swipeDirection = null;
        }, { passive: true });

        console.log('Mobile popup swipe listeners attached with animations');
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
}

// Initialize app when DOM is loaded
window.addEventListener('load', async () => {
    window.app = new App();
    window.mapService = window.app.mapService; // Expose for onclick handlers
    await window.app.init();
});

// Export for global access (for inline event handlers)
window.handleSearch = () => window.app?.handleSearch();
window.switchTab = (tab) => window.app?.switchTab(tab);
window.showCreateRouteModal = () => window.app?.showCreateRouteModal();
window.showRenameRouteModal = () => window.app?.showRenameRouteModal();
window.closeRouteModal = () => window.app?.closeRouteModal();
window.saveRoute = () => window.app?.saveRoute();
window.deleteCurrentRoute = () => window.app?.deleteCurrentRoute();
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