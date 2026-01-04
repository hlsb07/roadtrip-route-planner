import { ApiService } from './api.js';
import { showSuccess, showError, sleep, showConfirm } from './utils.js';

export class PlaceManager {
    constructor(routeManager, onUpdate = null, onReordered = null) {
        this.routeManager = routeManager;
        this.places = [];
        this.onUpdate = onUpdate;
        this.onReordered = onReordered; // Callback for when route order changes
        this.selectedIndex = null;
        this.sortableInstances = {}; // Track Sortable instances
        this.sortingEnabled = false; // Track if sorting mode is active
    }

    async addPlace(place, addToRoute = false) {
        try {
            // 1. Create/save place in Places table (if not already exists)
            let placeId = place.id;
            let placeName = place.name;

            if (!placeId) {
                const newPlace = await ApiService.createPlace(
                    place.name,
                    place.coords[0],
                    place.coords[1]
                );
                placeId = newPlace.id;
                placeName = newPlace.name;

                // Reload filterManager.allPlaces to include the new place
                if (this.routeManager && this.routeManager.filterManager) {
                    this.routeManager.filterManager.allPlaces = await ApiService.getAllPlaces();
                }
            }

            // 2. If addToRoute is true, add place to current route
            if (addToRoute) {
                const currentRouteId = this.routeManager.getCurrentRouteId();
                if (!currentRouteId) {
                    showError('No route selected. Create a route first.');
                    return { success: false };
                }

                await ApiService.addPlaceToRoute(currentRouteId, placeId);

                // Reload current route and update UI
                this.places = await this.routeManager.loadCurrentRoute();
                await this.routeManager.loadRoutes(); // For place count update

                showSuccess(`Added "${placeName}" to route!`);
            } else {
                // Just saved to database, show success modal
                this.showPlaceAddedSuccessModal(placeId, placeName);
            }

            return { success: true, placeId, placeName };

        } catch (error) {
            console.error('Failed to add place:', error);
            showError(error.message || 'Failed to save place');
            return { success: false };
        }
    }

    /**
     * Add a place from Google Places with duplicate detection
     * @param {string} googlePlaceId - Google Place ID
     * @param {string} placeName - Name of the place
     * @param {string|null} notes - Optional user notes
     * @param {boolean} addToRoute - Whether to add to current route
     * @returns {Promise<Object>} Result with success status, placeId, placeName
     */
    async addPlaceFromGoogle(googlePlaceId, placeName, notes = null, addToRoute = false) {
        try {
            // 1. Check for duplicates first
            const duplicateCheck = await ApiService.checkDuplicateGooglePlace(googlePlaceId);

            if (duplicateCheck.isDuplicate) {
                // Show duplicate modal and return - let user decide
                return await this.handleDuplicatePlace(duplicateCheck, googlePlaceId, placeName, notes, addToRoute);
            }

            // 2. No duplicate - create place from Google
            const newPlace = await ApiService.createPlaceFromGoogle(googlePlaceId, notes);
            const placeId = newPlace.id;
            const savedPlaceName = newPlace.name;

            // 3. Reload filterManager.allPlaces to include the new place
            if (this.routeManager && this.routeManager.filterManager) {
                this.routeManager.filterManager.allPlaces = await ApiService.getAllPlaces();
            }

            // 4. If addToRoute is true, add place to current route
            if (addToRoute) {
                const currentRouteId = this.routeManager.getCurrentRouteId();
                if (!currentRouteId) {
                    showError('No route selected. Create a route first.');
                    return { success: false };
                }

                await ApiService.addPlaceToRoute(currentRouteId, placeId);

                // Reload current route and update UI
                this.places = await this.routeManager.loadCurrentRoute();
                await this.routeManager.loadRoutes(); // For place count update

                showSuccess(`Added "${savedPlaceName}" from Google to route!`);
            } else {
                // Just saved to database, show success modal
                this.showPlaceAddedSuccessModal(placeId, savedPlaceName);
            }

            return { success: true, placeId, placeName: savedPlaceName };

        } catch (error) {
            console.error('Failed to add place from Google:', error);
            showError(error.message || 'Failed to save place from Google');
            return { success: false };
        }
    }

    /**
     * Handle duplicate place detection
     * Shows modal with options to view existing or add anyway
     */
    async handleDuplicatePlace(duplicateCheck, googlePlaceId, placeName, notes, addToRoute) {
        return new Promise((resolve) => {
            const modal = document.getElementById('duplicatePlaceModal');
            if (!modal) {
                console.error('Duplicate place modal not found');
                resolve({ success: false });
                return;
            }

            // Populate modal content
            const existingPlace = duplicateCheck.existingPlace;
            document.getElementById('duplicatePlaceName').textContent = placeName;
            document.getElementById('existingPlaceName').textContent = existingPlace.name;
            document.getElementById('duplicateWarningMessage').textContent = duplicateCheck.message;

            // Show/hide "Add Anyway" button based on coordinate difference
            const addAnywayBtn = document.getElementById('duplicateAddAnywayBtn');
            if (addAnywayBtn) {
                if (duplicateCheck.coordinatesDiffer) {
                    addAnywayBtn.style.display = 'inline-block';
                } else {
                    addAnywayBtn.style.display = 'none';
                }
            }

            // Set up button handlers
            const viewBtn = document.getElementById('duplicateViewBtn');
            const cancelBtn = document.getElementById('duplicateCancelBtn');

            const cleanup = () => {
                modal.classList.remove('active');
                if (viewBtn) viewBtn.onclick = null;
                if (addAnywayBtn) addAnywayBtn.onclick = null;
                if (cancelBtn) cancelBtn.onclick = null;
            };

            if (viewBtn) {
                viewBtn.onclick = async () => {
                    cleanup();
                    // Open existing place in edit modal
                    const placeIndex = this.places.findIndex(p => p.id === existingPlace.id);
                    if (placeIndex !== -1) {
                        await this.showRenamePlaceModal(placeIndex);
                    }
                    resolve({ success: false, duplicate: true });
                };
            }

            if (addAnywayBtn) {
                addAnywayBtn.onclick = async () => {
                    cleanup();
                    // Proceed with creating despite duplicate
                    try {
                        const newPlace = await ApiService.createPlaceFromGoogle(googlePlaceId, notes);

                        // Reload filterManager.allPlaces to include the new place
                        if (this.routeManager && this.routeManager.filterManager) {
                            this.routeManager.filterManager.allPlaces = await ApiService.getAllPlaces();
                        }

                        if (addToRoute) {
                            const currentRouteId = this.routeManager.getCurrentRouteId();
                            if (currentRouteId) {
                                await ApiService.addPlaceToRoute(currentRouteId, newPlace.id);
                                this.places = await this.routeManager.loadCurrentRoute();
                                await this.routeManager.loadRoutes();
                                showSuccess(`Added "${newPlace.name}" to route!`);
                            }
                        } else {
                            this.showPlaceAddedSuccessModal(newPlace.id, newPlace.name);
                        }
                        resolve({ success: true, placeId: newPlace.id, placeName: newPlace.name });
                    } catch (error) {
                        showError('Failed to add place');
                        resolve({ success: false });
                    }
                };
            }

            if (cancelBtn) {
                cancelBtn.onclick = () => {
                    cleanup();
                    resolve({ success: false, cancelled: true });
                };
            }

            // Show modal
            modal.classList.add('active');
        });
    }

    async removePlace(index) {
        const currentRouteId = this.routeManager.getCurrentRouteId();
        if (!currentRouteId || !this.places[index]) return false;

        const place = this.places[index];

        const confirmed = await showConfirm({
            title: 'Remove from Route',
            message: `Remove "${place.name}" from this route?`,
            type: 'warning',
            confirmText: 'Remove',
            cancelText: 'Cancel'
        });

        if (!confirmed) {
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

            // Update the places list UI
            this.updatePlacesList();

            // Update map and other UI components (including timeline)
            if (this.onUpdate) {
                this.onUpdate();
            }

            // Trigger timeline reload after place removal
            if (this.onReordered) {
                await this.onReordered();
            }

            showSuccess(`Removed "${place.name}" from route`);
            return true;

        } catch (error) {
            console.error('Failed to remove place:', error);

            // Handle 404 - place not found in route
            if (error.status === 404) {
                showError(`This place is not in the current route. Refreshing...`);

                // Reload the route to sync the UI
                this.places = await this.routeManager.loadCurrentRoute();
                await this.routeManager.loadRoutes();

                // Update the UI
                this.updatePlacesList();

                return false;
            }

            showError(error.message || 'Failed to remove place');
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
        const notesInput = document.getElementById('placeNotes');
        const removeFromRouteBtn = document.getElementById('removeFromRouteBtn');
        const refreshGoogleBtn = document.getElementById('refreshGoogleDataBtn');
        const googleDataBadge = document.getElementById('googleDataBadge');

        if (!modal || !nameInput || !latInput || !lngInput) return;

        // Set to edit mode by default if not already set (preserve existing mode if set externally)
        if (!modal.getAttribute('data-mode')) {
            modal.setAttribute('data-mode', 'edit');
            const modalTitle = document.getElementById('editPlaceModalTitle');
            if (modalTitle) {
                modalTitle.innerHTML = '<i class="fas fa-edit"></i> Edit Place';
            }
        }

        // Set current values
        nameInput.value = place.name;
        latInput.value = place.coords[0];
        lngInput.value = place.coords[1];

        // Set notes if available
        if (notesInput) {
            notesInput.value = place.notes || '';
        }

        // Store the index and placeId for saving
        modal.dataset.placeIndex = index;
        modal.dataset.placeId = place.id;
        modal.dataset.googlePlaceId = place.googlePlaceId || '';

        // Show/hide Google data badge and refresh button
        if (googleDataBadge) {
            if (place.googlePlaceId || place.hasGoogleData) {
                googleDataBadge.style.display = 'inline-block';
                googleDataBadge.innerHTML = '<i class="fas fa-google"></i> Google Place';
                googleDataBadge.className = 'place-badge google-badge';
            } else {
                googleDataBadge.style.display = 'inline-block';
                googleDataBadge.innerHTML = '<i class="fas fa-map-marker-alt"></i> Manual Place';
                googleDataBadge.className = 'place-badge manual-badge';
            }
        }

        if (refreshGoogleBtn) {
            if (place.googlePlaceId || place.hasGoogleData) {
                refreshGoogleBtn.style.display = 'inline-block';
            } else {
                refreshGoogleBtn.style.display = 'none';
            }
        }

        // Show/hide "Remove from Route" button based on whether place is in current route
        const currentRouteId = this.routeManager.getCurrentRouteId();
        const isInCurrentRoute = this.places.some(p => p.id === place.id);

        if (removeFromRouteBtn) {
            if (currentRouteId && isInCurrentRoute) {
                removeFromRouteBtn.style.display = 'block';
            } else {
                removeFromRouteBtn.style.display = 'none';
            }
        }

        // Display Google Maps extended information if available
        await this.displayGooglePlaceInfoEnriched(place);

        // Load categories and countries
        await this.loadCategoriesAndCountries(place.id);

        // Show modal
        modal.classList.add('active');
        nameInput.focus();
        nameInput.select();
    }

    /**
     * Display enriched Google place information in edit modal
     * Loads full data from backend if needed
     */
    async displayGooglePlaceInfoEnriched(place) {
        const infoSection = document.getElementById('googlePlaceInfo');
        if (!infoSection) return;

        // If place has Google data, try to load enriched info
        if (place.googlePlaceId || place.hasGoogleData) {
            try {
                // Load enriched place data from backend
                const enrichedPlace = await ApiService.getEnrichedPlace(place.id);

                // Update the modal with enriched data
                if (enrichedPlace && enrichedPlace.googleData) {
                    this.displayGoogleDataSection(enrichedPlace.googleData);
                    infoSection.style.display = 'block';
                    return;
                }
            } catch (error) {
                console.error('Failed to load enriched place data:', error);
            }
        }

        // Fallback to existing display method
        this.displayGooglePlaceInfo(place);
    }

    /**
     * Display Google data section with photos, rating, etc.
     */
    displayGoogleDataSection(googleData) {
        const infoSection = document.getElementById('googlePlaceInfo');
        if (!infoSection || !googleData) return;

        // Display photos
        const photosGallery = document.getElementById('placePhotosGallery');
        if (photosGallery && googleData.photos && googleData.photos.length > 0) {
            photosGallery.innerHTML = googleData.photos.slice(0, 5).map(photo =>
                `<img src="${photo.photoUrl}" alt="${googleData.name}" />`
            ).join('');
            photosGallery.style.display = 'grid';
        } else if (photosGallery) {
            photosGallery.style.display = 'none';
        }

        // Display rating
        const ratingInfo = document.getElementById('placeRatingInfo');
        const ratingValue = document.getElementById('placeRatingValue');
        if (googleData.rating && ratingInfo && ratingValue) {
            const stars = '⭐'.repeat(Math.floor(googleData.rating));
            const reviewCount = googleData.userRatingsTotal ? ` (${googleData.userRatingsTotal} reviews)` : '';
            ratingValue.textContent = `${stars} ${googleData.rating.toFixed(1)}${reviewCount}`;
            ratingInfo.style.display = 'flex';
        } else if (ratingInfo) {
            ratingInfo.style.display = 'none';
        }

        // Display website
        const websiteInfo = document.getElementById('placeWebsiteInfo');
        const websiteLink = document.getElementById('placeWebsiteLink');
        if (googleData.website && websiteInfo && websiteLink) {
            websiteLink.href = googleData.website;
            websiteInfo.style.display = 'flex';
        } else if (websiteInfo) {
            websiteInfo.style.display = 'none';
        }

        // Display phone
        const phoneInfo = document.getElementById('placePhoneInfo');
        const phoneLink = document.getElementById('placePhoneLink');
        if (googleData.phoneNumber && phoneInfo && phoneLink) {
            phoneLink.href = `tel:${googleData.phoneNumber}`;
            phoneLink.textContent = googleData.phoneNumber;
            phoneInfo.style.display = 'flex';
        } else if (phoneInfo) {
            phoneInfo.style.display = 'none';
        }

        // Display price level
        const priceInfo = document.getElementById('placePriceInfo');
        const priceValue = document.getElementById('placePriceValue');
        if (googleData.priceLevel !== null && googleData.priceLevel !== undefined && priceInfo && priceValue) {
            priceValue.textContent = '$'.repeat(googleData.priceLevel) + ' price level';
            priceInfo.style.display = 'flex';
        } else if (priceInfo) {
            priceInfo.style.display = 'none';
        }

        // Display business status
        const statusInfo = document.getElementById('placeStatusInfo');
        const statusValue = document.getElementById('placeStatusValue');
        if (googleData.businessStatus && statusInfo && statusValue) {
            let statusText = '';
            let statusColor = '#34a853';

            if (googleData.businessStatus === 'OPERATIONAL') {
                statusText = '✓ Open';
                statusColor = '#34a853';
            } else if (googleData.businessStatus === 'CLOSED_TEMPORARILY') {
                statusText = '⚠ Temporarily Closed';
                statusColor = '#fbbc04';
            } else if (googleData.businessStatus === 'CLOSED_PERMANENTLY') {
                statusText = '✕ Permanently Closed';
                statusColor = '#ea4335';
            } else {
                statusText = googleData.businessStatus;
            }

            statusValue.textContent = statusText;
            statusValue.style.color = statusColor;
            statusInfo.style.display = 'flex';
        } else if (statusInfo) {
            statusInfo.style.display = 'none';
        }

        // Display address
        const addressInfo = document.getElementById('placeAddressInfo');
        const addressValue = document.getElementById('placeAddressValue');
        if (googleData.formattedAddress && addressInfo && addressValue) {
            addressValue.textContent = googleData.formattedAddress;
            addressInfo.style.display = 'block';
        } else if (addressInfo) {
            addressInfo.style.display = 'none';
        }

        // Display opening hours
        const hoursInfo = document.getElementById('placeHoursInfo');
        const hoursValue = document.getElementById('placeHoursValue');
        if (googleData.openingHours && hoursInfo && hoursValue) {
            try {
                const hours = typeof googleData.openingHours === 'string'
                    ? JSON.parse(googleData.openingHours)
                    : googleData.openingHours;

                if (hours.weekday_text && hours.weekday_text.length > 0) {
                    hoursValue.innerHTML = hours.weekday_text.map(day =>
                        `<div class="hours-day">${day}</div>`
                    ).join('');
                    hoursInfo.style.display = 'block';
                } else {
                    hoursInfo.style.display = 'none';
                }
            } catch (e) {
                console.warn('Failed to parse opening hours:', e);
                hoursInfo.style.display = 'none';
            }
        } else if (hoursInfo) {
            hoursInfo.style.display = 'none';
        }

        infoSection.style.display = 'block';
    }

    /**
     * Refresh Google data for a place
     */
    async refreshGoogleDataForPlace() {
        const modal = document.getElementById('editPlaceModal');
        if (!modal) return;

        const placeId = parseInt(modal.dataset.placeId);
        const index = parseInt(modal.dataset.placeIndex);

        if (!this.places[index]) return;

        const refreshBtn = document.getElementById('refreshGoogleDataBtn');
        if (refreshBtn) {
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = '<i class="fas fa-sync fa-spin"></i> Refreshing...';
        }

        try {
            const result = await ApiService.refreshGoogleData(placeId);

            // Show which fields were updated
            if (result.updatedFields && result.updatedFields.length > 0) {
                showSuccess(`Updated ${result.updatedFields.length} fields: ${result.updatedFields.join(', ')}`);
            } else {
                showSuccess('Google data is up to date!');
            }

            // Reload enriched data
            const place = this.places[index];
            await this.displayGooglePlaceInfoEnriched(place);

        } catch (error) {
            console.error('Failed to refresh Google data:', error);
            showError(error.message || 'Failed to refresh Google data');
        } finally {
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.innerHTML = '<i class="fas fa-sync"></i> Refresh from Google';
            }
        }
    }

    displayGooglePlaceInfo(place) {
        const infoSection = document.getElementById('googlePlaceInfo');
        if (!infoSection) return;

        // Check if we have any Google Maps data
        const hasGoogleData = place.photos && place.photos.length > 0 ||
                             place.rating || place.website || place.phoneNumber || place.priceLevel;

        if (!hasGoogleData) {
            infoSection.style.display = 'none';
            return;
        }

        infoSection.style.display = 'block';

        // Display photos
        const photosGallery = document.getElementById('placePhotosGallery');
        if (photosGallery && place.photos && place.photos.length > 0) {
            photosGallery.innerHTML = place.photos.slice(0, 5).map(photo =>
                `<img src="${photo.photoUrl}" alt="${place.name}" />`
            ).join('');
            photosGallery.style.display = 'grid';
        } else if (photosGallery) {
            photosGallery.style.display = 'none';
        }

        // Display rating
        const ratingInfo = document.getElementById('placeRatingInfo');
        const ratingValue = document.getElementById('placeRatingValue');
        if (place.rating && ratingInfo && ratingValue) {
            const stars = '⭐'.repeat(Math.floor(place.rating));
            const reviewCount = place.userRatingsTotal ? ` (${place.userRatingsTotal} reviews)` : '';
            ratingValue.textContent = `${stars} ${place.rating.toFixed(1)}${reviewCount}`;
            ratingInfo.style.display = 'flex';
        } else if (ratingInfo) {
            ratingInfo.style.display = 'none';
        }

        // Display website
        const websiteInfo = document.getElementById('placeWebsiteInfo');
        const websiteLink = document.getElementById('placeWebsiteLink');
        if (place.website && websiteInfo && websiteLink) {
            websiteLink.href = place.website;
            websiteInfo.style.display = 'flex';
        } else if (websiteInfo) {
            websiteInfo.style.display = 'none';
        }

        // Display phone
        const phoneInfo = document.getElementById('placePhoneInfo');
        const phoneLink = document.getElementById('placePhoneLink');
        if (place.phoneNumber && phoneInfo && phoneLink) {
            phoneLink.href = `tel:${place.phoneNumber}`;
            phoneLink.textContent = place.phoneNumber;
            phoneInfo.style.display = 'flex';
        } else if (phoneInfo) {
            phoneInfo.style.display = 'none';
        }

        // Display price level
        const priceInfo = document.getElementById('placePriceInfo');
        const priceValue = document.getElementById('placePriceValue');
        if (place.priceLevel !== null && place.priceLevel !== undefined && priceInfo && priceValue) {
            priceValue.textContent = '$'.repeat(place.priceLevel) + ' price level';
            priceInfo.style.display = 'flex';
        } else if (priceInfo) {
            priceInfo.style.display = 'none';
        }
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
        const notesInput = document.getElementById('placeNotes');

        if (!modal || !nameInput || !latInput || !lngInput) return;

        const index = parseInt(modal.dataset.placeIndex);
        const placeId = parseInt(modal.dataset.placeId);
        const newName = nameInput.value.trim();
        const newLat = parseFloat(latInput.value);
        const newLng = parseFloat(lngInput.value);
        const newNotes = notesInput ? notesInput.value.trim() : null;

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
            // Update place name, coordinates, and notes
            await ApiService.updatePlace(placeId, newName, newLat, newLng, newNotes);

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

            // Refresh filter data FIRST (fetch fresh data from API)
            if (window.filterManager) {
                await window.filterManager.refreshPlacesData();
            }

            // Then reload route (uses fresh filterManager.allPlaces)
            this.places = await this.routeManager.loadCurrentRoute();
            await this.routeManager.loadRoutes();

            showSuccess(`Updated "${newName}"`);
            this.closePlaceModal();

            // Update UI to refresh map with new data
            if (this.onUpdate) {
                this.onUpdate();
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
            // Use enhanced reorder with schedule recalculation
            await ApiService.reorderPlacesWithSchedule(
                currentRouteId,
                newOrder,
                true,  // recalculateSchedule
                true   // preserveLockedDays
            );
            this.places = await this.routeManager.loadCurrentRoute();

            // Trigger timeline reload after route reorder
            if (this.onReordered) {
                await this.onReordered();
            }

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

    async clearRoute() {
        if (this.places.length === 0) return;

        const confirmed = await showConfirm({
            title: 'Clear Route',
            message: 'Clear all places from your route?',
            type: 'warning',
            confirmText: 'Clear All',
            cancelText: 'Cancel'
        });

        if (confirmed) {
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
                    <i class="fas fa-arrow-up"></i>
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

                // Update order on backend with schedule recalculation
                await ApiService.reorderPlacesWithSchedule(
                    currentRouteId,
                    reorderedIds,
                    true,  // recalculateSchedule
                    true   // preserveLockedDays
                );

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

    /**
     * Show "Place Added Successfully" modal after saving a place
     */
    showPlaceAddedSuccessModal(placeId, placeName) {
        const modal = document.getElementById('placeAddedSuccessModal');
        const placeNameSpan = document.getElementById('savedPlaceName');

        if (!modal || !placeNameSpan) return;

        // Set place name and ID
        placeNameSpan.textContent = placeName;
        modal.dataset.placeId = placeId;
        modal.dataset.placeName = placeName;

        // Show modal
        modal.classList.add('active');
    }

    /**
     * Close "Place Added Successfully" modal
     */
    closePlaceAddedSuccessModal() {
        const modal = document.getElementById('placeAddedSuccessModal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    /**
     * Add saved place to route (called from success modal)
     */
    addSavedPlaceToRoute() {
        const modal = document.getElementById('placeAddedSuccessModal');
        if (!modal) return;

        const placeId = parseInt(modal.dataset.placeId);
        const placeName = modal.dataset.placeName;

        // Close success modal
        this.closePlaceAddedSuccessModal();

        // Show position selector modal
        this.showAddPlacePositionModal(placeId, placeName);
    }

    /**
     * Remove place from current route (but keep in database)
     */
    async removeFromCurrentRoute() {
        const modal = document.getElementById('editPlaceModal');
        if (!modal) return;

        const placeId = parseInt(modal.dataset.placeId);
        const index = parseInt(modal.dataset.placeIndex);

        if (!this.places[index]) return;

        const place = this.places[index];
        const currentRouteId = this.routeManager.getCurrentRouteId();

        if (!currentRouteId) {
            showError('No route selected');
            return;
        }

        const confirmed = await showConfirm({
            title: 'Remove from Route',
            message: `Remove "${place.name}" from this route?\n\nThe place will remain in your saved places.`,
            type: 'warning',
            confirmText: 'Remove',
            cancelText: 'Cancel'
        });

        if (!confirmed) {
            return;
        }

        try {
            // Remove from RoutePlace junction (not from Places table)
            await ApiService.removePlaceFromRoute(currentRouteId, placeId);

            // Reload route
            this.places = await this.routeManager.loadCurrentRoute();
            await this.routeManager.loadRoutes(); // For place count update

            showSuccess(`Removed "${place.name}" from route`);

            // Close modal
            this.closePlaceModal();

            // Update UI
            if (this.onUpdate) {
                this.onUpdate();
            }

            // Refresh filter data so it appears in All Places
            if (window.filterManager) {
                await window.filterManager.refreshPlaces(this.places);
            }

            // Update All Places list if available
            if (window.allPlacesManager) {
                window.allPlacesManager.updateAllPlacesList();
            }

        } catch (error) {
            console.error('Failed to remove place from route:', error);
            showError('Failed to remove place from route');
        }
    }
}