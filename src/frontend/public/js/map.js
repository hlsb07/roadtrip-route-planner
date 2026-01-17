import { CONFIG } from './config.js';
import { ApiService } from './api.js';

export class MapService {
    constructor() {
        this.map = null;
        this.markers = [];
        this.nonRouteMarkers = []; // Gray markers for places not in route
        this.campsiteMarkers = [];
        this.routingControl = null; // Leaflet Routing Machine control
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
        this.currentPopupPhotos = null; // Store photos for fullscreen gallery
        this.galleryPhotos = null; // Current photos in fullscreen gallery
        this.currentGalleryIndex = 0; // Current image index in gallery
        this.routeDistance = 0; // Total route distance in meters
        this.routeDuration = 0; // Total route duration in seconds
        this.onRouteCalculated = null; // Callback when route is calculated
        this.routeSegments = []; // Array to store individual segment data
        this.segmentPolylines = []; // Array of polyline objects for each segment
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

    updateMap(places, routeLegs = null) {
        // Clear existing markers
        this.markers.forEach(marker => this.map.removeLayer(marker));
        this.markers = [];

        // Clear existing routing control
        if (this.routingControl) {
            this.map.removeControl(this.routingControl);
            this.routingControl = null;
        }

        if (places.length === 0) return;

        // Add markers
        places.forEach((place, index) => {
            const isSelected = this.selectedMarkerIndex === index;

            // Create custom numbered icon
            const customIcon = L.divIcon({
                html: `<div class="route-marker-numbered ${isSelected ? 'selected' : ''}">
                        <div class="marker-number">${index + 1}</div>
                       </div>`,
                className: 'route-marker-container',
                iconSize: isSelected ? [40, 40] : [32, 32],
                iconAnchor: isSelected ? [20, 20] : [16, 16],
                popupAnchor: [0, -20]
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

        // Add routing if enabled and we have at least 2 places
        if (this.showRoute && places.length > 1) {
            if (routeLegs && routeLegs.length > 0 && routeLegs[0].geometryCoordinates) {
                // Use stored geometry from database
                console.log('Rendering route from stored geometry (no OSRM call)');
                this.renderRouteFromGeometry(places, routeLegs);
            } else {
                // Fall back to OSRM when geometry not available
                console.log('Geometry not available, calling OSRM');
                this.renderRouteWithOSRM(places);
            }
        } else {
            // Hide route info panel if routing is disabled
            const panel = document.getElementById('routeInfoPanel');
            if (panel) panel.style.display = 'none';
        }
    }

    /**
     * Render route using stored geometry from database (no OSRM call)
     * @param {Array} places - Array of place objects with coords property
     * @param {Array} legs - Array of route leg objects with geometryCoordinates
     */
    renderRouteFromGeometry(places, legs) {
        console.log('Rendering route from stored geometry (no OSRM call)');

        // Clear existing routing
        if (this.routingControl) {
            this.map.removeControl(this.routingControl);
            this.routingControl = null;
        }
        this.clearSegmentPolylines();

        // Validate we have geometry data
        if (!legs || legs.length === 0 || !legs[0].geometryCoordinates || legs[0].geometryCoordinates.length === 0) {
            console.warn('No geometry available, falling back to OSRM');
            this.renderRouteWithOSRM(places);
            return;
        }

        // Render each leg as a polyline using stored geometry
        let totalDistance = 0;
        let totalDuration = 0;

        for (let i = 0; i < legs.length; i++) {
            const leg = legs[i];
            const startPlace = places[i];
            const endPlace = places[i + 1];

            // Convert [[lon, lat], ...] to [[lat, lon], ...] for Leaflet
            const coords = leg.geometryCoordinates.map(c => [c[1], c[0]]);

            // Create polyline for this leg
            const polyline = L.polyline(coords, {
                color: '#0E54F9',
                weight: 6,
                opacity: 0.7,
                className: 'route-segment'
            }).addTo(this.map);

            // Add hover/click handlers
            this.addPolylineHandlers(polyline, startPlace, endPlace, leg, i);

            // Store segment data
            this.routeSegments.push({
                startPlace: startPlace.name,
                endPlace: endPlace.name,
                distance: leg.distanceMeters,
                duration: leg.durationSeconds,
                coordinates: coords
            });

            this.segmentPolylines.push(polyline);
            totalDistance += leg.distanceMeters;
            totalDuration += leg.durationSeconds;
        }

        console.log('Route segments created from geometry:', this.routeSegments.length);

        // Update route info panel
        if (this.onRouteCalculated) {
            this.onRouteCalculated({
                distance: totalDistance,
                duration: totalDuration,
                distanceKm: (totalDistance / 1000).toFixed(1),
                durationHours: Math.floor(totalDuration / 3600),
                durationMinutes: Math.floor((totalDuration % 3600) / 60)
            });
        }

        // Auto-debug route segments
        this.debugRouteSegments();
    }

    /**
     * Add hover and click handlers to a route polyline
     * @param {L.Polyline} polyline - Leaflet polyline object
     * @param {Object} startPlace - Start place object
     * @param {Object} endPlace - End place object
     * @param {Object} leg - Route leg object with distance/duration
     * @param {number} index - Segment index
     */
    addPolylineHandlers(polyline, startPlace, endPlace, leg, index) {
        // Hover effects
        polyline.on('mouseover', function() {
            this.setStyle({ weight: 8, opacity: 0.9, color: '#f90e0eff' });
        });
        polyline.on('mouseout', function() {
            this.setStyle({ weight: 6, opacity: 0.7, color: '#0E54F9' });
        });

        // Click popup
        polyline.on('click', (e) => {
            const popupContent = this.createSegmentPopup(
                startPlace.name,
                endPlace.name,
                leg.distanceMeters,
                leg.durationSeconds,
                index
            );
            L.popup().setLatLng(e.latlng).setContent(popupContent).openOn(this.map);
        });
    }

    /**
     * Calculate real route between places using OSRM (fallback when no geometry)
     * @param {Array} places - Array of place objects with coords
     */
    renderRouteWithOSRM(places) {
        if (!places || places.length < 2) {
            // Hide route info panel if there's no route
            const panel = document.getElementById('routeInfoPanel');
            if (panel) panel.style.display = 'none';
            return;
        }

        // Clear existing segment polylines
        this.clearSegmentPolylines();

        // Convert places to waypoints
        const waypoints = places.map(place => L.latLng(place.coords[0], place.coords[1]));

        // Create routing control with backend OSRM proxy
        this.routingControl = L.Routing.control({
            waypoints: waypoints,
            router: L.Routing.osrmv1({
                serviceUrl: `${CONFIG.API_BASE}/osrm/route/v1`,
                profile: 'driving' // car routing
            }),
            routeWhileDragging: false,
            showAlternatives: false,
            addWaypoints: false,
            draggableWaypoints: false,
            fitSelectedRoutes: false,
            show: false, // Hide the instruction panel
            lineOptions: {
                styles: [{
                    color: '#667eea',
                    weight: 0,
                    opacity: 0
                }]
            },
            createMarker: function() { return null; }, // Don't create route markers (we have our own)
        }).addTo(this.map);

        // Listen for route calculation
        this.routingControl.on('routesfound', (e) => {
            const routes = e.routes;
            if (routes && routes.length > 0) {
                const route = routes[0];

                // Store distance (in meters) and duration (in seconds)
                this.routeDistance = route.summary.totalDistance;
                this.routeDuration = route.summary.totalTime;

                // Call callback if set
                if (this.onRouteCalculated) {
                    this.onRouteCalculated({
                        distance: this.routeDistance,
                        duration: this.routeDuration,
                        distanceKm: (this.routeDistance / 1000).toFixed(1),
                        durationHours: Math.floor(this.routeDuration / 3600),
                        durationMinutes: Math.floor((this.routeDuration % 3600) / 60)
                    });
                }

                // Create clickable segment polylines
                this.createRouteSegments(route, places);

                console.log('Route calculated:', {
                    distance: `${(this.routeDistance / 1000).toFixed(1)} km`,
                    duration: `${Math.floor(this.routeDuration / 3600)}h ${Math.floor((this.routeDuration % 3600) / 60)}min`
                });
            }
        });

        // Handle routing errors
        this.routingControl.on('routingerror', (e) => {
            console.error('Routing error:', e);
            alert('Could not calculate route. Please check your internet connection or try again later.');
        });
    }

    /**
     * Set callback for when route is calculated
     * @param {Function} callback - Function to call with route info
     */
    setRouteCalculatedCallback(callback) {
        this.onRouteCalculated = callback;
    }

    /**
     * Clear existing segment polylines from the map
     */
    clearSegmentPolylines() {
        this.segmentPolylines.forEach(polyline => {
            this.map.removeLayer(polyline);
        });
        this.segmentPolylines = [];
        this.routeSegments = [];
    }

    /**
     * Create clickable route segments between consecutive places
     * @param {Object} route - OSRM route object with coordinates and instructions
     * @param {Array} places - Array of place objects
     */
    createRouteSegments(route, places) {
        if (!route || !route.coordinates || places.length < 2) return;

        // Get waypoint indices from route instructions
        const waypointIndices = this.getWaypointIndices(route);

        // Create a segment for each pair of consecutive waypoints
        for (let i = 0; i < places.length - 1; i++) {
            const startPlace = places[i];
            const endPlace = places[i + 1];

            // Get the coordinates for this segment
            const startIdx = waypointIndices[i] || 0;
            const endIdx = waypointIndices[i + 1] || route.coordinates.length - 1;
            const segmentCoords = route.coordinates.slice(startIdx, endIdx + 1);

            // Calculate segment distance and duration
            const segmentDistance = this.calculateSegmentDistance(segmentCoords);
            const segmentDuration = this.calculateSegmentDuration(route, startIdx, endIdx);

            // Create clickable polyline for this segment
            const polyline = L.polyline(segmentCoords, {
                color: '#0E54F9',
                weight: 6,
                opacity: 0.7,
                className: 'route-segment'
            }).addTo(this.map);

            // Add hover effect
            polyline.on('mouseover', function() {
                this.setStyle({ weight: 8, opacity: 0.9 , color: '#f90e0eff'});
            });

            polyline.on('mouseout', function() {
                this.setStyle({ weight: 6, opacity: 0.7 , color: '#0E54F9'});
            });

            // Add click handler with popup
            polyline.on('click', (e) => {
                const popupContent = this.createSegmentPopup(
                    startPlace.name,
                    endPlace.name,
                    segmentDistance,
                    segmentDuration,
                    i
                );

                L.popup()
                    .setLatLng(e.latlng)
                    .setContent(popupContent)
                    .openOn(this.map);
            });

            // Store segment data
            this.routeSegments.push({
                startPlace: startPlace.name,
                endPlace: endPlace.name,
                distance: segmentDistance,
                duration: segmentDuration,
                coordinates: segmentCoords
            });

            this.segmentPolylines.push(polyline);
        }

        console.log('Route segments created:', this.routeSegments.length);

        // Auto-debug route segments with detailed info
        this.debugRouteSegments();
    }

    /**
     * Debug helper: Log route segment information in JSON format
     * Call this in console: window.mapService.debugRouteSegments()
     */
    debugRouteSegments() {
        if (!this.routeSegments || this.routeSegments.length === 0) {
            console.warn('No route segments available. Make sure a route is calculated first.');
            return;
        }

        const segmentsData = this.routeSegments.map((segment, index) => {
            const distanceKm = parseFloat((segment.distance / 1000).toFixed(2));
            const durationHours = Math.floor(segment.duration / 3600);
            const durationMinutes = Math.floor((segment.duration % 3600) / 60);
            const durationText = durationHours > 0
                ? `${durationHours}h ${durationMinutes}min`
                : `${durationMinutes}min`;

            return {
                Segment: index + 1,
                From: segment.startPlace,
                To: segment.endPlace,
                'Distance (km)': distanceKm,
                Duration: durationText
            };
        });

        console.log(JSON.stringify(segmentsData, null, 2));

        return segmentsData;
    }

    /**
     * Get waypoint indices from route instructions
     * @param {Object} route - OSRM route object
     * @returns {Array} Array of indices where waypoints are located
     */
    getWaypointIndices(route) {
        const indices = [0]; // First waypoint is always at index 0

        if (route.instructions) {
            route.instructions.forEach((instruction, idx) => {
                // Waypoint instructions have a specific type
                if (instruction.type === 'WaypointReached' || instruction.text?.includes('Waypoint')) {
                    indices.push(instruction.index || idx);
                }
            });
        }

        // Add last coordinate index
        indices.push(route.coordinates.length - 1);

        return indices;
    }

    /**
     * Calculate distance for a segment
     * @param {Array} coordinates - Array of [lat, lng] coordinates
     * @returns {number} Distance in meters
     */
    calculateSegmentDistance(coordinates) {
        let distance = 0;
        for (let i = 0; i < coordinates.length - 1; i++) {
            const from = L.latLng(coordinates[i]);
            const to = L.latLng(coordinates[i + 1]);
            distance += from.distanceTo(to);
        }
        return distance;
    }

    /**
     * Calculate duration for a segment (proportional estimate)
     * @param {Object} route - OSRM route object
     * @param {number} startIdx - Start coordinate index
     * @param {number} endIdx - End coordinate index
     * @returns {number} Duration in seconds
     */
    calculateSegmentDuration(route, startIdx, endIdx) {
        // Estimate duration proportional to segment distance vs total distance
        const segmentCoords = route.coordinates.slice(startIdx, endIdx + 1);
        const segmentDistance = this.calculateSegmentDistance(segmentCoords);
        const proportion = segmentDistance / route.summary.totalDistance;
        return Math.round(route.summary.totalTime * proportion);
    }

    /**
     * Create popup content for a route segment
     * @param {string} startName - Start place name
     * @param {string} endName - End place name
     * @param {number} distance - Segment distance in meters
     * @param {number} duration - Segment duration in seconds
     * @param {number} segmentIndex - Index of the segment
     * @returns {string} HTML content for popup
     */
    createSegmentPopup(startName, endName, distance, duration, segmentIndex) {
        const distanceKm = (distance / 1000).toFixed(1);
        const durationHours = Math.floor(duration / 3600);
        const durationMinutes = Math.floor((duration % 3600) / 60);

        let durationText = '';
        if (durationHours > 0) {
            durationText = `${durationHours}h ${durationMinutes}min`;
        } else {
            durationText = `${durationMinutes}min`;
        }

        return `
            <div class="route-segment-popup">
                <div class="segment-popup-header">
                    <i class="fas fa-route"></i>
                    <span>Segment ${segmentIndex + 1}</span>
                </div>
                <div class="segment-popup-content">
                    <div class="segment-places">
                        <span class="segment-start">${startName}</span>
                        <i class="fas fa-arrow-right"></i>
                        <span class="segment-end">${endName}</span>
                    </div>
                    <div class="segment-stats">
                        <div class="segment-stat">
                            <i class="fas fa-road"></i>
                            <span>${distanceKm} km</span>
                        </div>
                        <div class="segment-stat">
                            <i class="fas fa-clock"></i>
                            <span>${durationText}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Show segment popup for a specific leg (triggered from timeline)
     * @param {number} legIndex - Index of the leg/segment
     */
    showSegmentPopupForLeg(legIndex) {
        if (!this.routeSegments || legIndex >= this.routeSegments.length) {
            console.warn('No route segment found for leg index:', legIndex);
            return;
        }

        const segment = this.routeSegments[legIndex];
        if (!segment || !segment.coordinates || segment.coordinates.length === 0) {
            console.warn('Segment has no coordinates:', segment);
            return;
        }

        // Calculate midpoint of the segment
        const midIndex = Math.floor(segment.coordinates.length / 2);
        const midpoint = segment.coordinates[midIndex];

        // Create popup content
        const popupContent = this.createSegmentPopup(
            segment.startPlace,
            segment.endPlace,
            segment.distance,
            segment.duration,
            legIndex
        );

        // Open popup at midpoint and pan map to it
        L.popup()
            .setLatLng(midpoint)
            .setContent(popupContent)
            .openOn(this.map);

        // Optionally highlight the segment polyline
        if (this.segmentPolylines && this.segmentPolylines[legIndex]) {
            const polyline = this.segmentPolylines[legIndex];
            polyline.setStyle({ weight: 8, opacity: 0.9, color: '#f90e0eff' });

            // Reset style after a delay
            setTimeout(() => {
                polyline.setStyle({ weight: 6, opacity: 0.7, color: '#0E54F9' });
            }, 3000);
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

        // Open popup and center on selected place
        marker.openPopup();
        // Zoom to configured level if current zoom is less, otherwise maintain current zoom
        const targetZoom = this.map.getZoom() < CONFIG.PLACE_SELECTION_ZOOM
            ? CONFIG.PLACE_SELECTION_ZOOM
            : this.map.getZoom();
        this.map.setView(marker.getLatLng(), targetZoom);
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
                    <div class="map-popup-actions">
                        <button class="popup-action-btn delete-btn"
                                onclick="event.stopPropagation(); window.app.deleteCampsite(${campsite.id}, '${(campsite.name || 'Unnamed Campsite').replace(/'/g, "\\'")}')"
                                title="Delete campsite">
                            <i class="fas fa-trash"></i> Delete
                        </button>
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

        // Desktop: Use minimal Leaflet popup
        const minimalContent = this.buildMinimalPopup(place, index, isNonRoute);

        const popup = L.popup({
            maxWidth: 300,
            className: 'place-popup-minimal-container'
        }).setContent(minimalContent);

        marker.bindPopup(popup);

        // Open details sidebar when marker is clicked
        marker.on('click', () => {
            this.showPlaceDetailsInSidebar(place, index, isNonRoute);
        });

        // If place has Google data, lazy load it for sidebar
        if (place.hasGoogleData && place.id) {
            let googleDataCache = null;

            marker.on('click', async () => {
                // If already loaded, use cached data for sidebar
                if (googleDataCache) {
                    const enrichedPlaceWithCoords = {
                        ...place,
                        googleData: googleDataCache
                    };
                    // Update sidebar with cached data
                    this.showPlaceDetailsInSidebar(enrichedPlaceWithCoords, index, isNonRoute);
                    return;
                }

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

                        // Update sidebar content with Google data
                        this.showPlaceDetailsInSidebar(enrichedPlaceWithCoords, index, isNonRoute);
                    }
                } catch (error) {
                    console.error('Failed to load Google data for place:', error);
                    // Sidebar will show basic info even if Google data fails to load
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
                ${place.notes ? `
                    <div class="map-popup-notes">
                        <div class="notes-header">
                            <i class="fas fa-sticky-note"></i>
                            <strong>Notes</strong>
                        </div>
                        <div class="notes-content">${place.notes.replace(/\n/g, '<br>')}</div>
                    </div>
                ` : ''}
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
     * Returns object with header data and content HTML
     * Compact design: Carousel + Buttons in content, Name + Position in header
     */
    buildMobilePlacePopupContent(place, index, isNonRoute, lat, lng) {
        // Compact carousel (100px height, clickable for fullscreen)
        const photos = place.googleData?.photos || [];

        // Store photos for fullscreen gallery access
        this.currentPopupPhotos = photos;

        const imageCarousel = photos.length > 0
            ? `<div class="popup-image-carousel unified-carousel" onclick="openPhotosGallery(); event.stopPropagation();">
                   <div class="carousel-container" id="mobile-carousel-${place.id || index}">
                       ${photos.map((photo, idx) => `
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
                          </button>
                          <div class="carousel-indicators">
                              ${photos.map((_, idx) => `
                                  <span class="indicator ${idx === 0 ? 'active' : ''}"
                                        onclick="event.stopPropagation(); goToSlide('mobile-carousel-${place.id || index}', ${idx})"></span>
                              `).join('')}
                          </div>`
                       : ''
                   }
                   <div class="carousel-photo-count">${photos.length} photo${photos.length > 1 ? 's' : ''}</div>
               </div>`
            : '';

        // Stacked buttons (Expand/Details + primary action)
        let buttons = '';
        if (isNonRoute) {
            // Non-route place
            buttons = `
                <div class="mobile-popup-buttons">
                    <button class="btn btn-primary" onclick="event.stopPropagation(); window.mapService?.expandMobilePopup()">
                        <i class="fas fa-info-circle"></i>
                    </button>
                    <button class="btn btn-primary" onclick="event.stopPropagation(); window.app.showAddPlacePositionModal(${place.id}, '${place.name.replace(/'/g, "\\'")}')">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
            `;
        } else if (index !== null) {
            // Route place
            // buttons = `
            //     <div class="mobile-popup-buttons">
            //         <button class="btn btn-primary" onclick="event.stopPropagation(); window.mapService?.expandMobilePopup()">
            //             <i class="fas fa-info-circle"></i>
            //         </button>
            //         <button class="btn btn-danger" onclick="event.stopPropagation(); window.app?.placeManager?.removePlace(${index})">
            //             <i class="fas fa-trash"></i>
            //         </button>
            //     </div>
            // `;
        }

        // Prepare header data
        const position = index !== null ? `${index + 1}` : '';
        const badges = place.googleData
            ? '<span class="google-place-badge"><i class="fab fa-google"></i> Google</span>'
            : '';

        // Build expanded view content
        const expandedView = this.buildExpandedMobileContent(place, index, isNonRoute, lat, lng);

        // Return object with header and unified content (both compact and expanded views)
        return {
            header: {
                position: position,
                placeName: place.name,
                badges: badges
            },
            content: `
                ${imageCarousel}
                <div class="compact-view" data-visible-when="compact">
                    ${buttons}
                </div>
                ${expandedView}
            `
        };
    }

    /**
     * Build expanded mobile popup content with full Google Places information
     * Returns HTML wrapped in expanded-view div
     * Note: Carousel is built separately in buildMobilePlacePopupContent
     */
    buildExpandedMobileContent(place, index, isNonRoute, lat, lng) {
        // Rating & Reviews
        const ratingSection = place.googleData?.rating
            ? `<div class="expanded-rating-section">
                   <div class="rating-display">
                       <span class="rating-stars">⭐</span>
                       <span class="rating-value">${place.googleData.rating.toFixed(1)}</span>
                       ${place.googleData.userRatingsTotal
                           ? `<span class="rating-count">(${place.googleData.userRatingsTotal.toLocaleString()} reviews)</span>`
                           : ''
                       }
                   </div>
                   ${place.googleData.priceLevel
                       ? `<div class="price-display">
                              <span class="price-symbols">${'$'.repeat(place.googleData.priceLevel)}</span>
                          </div>`
                       : ''
                   }
               </div>`
            : '';

        // Business Status
        const statusSection = place.googleData?.businessStatus
            ? `<div class="expanded-status-section">
                   ${place.googleData.businessStatus === 'OPERATIONAL'
                       ? '<span class="status-badge operational"><i class="fas fa-check-circle"></i> Open</span>'
                       : place.googleData.businessStatus === 'CLOSED_TEMPORARILY'
                       ? '<span class="status-badge closed-temp"><i class="fas fa-exclamation-circle"></i> Temporarily Closed</span>'
                       : '<span class="status-badge closed-perm"><i class="fas fa-times-circle"></i> Permanently Closed</span>'
                   }
               </div>`
            : '';

        // Address
        const addressSection = place.googleData?.formattedAddress
            ? `<div class="expanded-info-section">
                   <div class="info-section-title"><i class="fas fa-map-marker-alt"></i> Address</div>
                   <div class="info-section-content">${place.googleData.formattedAddress}</div>
               </div>`
            : '';

        // Contact Information
        const contactSection = [];
        if (place.googleData?.phoneNumber) {
            contactSection.push(`
                <div class="expanded-info-section">
                    <div class="info-section-title"><i class="fas fa-phone"></i> Phone</div>
                    <a href="tel:${place.googleData.phoneNumber}" class="info-section-link">
                        ${place.googleData.phoneNumber}
                    </a>
                </div>
            `);
        }
        if (place.googleData?.website) {
            contactSection.push(`
                <div class="expanded-info-section">
                    <div class="info-section-title"><i class="fas fa-globe"></i> Website</div>
                    <a href="${place.googleData.website}" target="_blank" class="info-section-link" onclick="event.stopPropagation()">
                        Visit Website <i class="fas fa-external-link-alt"></i>
                    </a>
                </div>
            `);
        }

        // Opening Hours
        let hoursSection = '';
        if (place.googleData?.openingHours) {
            try {
                const hours = typeof place.googleData.openingHours === 'string'
                    ? JSON.parse(place.googleData.openingHours)
                    : place.googleData.openingHours;

                if (hours.weekday_text && hours.weekday_text.length > 0) {
                    hoursSection = `
                        <div class="expanded-info-section">
                            <div class="info-section-title"><i class="fas fa-clock"></i> Opening Hours</div>
                            <div class="hours-list">
                                ${hours.weekday_text.map(day => `<div class="hours-day">${day}</div>`).join('')}
                            </div>
                        </div>
                    `;
                }
            } catch (e) {
                console.warn('Failed to parse opening hours:', e);
            }
        }

        // Categories & Countries
        const metadataSection = [];
        if (place.categories && place.categories.length > 0) {
            metadataSection.push(`
                <div class="expanded-info-section">
                    <div class="info-section-title"><i class="fas fa-tag"></i> Categories</div>
                    <div class="badges-row">
                        ${place.categories.map(c => `<span class="category-badge">${c.icon || '📍'} ${c.name}</span>`).join('')}
                    </div>
                </div>
            `);
        }
        if (place.countries && place.countries.length > 0) {
            metadataSection.push(`
                <div class="expanded-info-section">
                    <div class="info-section-title"><i class="fas fa-flag"></i> Countries</div>
                    <div class="badges-row">
                        ${place.countries.map(c => `<span class="country-badge">${c.icon || '🌍'} ${c.name}</span>`).join('')}
                    </div>
                </div>
            `);
        }

        // Coordinates
        const coordsSection = `
            <div class="expanded-info-section">
                <div class="info-section-title"><i class="fas fa-map-pin"></i> Coordinates</div>
                <div class="info-section-content">${lat.toFixed(6)}, ${lng.toFixed(6)}</div>
            </div>
        `;

        // Action buttons (sticky at bottom)
        const externalLinks = `
            <div class="expanded-external-links">
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

        let actionButtons = '';
        if (isNonRoute) {
            actionButtons = `
                <div class="expanded-action-buttons">
                    <button class="btn btn-primary btn-large" onclick="event.stopPropagation(); window.app.showAddPlacePositionModal(${place.id}, '${place.name.replace(/'/g, "\\'")}')">
                        <i class="fas fa-plus"></i> Add to Route
                    </button>
                    <div class="expanded-action-group">
                        <button class="btn btn-secondary" onclick="event.stopPropagation(); window.app.editNonRoutePlace(${place.id})" title="Edit place">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        <button class="btn btn-danger" onclick="event.stopPropagation(); window.app.deleteNonRoutePlace(${place.id}, '${place.name.replace(/'/g, "\\'")}')">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </div>
                </div>
            `;
        } else if (index !== null) {
            actionButtons = `
                <button class="btn btn-danger btn-large" onclick="event.stopPropagation(); window.app?.placeManager?.removePlace(${index})">
                    <i class="fas fa-trash"></i> Remove from Route
                </button>
            `;
        }

        // Notes section
        const notesSection = place.notes
            ? `<div class="expanded-info-section">
                   <div class="info-section-title"><i class="fas fa-sticky-note"></i> Notes</div>
                   <div class="info-section-content notes-text">${place.notes.replace(/\n/g, '<br>')}</div>
               </div>`
            : '';

        // Assemble expanded view (carousel is now in unified structure, don't include it here)
        // All content scrolls together - no separate scroll wrapper
        return `
            <div class="expanded-view" data-visible-when="expanded">
                ${ratingSection}
                ${statusSection}
                ${addressSection}
                ${contactSection.join('')}
                ${hoursSection}
                ${metadataSection.join('')}
                ${notesSection}
                ${coordsSection}
                ${externalLinks}
                ${actionButtons}
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
     * @param {Array} routeLegs - Optional array of route leg objects with geometryCoordinates
     */
    updateMapWithBothPlaceTypes(routePlaces, nonRoutePlaces, routeLegs = null) {
        // Clear existing markers (route places)
        this.markers.forEach(marker => this.map.removeLayer(marker));
        this.markers = [];

        // Clear existing non-route markers
        this.nonRouteMarkers.forEach(marker => this.map.removeLayer(marker));
        this.nonRouteMarkers = [];

        // Clear existing routing control
        if (this.routingControl) {
            this.map.removeControl(this.routingControl);
            this.routingControl = null;
        }

        // Add blue markers for route places (with numbers and routing)
        if (routePlaces && routePlaces.length > 0) {
            routePlaces.forEach((place, index) => {
                const isSelected = this.selectedMarkerIndex === index;

                // Create custom numbered icon
                const customIcon = L.divIcon({
                    html: `<div class="route-marker-numbered ${isSelected ? 'selected' : ''}">
                            <div class="marker-number">${index + 1}</div>
                           </div>`,
                    className: 'route-marker-container',
                    iconSize: isSelected ? [40, 40] : [32, 32],
                    iconAnchor: isSelected ? [20, 20] : [16, 16],
                    popupAnchor: [0, -20]
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

            // Add routing if enabled and we have at least 2 places
            if (this.showRoute && routePlaces.length > 1) {
                if (routeLegs && routeLegs.length > 0 && routeLegs[0].geometryCoordinates) {
                    // Use stored geometry from database
                    console.log('Rendering route from stored geometry (no OSRM call)');
                    this.renderRouteFromGeometry(routePlaces, routeLegs);
                } else {
                    // Fall back to OSRM when geometry not available
                    console.log('Geometry not available, calling OSRM');
                    this.renderRouteWithOSRM(routePlaces);
                }
            } else {
                // Hide route info panel if routing is disabled
                const panel = document.getElementById('routeInfoPanel');
                if (panel) panel.style.display = 'none';
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

    showMobileDockedPopup(contentData, placeId, placeData) {
        if (!this.isMobileView()) return;

        const popup = document.getElementById('mobileDockedPopup');
        const popupContent = document.getElementById('mobilePopupContent');
        const popupPosition = document.getElementById('mobilePopupPosition');
        const popupPlaceName = document.getElementById('mobilePopupPlaceName');
        const popupBadges = document.getElementById('mobilePopupBadges');

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

        // Handle both new object format and old string format (backwards compatibility)
        let content, headerData;
        if (typeof contentData === 'object' && contentData.content !== undefined) {
            // New format: {header: {...}, content: '...'}
            content = contentData.content;
            headerData = contentData.header;
        } else {
            // Old format: just a string (for campsites, etc.)
            content = contentData;
            headerData = null;
        }

        // Set content
        popupContent.innerHTML = content;

        // Update header if header data is provided
        if (headerData) {
            // Set place name
            if (popupPlaceName) {
                popupPlaceName.textContent = headerData.placeName || '';
            }

            // Set badges
            if (popupBadges) {
                popupBadges.innerHTML = headerData.badges || '';
            }

            // Set position
            if (popupPosition && headerData.position) {
                const total = placeData?.index !== null && placeData?.index !== undefined
                    ? window.app?.placeManager?.places?.length || 0
                    : window.app?.allPlacesManager?.filteredPlaces?.length || 0;

                popupPosition.textContent = total > 0 ? `${headerData.position} of ${total}` : '';
            }
        } else {
            // Fallback: try to determine position from placeData (for campsites)
            if (popupPosition && placeData) {
                if (placeData.index !== null && placeData.index !== undefined) {
                    const total = window.app?.placeManager?.places?.length || 0;
                    popupPosition.textContent = total > 0 ? `${placeData.index + 1} of ${total}` : '';
                } else {
                    const selectedIndex = window.app?.allPlacesManager?.selectedIndex;
                    const total = window.app?.allPlacesManager?.filteredPlaces?.length || 0;
                    if (selectedIndex !== null && total > 0) {
                        popupPosition.textContent = `${selectedIndex + 1} of ${total}`;
                    } else {
                        popupPosition.textContent = '';
                    }
                }
            }

            // Clear name and badges for non-place popups
            if (popupPlaceName) popupPlaceName.textContent = '';
            if (popupBadges) popupBadges.innerHTML = '';
        }

        // Reset to compact state when showing popup
        popup.setAttribute('data-state', 'compact');

        // Show popup
        popup.classList.add('show');

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

        // Don't close if clicking inside the popup, fullscreen gallery, or on a marker
        const fullscreenGallery = document.getElementById('fullscreenImageGallery');
        if (popup.contains(e.target) ||
            (fullscreenGallery && fullscreenGallery.contains(e.target)) ||
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

    /**
     * Expand mobile popup to full height
     * Simply toggles state - no innerHTML replacement for smooth animation
     */
    async expandMobilePopup() {
        const popup = document.getElementById('mobileDockedPopup');
        if (!popup) return;

        // Clear any inline maxHeight from swipe gestures
        popup.style.maxHeight = '';

        // Just change state - CSS handles the visual transition to 85vh
        popup.setAttribute('data-state', 'expanded');

        console.log('Mobile popup expanded');
    }

    /**
     * Collapse mobile popup back to compact state
     * Simply toggles state - no innerHTML replacement for smooth animation
     */
    collapseMobilePopup() {
        const popup = document.getElementById('mobileDockedPopup');
        if (!popup) return;

        // Clear any inline maxHeight from swipe gestures
        popup.style.maxHeight = '';

        // Just change state - CSS handles the visual transition to 320px
        popup.setAttribute('data-state', 'compact');

        // Scroll content back to top for next time
        const popupContent = document.getElementById('mobilePopupContent');
        if (popupContent) {
            popupContent.scrollTop = 0;
        }

        console.log('Mobile popup collapsed');
    }

    /**
     * Check if popup content is scrolled to the top (or near the top)
     * Used to determine if swipe-down should collapse
     * @param {number} threshold - How many pixels from top to consider "at top" (default: 30)
     *                             Use small values (3-5px) for drag detection to avoid scroll conflicts
     *                             Use larger values (20-30px) for simple swipe detection
     */
    isPopupScrolledToTop(threshold = 30) {
        const popup = document.getElementById('mobileDockedPopup');
        const state = popup?.getAttribute('data-state');
        const popupContent = document.getElementById('mobilePopupContent');

        if (state === 'expanded') {
            // In expanded mode, check if within threshold of top
            // Tight threshold (3px) prevents conflicts with content scrolling on mobile
            return popupContent && popupContent.scrollTop <= threshold;
        } else {
            // In compact mode, mobile-popup-content should not be scrollable (overflow: hidden)
            // Always return true to allow swipe-down gestures
            return true;
        }
    }

    /**
     * Auto-scroll content to top if near the top
     * Makes it easier to collapse the popup
     */
    autoScrollToTopIfNear() {
        const popup = document.getElementById('mobileDockedPopup');
        const state = popup?.getAttribute('data-state');
        const popupContent = document.getElementById('mobilePopupContent');

        if (state === 'expanded' && popupContent && popupContent.scrollTop > 0 && popupContent.scrollTop <= 20) {
            // Instantly scroll to top for immediate collapse gesture
            popupContent.scrollTop = 0;
            return true;
        }
        return false;
    }

    // ============================================
    // FULLSCREEN IMAGE GALLERY
    // ============================================

    openCurrentPhotosGallery() {
        console.log('openCurrentPhotosGallery called, photos:', this.currentPopupPhotos);
        if (this.currentPopupPhotos && this.currentPopupPhotos.length > 0) {
            this.showFullscreenImageGallery(this.currentPopupPhotos, 0);
        } else {
            console.warn('No photos available for gallery');
        }
    }

    showFullscreenImageGallery(photos, startIndex = 0) {
        console.log('showFullscreenImageGallery called with photos:', photos, 'startIndex:', startIndex);
        if (!photos || photos.length === 0) {
            console.warn('No photos provided to gallery');
            return;
        }

        const gallery = document.getElementById('fullscreenImageGallery');
        const galleryImages = document.getElementById('galleryImages');
        const galleryCounter = document.getElementById('galleryCounter');
        const prevBtn = document.getElementById('galleryPrev');
        const nextBtn = document.getElementById('galleryNext');

        if (!gallery || !galleryImages) {
            console.error('Gallery elements not found!', { gallery, galleryImages });
            return;
        }

        this.galleryPhotos = photos;
        this.currentGalleryIndex = startIndex;

        // Build gallery images
        const galleryHTML = photos.map((photo, idx) => `
            <div class="gallery-image ${idx === startIndex ? 'active' : ''}" data-index="${idx}">
                <img src="${photo.photoUrl}" alt="Image ${idx + 1}">
            </div>
        `).join('');

        console.log('Gallery HTML generated:', galleryHTML);
        galleryImages.innerHTML = galleryHTML;
        console.log('Gallery images innerHTML set. Child count:', galleryImages.children.length);

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
        console.log('Adding show class to gallery');
        gallery.classList.add('show');
        console.log('Gallery classes:', gallery.className);

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
            } else if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 50) {
                // Vertical swipe (min 50px)
                if (diffY < 0) {
                    // Swipe down - close fullscreen gallery
                    this.hideFullscreenImageGallery();
                }
            }
        }, { passive: true });
    }

    /**
     * Show place details in sidebar (desktop only)
     */
    showPlaceDetailsInSidebar(place, index, isNonRoute) {
        // Only for desktop
        if (this.isMobileView()) return;

        const sidebar = document.getElementById('placeDetailsSidebar');
        const content = document.getElementById('placeDetailsContent');
        if (!sidebar || !content) return;

        // Build detailed content (reuse existing function logic)
        const detailsHTML = this.buildPlaceDetailsForSidebar(place, index, isNonRoute);
        content.innerHTML = detailsHTML;

        // Show sidebar
        sidebar.classList.add('active');
    }

    /**
     * Build minimal popup content (just name) for desktop Leaflet popups
     */
    buildMinimalPopup(place, index, isNonRoute) {
        const googleBadge = place.googleData || place.googlePlaceId
            ? '<i class="fab fa-google" style="color: #4285f4; margin-left: 4px;"></i>'
            : '';

        return `
            <div class="map-popup-minimal">
                ${index !== null ? `<span class="place-number-badge">${index + 1}</span>` : ''}
                <span class="place-name-text">${place.name}</span>
                ${googleBadge}
                ${isNonRoute ? '<span class="non-route-mini">⭘</span>' : ''}
            </div>
        `;
    }

    /**
     * Build detailed place content for sidebar
     */
    buildPlaceDetailsForSidebar(place, index = null, isNonRoute = false) {
        // This is essentially the same as the old buildPlacePopupContent
        // but returns the content for the sidebar instead
        const lat = place.coords ? place.coords[0] : place.latitude;
        const lng = place.coords ? place.coords[1] : place.longitude;

        // Reuse all the existing building blocks from buildPlacePopupContent
        // For now, let's just call the existing function and use its output
        return this.buildPlacePopupContent(place, index, isNonRoute, false);
    }
}

// Global function to close place details sidebar
window.closePlaceDetails = function() {
    const sidebar = document.getElementById('placeDetailsSidebar');
    if (sidebar) {
        sidebar.classList.remove('active');
    }
};

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
