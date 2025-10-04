import { CONFIG } from './config.js';

export class MapService {
    constructor() {
        this.map = null;
        this.markers = [];
        this.routePolyline = null;
        this.showRoute = true;
        this.clickMarker = null;
        this.selectedMarkerIndex = null;
        this.onMarkerClick = null;
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
            const coords = `${e.latlng.lat.toFixed(6)}, ${e.latlng.lng.toFixed(6)}`;
            callback(coords, e.latlng);
            
            // Add temporary marker
            if (this.clickMarker) {
                this.map.removeLayer(this.clickMarker);
            }
            this.clickMarker = L.marker(e.latlng).addTo(this.map);
        });
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
                .addTo(this.map)
                .bindPopup(`
                    <div class="map-popup-content">
                        <div class="map-popup-header">
                            <div class="place-number">${index + 1}</div>
                            <strong>${place.name}</strong>
                        </div>
                        <div class="map-popup-coords">Lat: ${place.coords[0].toFixed(4)}, Lng: ${place.coords[1].toFixed(4)}</div>
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
}