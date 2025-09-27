import { ApiService } from './api.js';
import { showSuccess, showError } from './utils.js';

export class RouteManager {
    constructor() {
        this.routes = [];
        this.currentRouteId = null;
        this.isEditingRoute = false;
    }


    async loadRoutes() {
        try {
            console.log('Loading routes...');
            this.routes = await ApiService.getAllRoutes();
            console.log('Routes loaded:', this.routes);
            
            this.updateRouteSelector();
            
            // Automatically select first route
            if (this.routes.length > 0 && !this.currentRouteId) {
                this.currentRouteId = this.routes[0].id;
                return await this.loadCurrentRoute();
            }
            
        } catch (error) {
            console.error('Failed to load routes:', error);
            showError('Failed to load routes. Creating default route...');
            await this.createDefaultRoute();
        }
    }

    updateRouteSelector() {
        const select = document.getElementById('routeSelect');
        select.innerHTML = '';

        if (this.routes.length === 0) {
            select.innerHTML = '<option value="">No routes available</option>';
            return;
        }

        this.routes.forEach(route => {
            const option = document.createElement('option');
            option.value = route.id;
            option.textContent = `${route.name} (${route.placeCount} places)`;
            if (route.id === this.currentRouteId) {
                option.selected = true;
            }
            select.appendChild(option);
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

    showCreateRouteModal() {
        this.isEditingRoute = false;
        document.getElementById('modalTitle').textContent = 'Create New Route';
        document.getElementById('saveRouteBtn').textContent = 'Create Route';
        document.getElementById('routeName').value = '';
        document.getElementById('routeDescription').value = '';
        
        const modal = document.getElementById('routeModal');
        modal.classList.add('active');
        document.getElementById('routeName').focus();
    }

    showRenameRouteModal() {
        if (!this.currentRouteId) {
            showError('No route selected');
            return;
        }
        
        const currentRoute = this.routes.find(r => r.id === this.currentRouteId);
        if (!currentRoute) return;
        
        this.isEditingRoute = true;
        document.getElementById('modalTitle').textContent = 'Rename Route';
        document.getElementById('saveRouteBtn').textContent = 'Save Changes';
        document.getElementById('routeName').value = currentRoute.name;
        document.getElementById('routeDescription').value = currentRoute.description || '';
        
        const modal = document.getElementById('routeModal');
        modal.classList.add('active');
        document.getElementById('routeName').focus();
    }

    closeRouteModal() {
        const modal = document.getElementById('routeModal');
        modal.classList.remove('active');
    }

    async saveRoute() {
        const name = document.getElementById('routeName').value.trim();
        const description = document.getElementById('routeDescription').value.trim();
        
        if (!name) {
            showError('Route name is required');
            return;
        }
        
        try {
            if (this.isEditingRoute) {
                await ApiService.updateRoute(this.currentRouteId, name, description);
            } else {
                const newRoute = await ApiService.createRoute(name, description);
                this.currentRouteId = newRoute.id;
            }
            
            this.closeRouteModal();
            await this.loadRoutes();
            
            showSuccess(this.isEditingRoute ? 'Route updated!' : 'Route created!');
            return true;
            
        } catch (error) {
            console.error('Failed to save route:', error);
            showError('Failed to save route');
            return false;
        }
    }

    async deleteCurrentRoute() {
        if (!this.currentRouteId) {
            showError('No route selected');
            return;
        }
        
        const currentRoute = this.routes.find(r => r.id === this.currentRouteId);
        if (!currentRoute) return;
        
        if (!confirm(`Delete route "${currentRoute.name}"? This cannot be undone.`)) {
            return;
        }
        
        try {
            await ApiService.deleteRoute(this.currentRouteId);
            
            // Remove route from local list
            this.routes = this.routes.filter(r => r.id !== this.currentRouteId);
            
            // Select next available route
            if (this.routes.length > 0) {
                this.currentRouteId = this.routes[0].id;
                const places = await this.loadCurrentRoute();
                this.updateRouteSelector();
                return places;
            } else {
                this.currentRouteId = null;
                await this.createDefaultRoute();
                return [];
            }
            
        } catch (error) {
            console.error('Failed to delete route:', error);
            showError('Failed to delete route');
        }
    }

    async createDefaultRoute() {
        try {
            await ApiService.createRoute('My Trip Route', 'Default route for planning');
            await this.loadRoutes();
        } catch (error) {
            console.error('Failed to create default route:', error);
        }
    }

    getCurrentRouteId() {
        return this.currentRouteId;
    }

    getCurrentRoute() {
        return this.routes.find(r => r.id === this.currentRouteId);
    }
}