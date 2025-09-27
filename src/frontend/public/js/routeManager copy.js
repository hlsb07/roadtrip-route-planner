export class RouteManager {
    constructor() {
        this.routes = [];
        this.currentRouteId = null;
        this.isEditingRoute = false;
        this.onRouteChangeCallback = null; // Callback für Route-Änderungen
    }

    // Setzen Sie einen Callback für Route-Änderungen
    setOnRouteChangeCallback(callback) {
        this.onRouteChangeCallback = callback;
    }

    

    // Restliche Methoden bleiben unverändert...
    async loadRoutes() {
        try {
            console.log('Loading routes...');
            this.routes = await ApiService.getAllRoutes();
            console.log('Routes loaded:', this.routes);
            
            this.updateRouteSelector();
            
            // Automatically select first route
            if (this.routes.length > 0 && !this.currentRouteId) {
                this.currentRouteId = this.routes[0].id;
                const places = await this.loadCurrentRoute();
                
                // Callback für initiale Route aufrufen
                if (this.onRouteChangeCallback) {
                    this.onRouteChangeCallback(places);
                }
                
                return places;
            }
            
        } catch (error) {
            console.error('Failed to load routes:', error);
            showError('Failed to load routes. Creating default route...');
            await this.createDefaultRoute();
        }
    }
    updateRouteSelector() {
        const select = document.getElementById('routeSelect');
        
        // Event-Listener entfernen durch Klonen
        const newSelect = select.cloneNode(false);
        select.parentNode.replaceChild(newSelect, select);
        
        newSelect.innerHTML = '';

        if (this.routes.length === 0) {
            newSelect.innerHTML = '<option value="">No routes available</option>';
            return;
        }

        this.routes.forEach(route => {
            const option = document.createElement('option');
            option.value = route.id;
            option.textContent = `${route.name} (${route.placeCount} places)`;
            if (route.id === this.currentRouteId) {
                option.selected = true;
            }
            newSelect.appendChild(option);
        });

        // Einen einzigen Event-Listener hinzufügen
        newSelect.addEventListener('change', async (e) => {
            const newRouteId = parseInt(e.target.value);
            
            if (e.target.value && newRouteId !== this.currentRouteId) {
                console.log('Route changed from', this.currentRouteId, 'to', newRouteId);
                
                this.currentRouteId = newRouteId;
                const places = await this.loadCurrentRoute();
                
                // Callback aufrufen, um andere Komponenten zu benachrichtigen
                if (this.onRouteChangeCallback) {
                    this.onRouteChangeCallback(places);
                }
            }
        });
    }

    async loadCurrentRoute() {
        if (!this.currentRouteId) return [];
        
        try {
            console.log('Loading current route:', this.currentRouteId);
            const route = await ApiService.getRoute(this.currentRouteId);
            console.log('Current route loaded:', route);
            
            // Convert places to expected format
            return route.places.map(p => ({
                name: p.name,
                coords: [p.latitude, p.longitude],
                id: p.id
            }));
            
        } catch (error) {
            console.error('Failed to load current route:', error);
            showError('Failed to load route');
            return [];
        }
    }

    // ... restliche Methoden unverändert
}