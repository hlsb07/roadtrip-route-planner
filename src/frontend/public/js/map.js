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

            // Create popup content with categories and countries
            const categories = place.categories && place.categories.length > 0
                ? place.categories.map(c => `<span class="category-badge">${c.icon || '📍'} ${c.name}</span>`).join('')
                : '';

            const countries = place.countries && place.countries.length > 0
                ? place.countries.map(c => `<span class="country-badge">${c.icon || '🌍'} ${c.name}</span>`).join('')
                : '';

            const marker = L.marker(place.coords, { icon: customIcon })
                .addTo(this.map)
                .bindPopup(`
                    <div class="map-popup-content">
                        <div class="map-popup-header">
                            <div class="place-number">${index + 1}</div>
                            <strong>${place.name}</strong>
                        </div>
                        ${categories ? `<div class="map-popup-categories">${categories}</div>` : ''}
                        ${countries ? `<div class="map-popup-countries">${countries}</div>` : ''}
                        <div class="map-popup-coords">Lat: ${place.coords[0].toFixed(4)}, Lng: ${place.coords[1].toFixed(4)}</div>
                        <div class="map-popup-actions">
                            <button class="route-popup-action-btn edit-btn" onclick="event.stopPropagation(); window.app?.placeManager?.showRenamePlaceModal(${index})" title="Edit place">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="route-popup-action-btn delete-btn" onclick="event.stopPropagation(); window.app?.placeManager?.removePlace(${index})" title="Remove from route">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                        <div class="map-popup-links">
                            <a href="https://www.google.com/maps/search/?api=1&query=${place.coords[0]},${place.coords[1]}"
                               target="_blank"
                               class="link-btn google-maps">
                                <i class="fas fa-map"></i> Google Maps
                            </a>
                            <a href="https://www.google.com/maps/dir/?api=1&destination=${place.coords[0]},${place.coords[1]}"
                               target="_blank"
                               class="link-btn google-nav">
                                <i class="fas fa-directions"></i> Navigate
                            </a>
                        </div>
                    </div>
                `)
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

            // Create popup content
            const categories = place.categories && place.categories.length > 0
                ? place.categories.map(c => `<span class="category-badge">${c.icon || '📍'} ${c.name}</span>`).join('')
                : '';

            const countries = place.countries && place.countries.length > 0
                ? place.countries.map(c => `<span class="country-badge">${c.icon || '🌍'} ${c.name}</span>`).join('')
                : '';

            marker.addTo(this.map)
                .bindPopup(`
                    <div class="map-popup-content">
                        <div class="map-popup-header">
                            <strong>${place.name}</strong>
                        </div>
                        ${categories ? `<div class="map-popup-categories">${categories}</div>` : ''}
                        ${countries ? `<div class="map-popup-countries">${countries}</div>` : ''}
                        <div class="map-popup-coords">Lat: ${place.latitude.toFixed(4)}, Lng: ${place.longitude.toFixed(4)}</div>
                        <div class="map-popup-links">
                            <a href="https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}"
                               target="_blank"
                               class="link-btn google-maps">
                                <i class="fas fa-map"></i> Google Maps
                            </a>
                            <a href="https://www.google.com/maps/dir/?api=1&destination=${place.latitude},${place.longitude}"
                               target="_blank"
                               class="link-btn google-nav">
                                <i class="fas fa-directions"></i> Navigate
                            </a>
                        </div>
                    </div>
                `);

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

                // Create popup content with categories and countries
                const categories = place.categories && place.categories.length > 0
                    ? place.categories.map(c => `<span class="category-badge">${c.icon || '📍'} ${c.name}</span>`).join('')
                    : '';

                const countries = place.countries && place.countries.length > 0
                    ? place.countries.map(c => `<span class="country-badge">${c.icon || '🌍'} ${c.name}</span>`).join('')
                    : '';

                const marker = L.marker(place.coords, { icon: customIcon })
                    .addTo(this.map)
                    .bindPopup(`
                        <div class="map-popup-content">
                            <div class="map-popup-header">
                                <div class="place-number">${index + 1}</div>
                                <strong>${place.name}</strong>
                            </div>
                            ${categories ? `<div class="map-popup-categories">${categories}</div>` : ''}
                            ${countries ? `<div class="map-popup-countries">${countries}</div>` : ''}
                            <div class="map-popup-coords">Lat: ${place.coords[0].toFixed(4)}, Lng: ${place.coords[1].toFixed(4)}</div>
                            <div class="map-popup-actions">
                                <button class="route-popup-action-btn edit-btn" onclick="event.stopPropagation(); window.app?.placeManager?.showRenamePlaceModal(${index})" title="Edit place">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="route-popup-action-btn delete-btn" onclick="event.stopPropagation(); window.app?.placeManager?.removePlace(${index})" title="Remove from route">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                            <div class="map-popup-links">
                                <a href="https://www.google.com/maps/search/?api=1&query=${place.coords[0]},${place.coords[1]}"
                                   target="_blank"
                                   class="link-btn google-maps">
                                    <i class="fas fa-map"></i> Google Maps
                                </a>
                                <a href="https://www.google.com/maps/dir/?api=1&destination=${place.coords[0]},${place.coords[1]}"
                                   target="_blank"
                                   class="link-btn google-nav">
                                    <i class="fas fa-directions"></i> Navigate
                                </a>
                            </div>
                        </div>
                    `)
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

                // Get category and country badges
                const categories = place.categories && place.categories.length > 0
                    ? place.categories.map(c => `<span class="category-badge">${c.icon || '📍'} ${c.name}</span>`).join('')
                    : '';

                const countries = place.countries && place.countries.length > 0
                    ? place.countries.map(c => `<span class="country-badge">${c.icon || '🌍'} ${c.name}</span>`).join('')
                    : '';

                const marker = L.marker([place.latitude, place.longitude], { icon: grayIcon })
                    .addTo(this.map)
                    .bindPopup(`
                        <div class="map-popup-content non-route-popup">
                            <div class="map-popup-header">
                                <strong>${place.name}</strong>
                                <span class="non-route-badge">Not in Route</span>
                            </div>
                            ${categories ? `<div class="map-popup-categories">${categories}</div>` : ''}
                            ${countries ? `<div class="map-popup-countries">${countries}</div>` : ''}
                            <div class="map-popup-coords">Lat: ${place.latitude.toFixed(4)}, Lng: ${place.longitude.toFixed(4)}</div>
                            <div class="map-popup-actions">
                                <button class="popup-action-btn add-to-route-btn" onclick="event.stopPropagation(); window.app.showAddPlacePositionModal(${place.id}, '${place.name.replace(/'/g, "\\'")}')">
                                    <i class="fas fa-plus"></i> Add to Route
                                </button>
                                <button class="popup-action-btn edit-btn" onclick="event.stopPropagation(); window.app.editNonRoutePlace(${place.id})">
                                    <i class="fas fa-edit"></i> Edit
                                </button>
                                <button class="popup-action-btn delete-btn" onclick="event.stopPropagation(); window.app.deleteNonRoutePlace(${place.id}, '${place.name.replace(/'/g, "\\'")}')">
                                    <i class="fas fa-trash"></i> Delete
                                </button>
                            </div>
                            <div class="map-popup-links">
                                <a href="https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}"
                                   target="_blank"
                                   class="link-btn google-maps">
                                    <i class="fas fa-map"></i> Google Maps
                                </a>
                                <a href="https://www.google.com/maps/dir/?api=1&destination=${place.latitude},${place.longitude}"
                                   target="_blank"
                                   class="link-btn google-nav">
                                    <i class="fas fa-directions"></i> Navigate
                                </a>
                            </div>
                        </div>
                    `)
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