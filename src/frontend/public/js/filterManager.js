import { ApiService } from './api.js';

/**
 * FilterManager - Manages category and country filtering for places on the map
 */
export class FilterManager {
    constructor() {
        this.categories = [];
        this.countries = [];
        this.allPlaces = [];
        this.selectedCategories = new Set();
        this.selectedCountries = new Set();
        this.filterScope = 'both'; // 'route' | 'all' | 'both'
        this.onFilterChangeCallback = null;
    }

    /**
     * Initialize the filter manager by loading categories and countries
     */
    async init() {
        try {
            [this.categories, this.countries, this.allPlaces] = await Promise.all([
                ApiService.getAllCategories(),
                ApiService.getAllCountries(),
                ApiService.getAllPlaces()
            ]);

            console.log('Filters initialized:', {
                categories: this.categories.length,
                countries: this.countries.length,
                places: this.allPlaces.length
            });

            this.renderFilters();
        } catch (error) {
            console.error('Failed to initialize filters:', error);
            throw error;
        }
    }

    /**
     * Set callback for when filters change
     */
    onFilterChange(callback) {
        this.onFilterChangeCallback = callback;
    }

    /**
     * Render filter UI in both desktop and mobile views
     */
    renderFilters() {
        // Render desktop filters
        const desktopFilterContainer = document.getElementById('desktopFilters');
        if (desktopFilterContainer) {
            desktopFilterContainer.innerHTML = this.generateFilterHTML();
            this.attachFilterEventListeners(desktopFilterContainer);
        }

        // Render mobile filters
        const mobileFilterContainer = document.getElementById('mobileFilters');
        if (mobileFilterContainer) {
            mobileFilterContainer.innerHTML = this.generateFilterHTML();
            this.attachFilterEventListeners(mobileFilterContainer);
        }
    }

    /**
     * Generate HTML for filter UI
     */
    generateFilterHTML() {
        return `
            <div class="filter-section">
                <div class="filter-header">
                    <h3><i class="fas fa-filter"></i> Filters</h3>
                    <button class="btn-text" onclick="window.filterManager.clearAllFilters()">
                        Clear All
                    </button>
                </div>

                <!-- Filter Scope Toggle -->
                <div class="filter-group scope-toggle">
                    <div class="filter-group-header">
                        <h4><i class="fas fa-layer-group"></i> Show Places</h4>
                    </div>
                    <div class="scope-options">
                        <label class="scope-option">
                            <input
                                type="radio"
                                name="filterScope"
                                value="route"
                                ${this.filterScope === 'route' ? 'checked' : ''}
                                onchange="window.filterManager.setFilterScope('route')"
                            >
                            <span>Route Places Only</span>
                        </label>
                        <label class="scope-option">
                            <input
                                type="radio"
                                name="filterScope"
                                value="all"
                                ${this.filterScope === 'all' ? 'checked' : ''}
                                onchange="window.filterManager.setFilterScope('all')"
                            >
                            <span>All Places (Not in Route)</span>
                        </label>
                        <label class="scope-option">
                            <input
                                type="radio"
                                name="filterScope"
                                value="both"
                                ${this.filterScope === 'both' ? 'checked' : ''}
                                onchange="window.filterManager.setFilterScope('both')"
                            >
                            <span>Both</span>
                        </label>
                    </div>
                </div>

                <!-- Category Filters -->
                <div class="filter-group">
                    <div class="filter-group-header" onclick="this.parentElement.classList.toggle('collapsed')">
                        <h4><i class="fas fa-tag"></i> Categories</h4>
                        <i class="fas fa-chevron-down toggle-icon"></i>
                    </div>
                    <div class="filter-options">
                        ${this.categories.map(cat => `
                            <label class="filter-option" data-category-id="${cat.id}">
                                <input
                                    type="checkbox"
                                    class="filter-checkbox"
                                    data-type="category"
                                    data-id="${cat.id}"
                                    ${this.selectedCategories.has(cat.id) ? 'checked' : ''}
                                >
                                <span class="filter-icon">${cat.icon || '📍'}</span>
                                <span class="filter-name">${cat.name}</span>
                                <span class="filter-count">${this.getPlaceCountForCategory(cat.id)}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>

                <!-- Country Filters -->
                <div class="filter-group">
                    <div class="filter-group-header" onclick="this.parentElement.classList.toggle('collapsed')">
                        <h4><i class="fas fa-globe"></i> Countries</h4>
                        <i class="fas fa-chevron-down toggle-icon"></i>
                    </div>
                    <div class="filter-options">
                        ${this.countries.map(country => `
                            <label class="filter-option" data-country-id="${country.id}">
                                <input
                                    type="checkbox"
                                    class="filter-checkbox"
                                    data-type="country"
                                    data-id="${country.id}"
                                    ${this.selectedCountries.has(country.id) ? 'checked' : ''}
                                >
                                <span class="filter-icon">${country.icon || '🌍'}</span>
                                <span class="filter-name">${country.name}</span>
                                <span class="filter-count">${this.getPlaceCountForCountry(country.id)}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>

                <!-- Active Filters Summary -->
                ${this.getActiveFilterCount() > 0 ? `
                    <div class="active-filters-summary">
                        <i class="fas fa-info-circle"></i>
                        ${this.getActiveFilterCount()} filter(s) active
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Attach event listeners to filter checkboxes
     */
    attachFilterEventListeners(container) {
        const checkboxes = container.querySelectorAll('.filter-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const type = e.target.dataset.type;
                const id = parseInt(e.target.dataset.id);

                if (type === 'category') {
                    if (e.target.checked) {
                        this.selectedCategories.add(id);
                    } else {
                        this.selectedCategories.delete(id);
                    }
                } else if (type === 'country') {
                    if (e.target.checked) {
                        this.selectedCountries.add(id);
                    } else {
                        this.selectedCountries.delete(id);
                    }
                }

                this.applyFilters();
            });
        });
    }

    /**
     * Set filter scope (route, all, or both)
     */
    setFilterScope(scope) {
        this.filterScope = scope;
        this.applyFilters();
    }

    /**
     * Get filtered places based on selected categories, countries, and scope
     * Returns an object with { routePlaces, nonRoutePlaces, allFiltered }
     */
    getFilteredPlaces(currentRoutePlaces = []) {
        // Get current route place IDs for separation
        const routePlaceIds = new Set(currentRoutePlaces.map(p => p.id));

        // Apply category and country filters to all places
        const filteredPlaces = this.allPlaces.filter(place => {
            // If no filters are active, include all places
            if (this.selectedCategories.size === 0 && this.selectedCountries.size === 0) {
                return true;
            }

            let categoryMatch = this.selectedCategories.size === 0;
            let countryMatch = this.selectedCountries.size === 0;

            // Check if place has any selected categories
            if (this.selectedCategories.size > 0 && place.categories) {
                categoryMatch = place.categories.some(cat =>
                    this.selectedCategories.has(cat.id)
                );
            }

            // Check if place has any selected countries
            if (this.selectedCountries.size > 0 && place.countries) {
                countryMatch = place.countries.some(country =>
                    this.selectedCountries.has(country.id)
                );
            }

            // Place must match both category AND country filters (if active)
            return categoryMatch && countryMatch;
        });

        // Separate into route and non-route places
        const routePlaces = filteredPlaces.filter(p => routePlaceIds.has(p.id));
        const nonRoutePlaces = filteredPlaces.filter(p => !routePlaceIds.has(p.id));

        return {
            routePlaces,
            nonRoutePlaces,
            allFiltered: filteredPlaces
        };
    }

    /**
     * Apply current filters and trigger callback
     * Requires current route places to be passed for proper separation
     */
    applyFilters(currentRoutePlaces = []) {
        const filtered = this.getFilteredPlaces(currentRoutePlaces);

        // Update UI to show filter counts
        this.updateFilterCounts();

        if (this.onFilterChangeCallback) {
            this.onFilterChangeCallback(filtered, this.filterScope);
        }

        console.log('Filters applied:', {
            scope: this.filterScope,
            categories: Array.from(this.selectedCategories),
            countries: Array.from(this.selectedCountries),
            routePlacesCount: filtered.routePlaces.length,
            nonRoutePlacesCount: filtered.nonRoutePlaces.length
        });
    }

    /**
     * Clear all active filters
     */
    clearAllFilters() {
        this.selectedCategories.clear();
        this.selectedCountries.clear();

        // Uncheck all checkboxes
        document.querySelectorAll('.filter-checkbox').forEach(checkbox => {
            checkbox.checked = false;
        });

        this.applyFilters();
        this.renderFilters(); // Re-render to update counts and summary
    }

    /**
     * Get count of places for a specific category
     */
    getPlaceCountForCategory(categoryId) {
        return this.allPlaces.filter(place =>
            place.categories && place.categories.some(cat => cat.id === categoryId)
        ).length;
    }

    /**
     * Get count of places for a specific country
     */
    getPlaceCountForCountry(countryId) {
        return this.allPlaces.filter(place =>
            place.countries && place.countries.some(country => country.id === countryId)
        ).length;
    }

    /**
     * Get total count of active filters
     */
    getActiveFilterCount() {
        return this.selectedCategories.size + this.selectedCountries.size;
    }

    /**
     * Update filter counts in the UI
     */
    updateFilterCounts(currentRoutePlaces = []) {
        // Update the active filters summary in both desktop and mobile
        const summaries = document.querySelectorAll('.active-filters-summary');
        const filtered = this.getFilteredPlaces(currentRoutePlaces);

        summaries.forEach(summary => {
            const count = this.getActiveFilterCount();
            if (count > 0 || this.filterScope !== 'both') {
                const scopeText = this.filterScope === 'route' ? ' (route places)' :
                                 this.filterScope === 'all' ? ' (non-route places)' : '';
                const totalCount = this.filterScope === 'route' ? filtered.routePlaces.length :
                                  this.filterScope === 'all' ? filtered.nonRoutePlaces.length :
                                  filtered.allFiltered.length;

                summary.innerHTML = `
                    <i class="fas fa-info-circle"></i>
                    ${count} filter(s) active${scopeText} - ${totalCount} places shown
                `;
                summary.style.display = 'block';
            } else {
                summary.style.display = 'none';
            }
        });
    }

    /**
     * Get category by ID
     */
    getCategoryById(id) {
        return this.categories.find(cat => cat.id === id);
    }

    /**
     * Get country by ID
     */
    getCountryById(id) {
        return this.countries.find(country => country.id === id);
    }

    /**
     * Refresh all places from API and apply filters (triggers map update)
     */
    async refreshPlaces(currentRoutePlaces = []) {
        try {
            this.allPlaces = await ApiService.getAllPlaces();
            this.applyFilters(currentRoutePlaces);
        } catch (error) {
            console.error('Failed to refresh places:', error);
        }
    }

    /**
     * Refresh places data silently without applying filters (no map update)
     * Use this when you just want to update the data without changing the map view
     */
    async refreshPlacesData(currentRoutePlaces = []) {
        try {
            this.allPlaces = await ApiService.getAllPlaces();
            // Only update filter counts, don't trigger map update
            this.updateFilterCounts(currentRoutePlaces);
        } catch (error) {
            console.error('Failed to refresh places data:', error);
        }
    }
}
