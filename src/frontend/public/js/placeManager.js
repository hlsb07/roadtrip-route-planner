import { ApiService } from './api.js';
import { showSuccess, showError, sleep } from './utils.js';

export class PlaceManager {
    constructor(routeManager, onUpdate = null) {
        this.routeManager = routeManager;
        this.places = [];
        this.onUpdate = onUpdate;
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
            
            showSuccess(`Removed "${place.name}" from route`);
            return true;
            
        } catch (error) {
            console.error('Failed to remove place:', error);
            showError('Failed to remove place');
            return false;
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
        const currentRouteId = this.routeManager.getCurrentRouteId();

        if (!currentRouteId) {
            placesList.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #999;">
                    <i class="fas fa-route" style="font-size: 2rem; margin-bottom: 10px; opacity: 0.5;"></i><br>
                    No route selected.<br>
                    <button class="btn" onclick="routeManager.showCreateRouteModal()" style="margin-top: 10px;">
                        <i class="fas fa-plus"></i> Create Your First Route
                    </button>
                </div>`;
            return;
        }

        if (this.places.length === 0) {
            placesList.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #999;">
                    <i class="fas fa-map-marker-alt" style="font-size: 2rem; margin-bottom: 10px; opacity: 0.5;"></i><br>
                    No places in this route yet.<br>
                    Start by searching or clicking the map!
                </div>`;
            return;
        }

        placesList.innerHTML = this.places.map((place, index) => `
            <div class="place-item" data-index="${index}">
                <div class="place-header">
                    <div class="place-number">${index + 1}</div>
                    <div class="place-name">${place.name}</div>
                    <div class="place-actions">
                        <button class="action-btn delete-btn" onclick="placeManager.removePlace(${index})" title="Remove from route">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                <div class="place-links">
                    <a href="https://www.google.com/maps/search/?api=1&query=${place.coords[0]},${place.coords[1]}"
                    target="_blank"
                    class="link-btn google-maps">
                        <i class="fas fa-map"></i> Maps
                    </a>
                    <a href="https://www.google.com/maps/dir/?api=1&destination=${place.coords[0]},${place.coords[1]}"
                    target="_blank"
                    class="link-btn google-nav">
                        <i class="fas fa-directions"></i> Navigate
                    </a>
                </div>
            </div>
        `).join('');

        // Initialize sortable for drag & drop
        new Sortable(placesList, {
            animation: 300,
            ghostClass: 'dragging',
            onEnd: async (evt) => {
                // Determine new order
                const newOrder = Array.from(placesList.children).map(item => {
                    const index = parseInt(item.dataset.index);
                    return this.places[index].id;
                });

                console.log('New order:', newOrder);

                // API call for reorder
                const success = await this.reorderPlaces(newOrder);
                if (success) {
                    // Update UI on success
                    if (this.onUpdate) {
                        this.onUpdate();
                    }
                } else {
                    // Reset UI on failure
                    this.updatePlacesList(onRemove);
                }
            }
        });
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
}