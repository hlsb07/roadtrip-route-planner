import { CONFIG } from './config.js';

export class MapService {
    constructor() {
        this.map = null;
        this.markers = [];
        this.nonRouteMarkers = []; // Gray markers for places not in route
        this.campsiteMarkers = [];
        this.routePolyline = null;
        this.showRoute = true;
        this.clickMarker = null;
        this.selectedMarkerIndex = null;
        this.selectedCampsiteIndex = null;
        this.onMarkerClick = null;
        this.onNonRouteMarkerClick = null; // Callback for non-route marker clicks
        this.onCampsiteMarkerClick = null;
        this.coordinateSelectionMode = false;
        this.coordinateSelectionCallback = null;
        this.coordinatePreviewMarker = null;
    }

    init() {
        this.map = L.map('map').setView(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM);
        
        L.tileLayer(CONFIG.LEAFLET_TILE_URL, {
            attribution: CONFIG.LEAFLET_ATTRIBUTION,
            maxZoom: 18
        }).addTo(this.map);

        return this.map;
    }

    onMapClick(callback) {
        this.map.on('click', (e) => {
            // Check if we're in coordinate selection mode
            if (this.coordinateSelectionMode && this.coordinateSelectionCallback) {
                // Update coordinate preview marker
                if (this.coordinatePreviewMarker) {
                    this.map.removeLayer(this.coordinatePreviewMarker);
                }

                // Create a special preview marker
                const previewIcon = L.divIcon({
                    html: '<div class="coordinate-preview-marker"><i class="fas fa-map-marker-alt"></i></div>',
                    className: 'coordinate-preview-icon',
                    iconSize: [30, 42],
                    iconAnchor: [15, 42]
                });

                this.coordinatePreviewMarker = L.marker(e.latlng, { icon: previewIcon })
                    .addTo(this.map)
                    .bindPopup(`
                        <div class="coord-preview-popup">
                            <strong>New Location</strong><br>
                            Lat: ${e.latlng.lat.toFixed(6)}<br>
                            Lng: ${e.latlng.lng.toFixed(6)}
                        </div>
                    `)
                    .openPopup();

                // Call the callback with coordinates
                this.coordinateSelectionCallback(e.latlng.lat, e.latlng.lng);
                return;
            }

            // Normal map click behavior
            const coords = `${e.latlng.lat.toFixed(6)}, ${e.latlng.lng.toFixed(6)}`;
            callback(coords, e.latlng);

            // Add temporary marker
            if (this.clickMarker) {
                this.map.removeLayer(this.clickMarker);
            }
            this.clickMarker = L.marker(e.latlng).addTo(this.map);
        });
    }

    setCoordinateSelectionMode(enabled, callback = null) {
        this.coordinateSelectionMode = enabled;
        this.coordinateSelectionCallback = callback;

        // Change cursor style
        const mapContainer = document.getElementById('map');
        if (mapContainer) {
            if (enabled) {
                mapContainer.classList.add('coordinate-selection-active');
            } else {
                mapContainer.classList.remove('coordinate-selection-active');
            }
        }

        // Clear preview marker if disabling
        if (!enabled && this.coordinatePreviewMarker) {
            this.map.removeLayer(this.coordinatePreviewMarker);
            this.coordinatePreviewMarker = null;
        }
    }

    clearClickMarker() {
        if (this.clickMarker) {
            this.map.removeLayer(this.clickMarker);
            this.clickMarker = null;
        }
    }

    updateMap(places) {
        // Clear existing markers
        this.markers.forEach(marker => this.map.removeLayer(marker));
        this.markers = [];

        // Clear existing route
        if (this.routePolyline) {
            this.map.removeLayer(this.routePolyline);
        }

        if (places.length === 0) return;

        // Add markers
        places.forEach((place, index) => {
            const isSelected = this.selectedMarkerIndex === index;

            // Create custom icon with size based on selection
            const iconSize = isSelected ? [35, 50] : [25, 41];
            const iconAnchor = isSelected ? [17, 50] : [12, 41];

            const customIcon = L.icon({
                iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
                shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
                iconSize: iconSize,
                iconAnchor: iconAnchor,
                popupAnchor: [1, -34],
                shadowSize: isSelected ? [50, 50] : [41, 41]
            });

            // Create popup content using helper method
            const popupContent = this.buildPlacePopupContent(place, index, false);

            const marker = L.marker(place.coords, { icon: customIcon })
                .addTo(this.map)
                .bindPopup(popupContent, {
                    maxWidth: 350,
                    className: 'place-popup-container'
                })
                .on('click', () => {
                    if (this.onMarkerClick) {
                        this.onMarkerClick(index);
                    }
                });
            this.markers.push(marker);
        });

        // Add route line if enabled
        if (this.showRoute && places.length > 1) {
            const coords = places.map(place => place.coords);
            this.routePolyline = L.polyline(coords, {
                color: '#667eea',
                weight: 4,
                opacity: 0.7,
                smoothFactor: 1
            }).addTo(this.map);
        }
    }

    centerMap(places) {
        if (places.length === 0) return;
        const bounds = L.latLngBounds(places.map(place => place.coords));
        this.map.fitBounds(bounds, { padding: [50, 50] });
    }

    toggleRoute() {
        this.showRoute = !this.showRoute;
        // Trigger update through callback or event
        return this.showRoute;
    }

    getCurrentLocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation is not supported by your browser'));
                return;
            }

            navigator.geolocation.getCurrentPosition(
                position => {
                    const lat = position.coords.latitude;
                    const lng = position.coords.longitude;
                    this.map.setView([lat, lng], 13);

                    // Add marker for current location
                    L.marker([lat, lng])
                        .addTo(this.map)
                        .bindPopup('Your location')
                        .openPopup();

                    resolve({ lat, lng });
                },
                error => {
                    reject(new Error('Unable to retrieve your location'));
                }
            );
        });
    }

    selectPlace(index) {
        if (index < 0 || index >= this.markers.length) return;

        this.selectedMarkerIndex = index;
        const marker = this.markers[index];

        // Open popup
        marker.openPopup();
        //this.map.setView(marker.getLatLng(), this.map.getZoom() < 13 ? 13 : this.map.getZoom());
    }

    deselectPlace() {
        this.selectedMarkerIndex = null;
    }

    setMarkerClickCallback(callback) {
        this.onMarkerClick = callback;
    }

    setNonRouteMarkerClickCallback(callback) {
        this.onNonRouteMarkerClick = callback;
    }

    updateCampsiteMarkers(campsites) {
        // Clear existing campsite markers
        this.campsiteMarkers.forEach(marker => this.map.removeLayer(marker));
        this.campsiteMarkers = [];

        if (!campsites || campsites.length === 0) return;

        // Add campsite markers
        campsites.forEach((campsite, index) => {
            if (!campsite.latitude || !campsite.longitude) return;

            const isSelected = this.selectedCampsiteIndex === index;

            // Get the first type icon if available
            const firstType = campsite.types && campsite.types.length > 0 ? campsite.types[0] : null;
            // iconPath already contains "/images/campsites/types/..." from backend
            // Nginx serves these directly from shared directory at /images/
            const iconUrl = firstType && firstType.iconPath
                ? firstType.iconPath  // e.g., "/images/campsites/types/camping.svg"
                : 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png';

            // Create custom icon
            const iconSize = isSelected ? [35, 35] : [28, 28];
            const iconAnchor = isSelected ? [17, 35] : [14, 28];

            const customIcon = L.icon({
                iconUrl: iconUrl,
                iconSize: iconSize,
                iconAnchor: iconAnchor,
                popupAnchor: [0, -28],
                className: 'campsite-marker-icon'
            });

            // Build types list for popup
            const typesList = campsite.types && campsite.types.length > 0
                ? campsite.types.map(t => t.name).join(', ')
                : 'No type specified';

            // Build services list with icons (icon only, no text)
            const servicesList = campsite.services && campsite.services.length > 0
                ? `<div class="popup-services">
                       <div class="popup-section-title"><i class="fas fa-wrench"></i> Services</div>
                       <div class="popup-icons-row">
                           ${campsite.services.map(s => `
                               <div class="popup-icon-item" title="${s.name}">
                                   ${s.iconPath
                                       ? `<img src="${s.iconPath}" alt="${s.name}" class="popup-icon">`
                                       : `<i class="fas fa-check-circle"></i>`
                                   }
                               </div>
                           `).join('')}
                       </div>
                   </div>`
                : '';

            // Build activities list with icons (icon only, no text)
            const activitiesList = campsite.activities && campsite.activities.length > 0
                ? `<div class="popup-activities">
                       <div class="popup-section-title"><i class="fas fa-hiking"></i> Activities</div>
                       <div class="popup-icons-row">
                           ${campsite.activities.map(a => `
                               <div class="popup-icon-item" title="${a.name}">
                                   ${a.iconPath
                                       ? `<img src="${a.iconPath}" alt="${a.name}" class="popup-icon">`
                                       : `<i class="fas fa-hiking"></i>`
                                   }
                               </div>
                           `).join('')}
                       </div>
                   </div>`
                : '';

            // Build image carousel
            const imageGallery = campsite.imagePaths && campsite.imagePaths.length > 0
                ? `<div class="popup-image-carousel">
                       <div class="carousel-container" id="carousel-${index}">
                           ${campsite.imagePaths.map((imgPath, idx) => `
                               <img src="${imgPath}"
                                    alt="Campsite photo ${idx + 1}"
                                    class="carousel-image ${idx === 0 ? 'active' : ''}"
                                    data-index="${idx}">
                           `).join('')}
                       </div>
                       ${campsite.imagePaths.length > 1
                           ? `<button class="carousel-btn prev" onclick="event.stopPropagation(); navigateCarousel('carousel-${index}', -1)">
                                  <i class="fas fa-chevron-left"></i>
                              </button>
                              <button class="carousel-btn next" onclick="event.stopPropagation(); navigateCarousel('carousel-${index}', 1)">
                                  <i class="fas fa-chevron-right"></i>
                              </button>
                              <div class="carousel-indicators">
                                  ${campsite.imagePaths.map((_, idx) => `
                                      <span class="indicator ${idx === 0 ? 'active' : ''}"
                                            onclick="event.stopPropagation(); goToSlide('carousel-${index}', ${idx})"></span>
                                  `).join('')}
                              </div>`
                           : ''
                       }
                   </div>`
                : '';

            // Rating display
            const ratingDisplay = campsite.rating
                ? `<div style="color: #f39c12; margin-top: 5px;"><i class="fas fa-star"></i> ${campsite.rating.toFixed(1)}/5</div>`
                : '';

            // Price display
            const priceDisplay = campsite.price
                ? `<div style="margin-top: 5px;"><strong>Price:</strong> ${campsite.price}</div>`
                : '';

            const marker = L.marker([campsite.latitude, campsite.longitude], { icon: customIcon })
                .addTo(this.map)
                .bindPopup(`
                    <div class="map-popup-content campsite-popup">
                        ${imageGallery}
                        <div class="map-popup-header">
                            <i class="fas fa-campground" style="color: #2A9D8F;"></i>
                            <strong style="margin-left: 5px;">${campsite.name || 'Unnamed Campsite'}</strong>
                        </div>
                        <div class="popup-info">
                            <div><strong>Type:</strong> ${typesList}</div>
                            ${ratingDisplay}
                            ${priceDisplay}
                        </div>
                        ${servicesList}
                        ${activitiesList}
                        <div class="map-popup-coords">Lat: ${campsite.latitude.toFixed(4)}, Lng: ${campsite.longitude.toFixed(4)}</div>
                        <div class="map-popup-links">
                            <a href="https://www.google.com/maps/search/?api=1&query=${campsite.latitude},${campsite.longitude}"
                               target="_blank"
                               class="link-btn google-maps">
                                <i class="fas fa-map"></i> Google Maps
                            </a>
                            ${campsite.sourceUrl ? `
                                <a href="${campsite.sourceUrl}"
                                   target="_blank"
                                   class="link-btn"
                                   style="background: #3EBBA5; color: white;">
                                    <i class="fas fa-external-link-alt"></i> Park4Night
                                </a>
                            ` : ''}
                        </div>
                    </div>
                `, {
                    maxWidth: 350,
                    className: 'campsite-popup-container'
                })
                .on('click', () => {
                    if (this.onCampsiteMarkerClick) {
                        this.onCampsiteMarkerClick(index);
                    }
                });

            this.campsiteMarkers.push(marker);
        });
    }

    selectCampsite(index) {
        if (index < 0 || index >= this.campsiteMarkers.length) return;

        this.selectedCampsiteIndex = index;
        const marker = this.campsiteMarkers[index];

        // Open popup and center map
        marker.openPopup();
    }

    deselectCampsite() {
        this.selectedCampsiteIndex = null;
    }

    setCampsiteMarkerClickCallback(callback) {
        this.onCampsiteMarkerClick = callback;
    }

    /**
     * Build modern popup content for a place with Google Places data support
     * @param {Object} place - Place object with coords, name, categories, countries, and optional googleData
     * @param {number|null} index - Place index in route (null for non-route places)
     * @param {boolean} isNonRoute - Whether this is a non-route place
     * @returns {string} HTML content for popup
     */
    buildPlacePopupContent(place, index = null, isNonRoute = false) {
        const lat = place.coords ? place.coords[0] : place.latitude;
        const lng = place.coords ? place.coords[1] : place.longitude;

        // Build image carousel if Google Photos are available
        const imageGallery = place.googleData?.photos && place.googleData.photos.length > 0
            ? `<div class="popup-image-carousel">
                   <div class="carousel-container" id="place-carousel-${place.id || index}">
                       ${place.googleData.photos.slice(0, 5).map((photo, idx) => `
                           <img src="${photo.photoUrl}"
                                alt="${place.name} photo ${idx + 1}"
                                class="carousel-image ${idx === 0 ? 'active' : ''}"
                                data-index="${idx}">
                       `).join('')}
                   </div>
                   ${place.googleData.photos.length > 1
                       ? `<button class="carousel-btn prev" onclick="event.stopPropagation(); navigateCarousel('place-carousel-${place.id || index}', -1)">
                              <i class="fas fa-chevron-left"></i>
                          </button>
                          <button class="carousel-btn next" onclick="event.stopPropagation(); navigateCarousel('place-carousel-${place.id || index}', 1)">
                              <i class="fas fa-chevron-right"></i>
                          </button>
                          <div class="carousel-indicators">
                              ${place.googleData.photos.slice(0, 5).map((_, idx) => `
                                  <span class="indicator ${idx === 0 ? 'active' : ''}"
                                        onclick="event.stopPropagation(); goToSlide('place-carousel-${place.id || index}', ${idx})"></span>
                              `).join('')}
                          </div>`
                       : ''
                   }
               </div>`
            : '';

        // Categories badges
        const categories = place.categories && place.categories.length > 0
            ? place.categories.map(c => `<span class="category-badge">${c.icon || '📍'} ${c.name}</span>`).join('')
            : '';

        // Countries badges
        const countries = place.countries && place.countries.length > 0
            ? place.countries.map(c => `<span class="country-badge">${c.icon || '🌍'} ${c.name}</span>`).join('')
            : '';

        // Rating display
        const ratingDisplay = place.googleData?.rating
            ? `<div class="popup-rating">
                   <span class="rating-stars">⭐</span>
                   <strong>${place.googleData.rating.toFixed(1)}</strong>
                   ${place.googleData.userRatingsTotal
                       ? `<span class="rating-count">(${place.googleData.userRatingsTotal} reviews)</span>`
                       : ''
                   }
               </div>`
            : '';

        // Price level display
        const priceDisplay = place.googleData?.priceLevel
            ? `<div class="popup-price">
                   <span class="price-symbols">${'$'.repeat(place.googleData.priceLevel)}</span>
                   <span class="price-label">Price level</span>
               </div>`
            : '';

        // Address display
        const addressDisplay = place.googleData?.formattedAddress
            ? `<div class="popup-address">
                   <i class="fas fa-map-marker-alt"></i>
                   <span>${place.googleData.formattedAddress}</span>
               </div>`
            : '';

        // Contact information
        const contactInfo = [];

        if (place.googleData?.phoneNumber) {
            contactInfo.push(`
                <a href="tel:${place.googleData.phoneNumber}" class="popup-contact-item" onclick="event.stopPropagation()">
                    <i class="fas fa-phone"></i> ${place.googleData.phoneNumber}
                </a>
            `);
        }

        if (place.googleData?.website) {
            contactInfo.push(`
                <a href="${place.googleData.website}" target="_blank" class="popup-contact-item" onclick="event.stopPropagation()">
                    <i class="fas fa-globe"></i> Website
                </a>
            `);
        }

        const contactSection = contactInfo.length > 0
            ? `<div class="popup-contact-section">${contactInfo.join('')}</div>`
            : '';

        // Opening hours
        let openingHoursSection = '';
        if (place.googleData?.openingHours) {
            try {
                const hours = typeof place.googleData.openingHours === 'string'
                    ? JSON.parse(place.googleData.openingHours)
                    : place.googleData.openingHours;

                if (hours.weekday_text && hours.weekday_text.length > 0) {
                    openingHoursSection = `
                        <div class="popup-hours-section">
                            <div class="popup-section-title">
                                <i class="fas fa-clock"></i> Opening Hours
                            </div>
                            <div class="popup-hours-list">
                                ${hours.weekday_text.slice(0, 7).map(day =>
                                    `<div class="hours-day">${day}</div>`
                                ).join('')}
                            </div>
                        </div>
                    `;
                }
            } catch (e) {
                console.warn('Failed to parse opening hours:', e);
            }
        }

        // Business status badge
        const statusBadge = place.googleData?.businessStatus === 'OPERATIONAL'
            ? '<span class="status-badge operational"><i class="fas fa-check-circle"></i> Open</span>'
            : place.googleData?.businessStatus === 'CLOSED_TEMPORARILY'
            ? '<span class="status-badge closed-temp"><i class="fas fa-exclamation-circle"></i> Temporarily Closed</span>'
            : place.googleData?.businessStatus === 'CLOSED_PERMANENTLY'
            ? '<span class="status-badge closed-perm"><i class="fas fa-times-circle"></i> Permanently Closed</span>'
            : '';

        // Build action buttons based on place type
        let actionButtons = '';
        if (isNonRoute) {
            // Non-route place actions
            actionButtons = `
                <div class="map-popup-actions">
                    <button class="popup-action-btn add-to-route-btn" onclick="event.stopPropagation(); window.app.showAddPlacePositionModal(${place.id}, '${place.name.replace(/'/g, "\\'")}')" title="Add to route">
                        <i class="fas fa-plus"></i> Add to Route
                    </button>
                    <button class="popup-action-btn edit-btn" onclick="event.stopPropagation(); window.app.editNonRoutePlace(${place.id})" title="Edit place">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="popup-action-btn delete-btn" onclick="event.stopPropagation(); window.app.deleteNonRoutePlace(${place.id}, '${place.name.replace(/'/g, "\\'")}')" title="Delete place">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
        } else if (index !== null) {
            // Route place actions
            actionButtons = `
                <div class="map-popup-actions">
                    <button class="route-popup-action-btn edit-btn" onclick="event.stopPropagation(); window.app?.placeManager?.showRenamePlaceModal(${index})" title="Edit place">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="route-popup-action-btn delete-btn" onclick="event.stopPropagation(); window.app?.placeManager?.removePlace(${index})" title="Remove from route">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
        }

        // External links (Google Maps, Navigation)
        const externalLinks = `
            <div class="map-popup-links">
                <a href="https://www.google.com/maps/search/?api=1&query=${lat},${lng}"
                   target="_blank"
                   class="link-btn google-maps"
                   onclick="event.stopPropagation()">
                    <i class="fas fa-map"></i> Google Maps
                </a>
                <a href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}"
                   target="_blank"
                   class="link-btn google-nav"
                   onclick="event.stopPropagation()">
                    <i class="fas fa-directions"></i> Navigate
                </a>
            </div>
        `;

        // Google Places badge
        const googleBadge = place.googleData
            ? '<span class="google-place-badge"><i class="fab fa-google"></i> Google Place</span>'
            : '';

        // Assemble the complete popup
        return `
            <div class="map-popup-content place-popup ${place.googleData ? 'has-google-data' : ''}">
                ${imageGallery}
                <div class="map-popup-header">
                    ${index !== null ? `<div class="place-number">${index + 1}</div>` : ''}
                    <div class="header-content">
                        <strong>${place.name}</strong>
                        ${statusBadge}
                        ${googleBadge}
                        ${isNonRoute ? '<span class="non-route-badge">Not in Route</span>' : ''}
                    </div>
                </div>
                ${ratingDisplay || priceDisplay ? `
                    <div class="popup-quick-info">
                        ${ratingDisplay}
                        ${priceDisplay}
                    </div>
                ` : ''}
                ${addressDisplay}
                ${categories ? `<div class="map-popup-categories">${categories}</div>` : ''}
                ${countries ? `<div class="map-popup-countries">${countries}</div>` : ''}
                ${contactSection}
                ${openingHoursSection}
                <div class="map-popup-coords">
                    <i class="fas fa-map-pin"></i> ${lat.toFixed(6)}, ${lng.toFixed(6)}
                </div>
                ${actionButtons}
                ${externalLinks}
            </div>
        `;
    }

    /**
     * Update map with filtered places (for category/country filtering)
     * This creates separate markers for all places with visual indicators
     */
    updateFilteredPlaces(filteredPlaces) {
        // Clear existing markers but keep campsites
        this.markers.forEach(marker => this.map.removeLayer(marker));
        this.markers = [];

        // Clear existing route
        if (this.routePolyline) {
            this.map.removeLayer(this.routePolyline);
        }

        if (filteredPlaces.length === 0) return;

        // Add markers for filtered places
        filteredPlaces.forEach((place, index) => {
            const isSelected = this.selectedMarkerIndex === index;

            // Get category icon if available
            const categoryIcon = place.categories && place.categories.length > 0
                ? place.categories[0].icon
                : null;

            // Create custom marker with category icon
            const iconSize = isSelected ? [35, 50] : [25, 41];
            const iconAnchor = isSelected ? [17, 50] : [12, 41];

            let marker;

            // If there's a category icon, create a custom divIcon with emoji
            if (categoryIcon) {
                const divIcon = L.divIcon({
                    html: `<div class="custom-marker ${isSelected ? 'selected' : ''}">
                            <div class="marker-icon">${categoryIcon}</div>
                           </div>`,
                    className: 'custom-marker-container',
                    iconSize: [30, 30],
                    iconAnchor: [15, 30],
                    popupAnchor: [0, -30]
                });

                marker = L.marker([place.latitude, place.longitude], { icon: divIcon });
            } else {
                // Use default Leaflet marker
                const customIcon = L.icon({
                    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
                    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
                    iconSize: iconSize,
                    iconAnchor: iconAnchor,
                    popupAnchor: [1, -34],
                    shadowSize: isSelected ? [50, 50] : [41, 41]
                });

                marker = L.marker([place.latitude, place.longitude], { icon: customIcon });
            }

            // Create popup content using helper method
            const popupContent = this.buildPlacePopupContent(place, null, false);

            marker.addTo(this.map)
                .bindPopup(popupContent, {
                    maxWidth: 350,
                    className: 'place-popup-container'
                });

            this.markers.push(marker);
        });

        // Center map to show all filtered places
        if (filteredPlaces.length > 0) {
            const bounds = L.latLngBounds(
                filteredPlaces.map(place => [place.latitude, place.longitude])
            );
            this.map.fitBounds(bounds, { padding: [50, 50] });
        }
    }

    /**
     * Update map with both route places (blue markers with polyline) and non-route places (gray markers)
     * @param {Array} routePlaces - Places in the current route
     * @param {Array} nonRoutePlaces - Places not in the current route
     */
    updateMapWithBothPlaceTypes(routePlaces, nonRoutePlaces) {
        // Clear existing markers (route places)
        this.markers.forEach(marker => this.map.removeLayer(marker));
        this.markers = [];

        // Clear existing non-route markers
        this.nonRouteMarkers.forEach(marker => this.map.removeLayer(marker));
        this.nonRouteMarkers = [];

        // Clear existing route polyline
        if (this.routePolyline) {
            this.map.removeLayer(this.routePolyline);
        }

        // Add blue markers for route places (with numbers and polyline)
        if (routePlaces && routePlaces.length > 0) {
            routePlaces.forEach((place, index) => {
                const isSelected = this.selectedMarkerIndex === index;

                // Create custom icon with size based on selection
                const iconSize = isSelected ? [35, 50] : [25, 41];
                const iconAnchor = isSelected ? [17, 50] : [12, 41];

                const customIcon = L.icon({
                    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
                    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
                    iconSize: iconSize,
                    iconAnchor: iconAnchor,
                    popupAnchor: [1, -34],
                    shadowSize: isSelected ? [50, 50] : [41, 41]
                });

                // Create popup content using helper method
                const popupContent = this.buildPlacePopupContent(place, index, false);

                const marker = L.marker(place.coords, { icon: customIcon })
                    .addTo(this.map)
                    .bindPopup(popupContent, {
                        maxWidth: 350,
                        className: 'place-popup-container'
                    })
                    .on('click', () => {
                        if (this.onMarkerClick) {
                            this.onMarkerClick(index);
                        }
                    });
                this.markers.push(marker);
            });

            // Add route polyline if enabled
            if (this.showRoute && routePlaces.length > 1) {
                const coords = routePlaces.map(place => place.coords);
                this.routePolyline = L.polyline(coords, {
                    color: '#667eea',
                    weight: 4,
                    opacity: 0.7,
                    smoothFactor: 1
                }).addTo(this.map);
            }
        }

        // Add gray markers for non-route places (no numbers, no polyline)
        if (nonRoutePlaces && nonRoutePlaces.length > 0) {
            nonRoutePlaces.forEach((place, index) => {
                // Create gray custom icon
                const grayIcon = L.icon({
                    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
                    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
                    iconSize: [20, 33],
                    iconAnchor: [10, 33],
                    popupAnchor: [1, -28],
                    shadowSize: [33, 33],
                    className: 'non-route-marker'
                });

                // Create popup content using helper method
                const popupContent = this.buildPlacePopupContent(place, null, true);

                const marker = L.marker([place.latitude, place.longitude], { icon: grayIcon })
                    .addTo(this.map)
                    .bindPopup(popupContent, {
                        maxWidth: 350,
                        className: 'place-popup-container non-route-popup-container'
                    })
                    .on('click', () => {
                        if (this.onNonRouteMarkerClick) {
                            this.onNonRouteMarkerClick(place.id, index);
                        }
                    });

                this.nonRouteMarkers.push(marker);
            });
        }
    }
}

// Carousel navigation functions
window.navigateCarousel = function(carouselId, direction) {
    const container = document.getElementById(carouselId);
    if (!container) return;

    const images = container.querySelectorAll('.carousel-image');
    const indicators = container.parentElement.querySelectorAll('.indicator');

    let currentIndex = 0;
    images.forEach((img, idx) => {
        if (img.classList.contains('active')) {
            currentIndex = idx;
        }
    });

    // Calculate new index
    let newIndex = currentIndex + direction;
    if (newIndex < 0) newIndex = images.length - 1;
    if (newIndex >= images.length) newIndex = 0;

    // Update active states
    images[currentIndex].classList.remove('active');
    images[newIndex].classList.add('active');

    if (indicators.length > 0) {
        indicators[currentIndex].classList.remove('active');
        indicators[newIndex].classList.add('active');
    }
};

window.goToSlide = function(carouselId, index) {
    const container = document.getElementById(carouselId);
    if (!container) return;

    const images = container.querySelectorAll('.carousel-image');
    const indicators = container.parentElement.querySelectorAll('.indicator');

    // Remove all active states
    images.forEach(img => img.classList.remove('active'));
    indicators.forEach(ind => ind.classList.remove('active'));

    // Set new active state
    if (images[index]) images[index].classList.add('active');
    if (indicators[index]) indicators[index].classList.add('active');
};