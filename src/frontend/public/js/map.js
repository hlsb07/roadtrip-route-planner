import { CONFIG } from './config.js';
import { ApiService } from './api.js';

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
        this.selectedAllPlaceIndex = null; // For All Places view selection
        this.selectedCampsiteIndex = null;
        this.onMarkerClick = null;
        this.onNonRouteMarkerClick = null; // Callback for non-route/filtered place marker clicks (used for gray markers and All Places view)
        this.onCampsiteMarkerClick = null;
        this.coordinateSelectionMode = false;
        this.coordinateSelectionCallback = null;
        this.coordinatePreviewMarker = null;
        this.currentMobilePopupData = null; // Store current popup data for "View Details" button
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

            const marker = L.marker(place.coords, { icon: customIcon })
                .addTo(this.map);

            // Setup popup with lazy loading for Google data
            this.setupPlacePopup(marker, place, index, false);

            marker.on('click', () => {
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

            // Build campsite popup content
            const campsitePopupContent = `
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
                           class="link-btn google-maps"
                           onclick="event.stopPropagation()">
                            <i class="fas fa-map"></i> Google Maps
                        </a>
                        ${campsite.sourceUrl ? `
                            <a href="${campsite.sourceUrl}"
                               target="_blank"
                               class="link-btn"
                               style="background: #3EBBA5; color: white;"
                               onclick="event.stopPropagation()">
                                <i class="fas fa-external-link-alt"></i> Park4Night
                            </a>
                        ` : ''}
                    </div>
                </div>
            `;

            const marker = L.marker([campsite.latitude, campsite.longitude], { icon: customIcon })
                .addTo(this.map);

            // On mobile, use docked popup; on desktop, use Leaflet popup
            if (this.isMobileView()) {
                marker.on('click', () => {
                    this.showMobileDockedPopup(campsitePopupContent, campsite.id, { campsite, index });
                    if (this.onCampsiteMarkerClick) {
                        this.onCampsiteMarkerClick(index);
                    }
                });
            } else {
                marker.bindPopup(campsitePopupContent, {
                    maxWidth: 350,
                    className: 'campsite-popup-container'
                })
                .on('click', () => {
                    if (this.onCampsiteMarkerClick) {
                        this.onCampsiteMarkerClick(index);
                    }
                });
            }

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

    selectAllPlace(index) {
        if (index < 0 || index >= this.markers.length) return;

        this.selectedAllPlaceIndex = index;
        const marker = this.markers[index];

        // Open popup
        marker.openPopup();
    }

    deselectAllPlace() {
        this.selectedAllPlaceIndex = null;
    }

    /**
     * Setup popup for a place marker with lazy loading of Google data
     * @param {L.Marker} marker - Leaflet marker instance
     * @param {Object} place - Place object
     * @param {number|null} index - Place index in route (null for non-route places)
     * @param {boolean} isNonRoute - Whether this is a non-route place
     */
    setupPlacePopup(marker, place, index = null, isNonRoute = false) {
        // On mobile, use docked popup instead of Leaflet popup
        if (this.isMobileView()) {
            marker.on('click', async () => {
                // Build mobile popup content
                let mobileContent = this.buildPlacePopupContent(place, index, isNonRoute, true);

                // If place has Google data, try to load it
                if (place.hasGoogleData && place.id) {
                    try {
                        const enrichedPlace = await ApiService.getEnrichedPlace(place.id);
                        if (enrichedPlace && enrichedPlace.googleData) {
                            const enrichedPlaceWithCoords = {
                                ...place,
                                googleData: enrichedPlace.googleData
                            };
                            mobileContent = this.buildPlacePopupContent(enrichedPlaceWithCoords, index, isNonRoute, true);
                        }
                    } catch (error) {
                        console.warn('Failed to load Google data for mobile popup:', error);
                    }
                }

                // Show docked popup
                this.showMobileDockedPopup(mobileContent, place.id, { place, index, isNonRoute });
            });
            return; // Skip Leaflet popup setup on mobile
        }

        // Desktop: Use Leaflet popup
        const initialContent = this.buildPlacePopupContent(place, index, isNonRoute);

        const popup = L.popup({
            maxWidth: 350,
            className: 'place-popup-container'
        }).setContent(initialContent);

        marker.bindPopup(popup);

        // If place has Google data, lazy load it when popup opens
        if (place.hasGoogleData && place.id) {
            let isLoading = false;
            let googleDataCache = null;

            marker.on('popupopen', async () => {
                // If already loaded, use cached data
                if (googleDataCache) {
                    const enrichedPlaceWithCoords = {
                        ...place,
                        googleData: googleDataCache
                    };
                    const enrichedContent = this.buildPlacePopupContent(enrichedPlaceWithCoords, index, isNonRoute);
                    popup.setContent(enrichedContent);
                    return;
                }

                // If already loading, don't trigger again
                if (isLoading) return;

                isLoading = true;

                // Add loading indicator
                const loadingContent = initialContent.replace(
                    '</div>',
                    '<div class="google-data-loading"><i class="fas fa-spinner fa-spin"></i> Loading Google Places info...</div></div>'
                );
                popup.setContent(loadingContent);

                try {
                    // Fetch enriched place data with Google info
                    const enrichedPlace = await ApiService.getEnrichedPlace(place.id);

                    if (enrichedPlace && enrichedPlace.googleData) {
                        // Cache the Google data
                        googleDataCache = enrichedPlace.googleData;

                        // Merge Google data into place object
                        const enrichedPlaceWithCoords = {
                            ...place,
                            googleData: googleDataCache
                        };

                        // Update popup content with Google data
                        const enrichedContent = this.buildPlacePopupContent(enrichedPlaceWithCoords, index, isNonRoute);
                        popup.setContent(enrichedContent);
                    }
                } catch (error) {
                    console.error('Failed to load Google data for place:', error);
                    // Show error message
                    const errorContent = initialContent.replace(
                        '</div>',
                        '<div class="google-data-error"><i class="fas fa-exclamation-triangle"></i> Failed to load Google Places info</div></div>'
                    );
                    popup.setContent(errorContent);
                } finally {
                    isLoading = false;
                }
            });
        }
    }

    /**
     * Build modern popup content for a place with Google Places data support
     * @param {Object} place - Place object with coords, name, categories, countries, and optional googleData
     * @param {number|null} index - Place index in route (null for non-route places)
     * @param {boolean} isNonRoute - Whether this is a non-route place
     * @returns {string} HTML content for popup
     */
    buildPlacePopupContent(place, index = null, isNonRoute = false, isMobile = false) {
        const lat = place.coords ? place.coords[0] : place.latitude;
        const lng = place.coords ? place.coords[1] : place.longitude;

        // Mobile version - simplified content for docked popup
        if (isMobile) {
            return this.buildMobilePlacePopupContent(place, index, isNonRoute, lat, lng);
        }

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
     * Build simplified mobile popup content for docked popup
     * Compact design: Image + Name + Number + Buttons only (no scrolling)
     */
    buildMobilePlacePopupContent(place, index, isNonRoute, lat, lng) {
        // Compact carousel (100px height, clickable for fullscreen)
        const photos = place.googleData?.photos || [];
        const imageCarousel = photos.length > 0
            ? `<div class="popup-image-carousel" onclick="window.mapService?. Image + Name + Number + Buttons?(${JSON.stringify(photos).replace(/"/g, '&quot;')}, 0)">
                   <div class="carousel-container" id="mobile-carousel-${place.id || index}">
                       ${photos.slice(0, 3).map((photo, idx) => `
                           <img src="${photo.photoUrl}"
                                alt="${place.name}"
                                class="carousel-image ${idx === 0 ? 'active' : ''}"
                                data-index="${idx}">
                       `).join('')}
                   </div>
                   ${photos.length > 1
                       ? `<button class="carousel-btn prev" onclick="event.stopPropagation(); navigateCarousel('mobile-carousel-${place.id || index}', -1)">
                              <i class="fas fa-chevron-left"></i>
                          </button>
                          <button class="carousel-btn next" onclick="event.stopPropagation(); navigateCarousel('mobile-carousel-${place.id || index}', 1)">
                              <i class="fas fa-chevron-right"></i>
                          </button>`
                       : ''
                   }
               </div>`
            : '';

        // Place header with number and name
        const placeHeader = `
            <div class="mobile-popup-place-header">
                ${index !== null ? `<div class="mobile-popup-place-number">${index + 1}</div>` : ''}
                <div class="mobile-popup-place-info">
                    <h3 class="mobile-popup-place-name">${place.name}</h3>
                    <div class="mobile-popup-badges">
                        ${place.googleData ? '<span class="google-place-badge"><i class="fab fa-google"></i> Google</span>' : ''}
                    </div>
                </div>
            </div>
        `;

        // Stacked buttons (View Details + primary action)
        let buttons = '';
        if (isNonRoute) {
            // Non-route place
            buttons = `
                <div class="mobile-popup-buttons">
                    <button class="btn btn-primary" onclick="event.stopPropagation(); window.app?.openPlaceDetailsFromPopup()">
                        <i class="fas fa-info-circle"></i> View Details
                    </button>
                    <button class="btn btn-primary" onclick="event.stopPropagation(); window.app.showAddPlacePositionModal(${place.id}, '${place.name.replace(/'/g, "\\'")}')">
                        <i class="fas fa-plus"></i> Add to Route
                    </button>
                </div>
            `;
        } else if (index !== null) {
            // Route place
            buttons = `
                <div class="mobile-popup-buttons">
                    <button class="btn btn-primary" onclick="event.stopPropagation(); window.app?.openPlaceDetailsFromPopup()">
                        <i class="fas fa-info-circle"></i> View Details
                    </button>
                    <button class="btn btn-danger" onclick="event.stopPropagation(); window.app?.placeManager?.removePlace(${index})">
                        <i class="fas fa-minus-circle"></i> Remove from Route
                    </button>
                </div>
            `;
        }

        // Assemble compact mobile popup
        return `
            ${imageCarousel}
            ${placeHeader}
            ${buttons}
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
            const isSelected = this.selectedAllPlaceIndex === index;

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

            marker.addTo(this.map);

            // Setup popup with lazy loading for Google data
            this.setupPlacePopup(marker, place, null, false);

            // Add click handler
            marker.on('click', () => {
                if (this.onNonRouteMarkerClick) {
                    this.onNonRouteMarkerClick(place.id, index);
                }
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

                const marker = L.marker(place.coords, { icon: customIcon })
                    .addTo(this.map);

                // Setup popup with lazy loading for Google data
                this.setupPlacePopup(marker, place, index, false);

                marker.on('click', () => {
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

                const marker = L.marker([place.latitude, place.longitude], { icon: grayIcon })
                    .addTo(this.map);

                // Setup popup with lazy loading for Google data
                this.setupPlacePopup(marker, place, null, true);

                marker.on('click', () => {
                    if (this.onNonRouteMarkerClick) {
                        this.onNonRouteMarkerClick(place.id, index);
                    }
                });

                this.nonRouteMarkers.push(marker);
            });
        }
    }

    // ============================================
    // MOBILE DOCKED POPUP METHODS
    // ============================================

    isMobileView() {
        return window.innerWidth <= 768;
    }

    showMobileDockedPopup(content, placeId, placeData) {
        if (!this.isMobileView()) return;

        const popup = document.getElementById('mobileDockedPopup');
        const popupContent = document.getElementById('mobilePopupContent');

        if (!popup || !popupContent) return;

        // Store popup data for "View Details" button
        this.currentMobilePopupData = { placeId, placeData };

        // Close mobile panel if open
        const mobilePanel = document.querySelector('.mobile-content-panel');
        if (mobilePanel && mobilePanel.classList.contains('active')) {
            if (window.closeMobilePanel) {
                window.closeMobilePanel();
            }
        }

        // Set content and show popup
        popupContent.innerHTML = content;
        popup.classList.add('show');

        // Update position indicator (will be set by app.js when navigating)
        const positionEl = document.getElementById('mobilePopupPosition');
        if (positionEl && placeData) {
            // Try to determine position from context
            if (placeData.index !== null && placeData.index !== undefined) {
                // Route place
                const total = window.app?.placeManager?.places?.length || 0;
                positionEl.textContent = total > 0 ? `${placeData.index + 1} of ${total}` : '';
            } else {
                // All place - get from selected index
                const selectedIndex = window.app?.allPlacesManager?.selectedIndex;
                const total = window.app?.allPlacesManager?.filteredPlaces?.length || 0;
                if (selectedIndex !== null && total > 0) {
                    positionEl.textContent = `${selectedIndex + 1} of ${total}`;
                } else {
                    positionEl.textContent = '';
                }
            }
        }

        // Add click outside to close
        setTimeout(() => {
            document.addEventListener('click', this.handleMobilePopupOutsideClick.bind(this), { once: false });
        }, 100);
    }

    hideMobileDockedPopup() {
        const popup = document.getElementById('mobileDockedPopup');
        if (!popup) return;

        popup.classList.remove('show');
        this.currentMobilePopupData = null;

        // Remove click outside listener
        document.removeEventListener('click', this.handleMobilePopupOutsideClick.bind(this));
    }

    handleMobilePopupOutsideClick(e) {
        const popup = document.getElementById('mobileDockedPopup');
        if (!popup || !popup.classList.contains('show')) return;

        // Don't close if clicking inside the popup or on a marker
        if (popup.contains(e.target) ||
            e.target.closest('.leaflet-marker-icon') ||
            e.target.closest('.leaflet-popup')) {
            return;
        }

        // Close popup when clicking outside (on map)
        this.hideMobileDockedPopup();
    }

    getCurrentMobilePopupData() {
        return this.currentMobilePopupData;
    }

    // ============================================
    // FULLSCREEN IMAGE GALLERY
    // ============================================

    showFullscreenImageGallery(photos, startIndex = 0) {
        if (!photos || photos.length === 0) return;

        const gallery = document.getElementById('fullscreenImageGallery');
        const galleryImages = document.getElementById('galleryImages');
        const galleryCounter = document.getElementById('galleryCounter');
        const prevBtn = document.getElementById('galleryPrev');
        const nextBtn = document.getElementById('galleryNext');

        if (!gallery || !galleryImages) return;

        this.galleryPhotos = photos;
        this.currentGalleryIndex = startIndex;

        // Build gallery images
        galleryImages.innerHTML = photos.map((photo, idx) => `
            <div class="gallery-image ${idx === startIndex ? 'active' : ''}" data-index="${idx}">
                <img src="${photo.photoUrl}" alt="Image ${idx + 1}">
            </div>
        `).join('');

        // Update counter
        if (galleryCounter) {
            galleryCounter.textContent = `${startIndex + 1} / ${photos.length}`;
        }

        // Setup navigation
        this.updateGalleryButtons();

        if (prevBtn) {
            prevBtn.onclick = () => this.navigateGallery(-1);
        }

        if (nextBtn) {
            nextBtn.onclick = () => this.navigateGallery(1);
        }

        // Setup swipe for gallery
        this.setupGallerySwipe();

        // Show gallery
        gallery.classList.add('show');

        // Prevent body scroll
        document.body.style.overflow = 'hidden';
    }

    hideFullscreenImageGallery() {
        const gallery = document.getElementById('fullscreenImageGallery');
        if (!gallery) return;

        gallery.classList.remove('show');

        // Restore body scroll
        document.body.style.overflow = '';

        // Clean up
        this.galleryPhotos = null;
        this.currentGalleryIndex = 0;
    }

    navigateGallery(direction) {
        if (!this.galleryPhotos) return;

        const newIndex = this.currentGalleryIndex + direction;

        if (newIndex < 0 || newIndex >= this.galleryPhotos.length) return;

        const images = document.querySelectorAll('.gallery-image');
        images[this.currentGalleryIndex]?.classList.remove('active');
        images[newIndex]?.classList.add('active');

        this.currentGalleryIndex = newIndex;

        // Update counter
        const galleryCounter = document.getElementById('galleryCounter');
        if (galleryCounter) {
            galleryCounter.textContent = `${newIndex + 1} / ${this.galleryPhotos.length}`;
        }

        this.updateGalleryButtons();
    }

    updateGalleryButtons() {
        const prevBtn = document.getElementById('galleryPrev');
        const nextBtn = document.getElementById('galleryNext');

        if (prevBtn) {
            prevBtn.disabled = this.currentGalleryIndex === 0;
        }

        if (nextBtn) {
            nextBtn.disabled = this.currentGalleryIndex === this.galleryPhotos.length - 1;
        }
    }

    setupGallerySwipe() {
        const gallery = document.getElementById('fullscreenImageGallery');
        if (!gallery) return;

        let startX = 0;
        let startY = 0;

        gallery.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        }, { passive: true });

        gallery.addEventListener('touchend', (e) => {
            const endX = e.changedTouches[0].clientX;
            const endY = e.changedTouches[0].clientY;

            const diffX = startX - endX;
            const diffY = startY - endY;

            // Horizontal swipe (min 50px)
            if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
                if (diffX > 0) {
                    // Swipe left - next image
                    this.navigateGallery(1);
                } else {
                    // Swipe right - previous image
                    this.navigateGallery(-1);
                }
            }
        }, { passive: true });
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