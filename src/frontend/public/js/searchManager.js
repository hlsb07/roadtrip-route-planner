import { ApiService } from './api.js';
import { parseGoogleMapsLink, validateCoordinates, formatPlaceName, showError } from './utils.js';

export class SearchManager {
    constructor() {
        this.currentTab = 'search';
    }

    switchTab(tab) {
        this.currentTab = tab;
        const tabs = document.querySelectorAll('.tab-btn');
        tabs.forEach(t => t.classList.remove('active'));
        
        // Find and activate the clicked tab
        const activeTab = Array.from(tabs).find(t => t.onclick.toString().includes(`'${tab}'`));
        if (activeTab) activeTab.classList.add('active');
        
        const input = document.getElementById('searchInput');
        const searchResults = document.getElementById('searchResults');
        searchResults.classList.remove('active');
        
        if (tab === 'search') {
            input.placeholder = 'Search for a place...';
        } else if (tab === 'coords') {
            input.placeholder = 'Click map or enter: lat, lng';
        } else if (tab === 'link') {
            input.placeholder = 'Paste Google Maps link...';
        }
        
        input.value = '';
        input.focus();
    }

    async handleSearch() {
        const input = document.getElementById('searchInput').value.trim();
        if (!input) return;

        if (this.currentTab === 'search') {
            return await this.searchPlace(input);
        } else if (this.currentTab === 'coords') {
            return this.addPlaceFromCoords(input);
        } else if (this.currentTab === 'link') {
            return this.parseGoogleMapsLink(input);
        }
    }

    async searchPlace(query) {
        const loading = document.getElementById('loading');
        const results = document.getElementById('searchResults');
        
        loading.classList.add('active');
        results.classList.remove('active');
        
        try {
            const data = await ApiService.searchPlaces(query);
            
            loading.classList.remove('active');
            
            if (data.length > 0) {
                this.displaySearchResults(data);
                return data;
            } else {
                showError('No results found. Try different keywords.');
                return [];
            }
        } catch (error) {
            loading.classList.remove('active');
            showError('Search failed. Please try again.');
            return [];
        }
    }

    displaySearchResults(results, onSelect) {
        const resultsDiv = document.getElementById('searchResults');
        resultsDiv.innerHTML = '';
        
        results.forEach(result => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.innerHTML = `
                <strong>${result.display_name.split(',')[0]}</strong><br>
                <small>${result.display_name}</small>
            `;
            item.onclick = () => {
                const place = {
                    name: result.display_name.split(',')[0],
                    coords: [parseFloat(result.lat), parseFloat(result.lon)]
                };
                onSelect(place);
                resultsDiv.classList.remove('active');
                document.getElementById('searchInput').value = '';
            };
            resultsDiv.appendChild(item);
        });
        
        resultsDiv.classList.add('active');
    }

    addPlaceFromCoords(coordsStr) {
        const validation = validateCoordinates(coordsStr);
        if (!validation.valid) {
            showError(validation.error);
            return null;
        }
        
        const place = {
            name: formatPlaceName(validation.lat, validation.lng),
            coords: [validation.lat, validation.lng]
        };
        
        document.getElementById('searchInput').value = '';
        return place;
    }

    parseGoogleMapsLink(url) {
        const result = parseGoogleMapsLink(url);
        
        if (result.shouldSearch) {
            return this.searchPlace(result.query);
        } else if (result.coords) {
            const place = { name: result.name, coords: result.coords };
            document.getElementById('searchInput').value = '';
            return place;
        } else {
            showError('Could not parse Google Maps link. Try copying the coordinates instead.');
            return null;
        }
    }

    onMapClick(coords, latlng) {
        if (this.currentTab === 'coords') {
            document.getElementById('searchInput').value = coords;
        }
    }

    getCurrentTab() {
        return this.currentTab;
    }
}