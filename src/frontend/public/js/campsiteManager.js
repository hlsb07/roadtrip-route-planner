import { ApiService } from './api.js';
import { showSuccess, showError } from './utils.js';
import { CONFIG } from './config.js';

export class CampsiteManager {
    constructor(onUpdate = null) {
        this.campsites = [];
        this.onUpdate = onUpdate;
        this.selectedIndex = null;
    }

    async loadCampsites() {
        try {
            this.campsites = await ApiService.getAllCampsites();
            this.updateCampsitesList();
            if (this.onUpdate) {
                this.onUpdate();
            }
            return this.campsites;
        } catch (error) {
            console.error('Failed to load campsites:', error);
            showError('Failed to load campsites');
            return [];
        }
    }

    updateCampsitesList() {
        const campsitesList = document.getElementById('campsitesList');
        const mobileCampsitesList = document.querySelector('#mobilePanelContent .campsites-list');

        if (!campsitesList && !mobileCampsitesList) {
            console.warn('Campsites list elements not found');
            return;
        }

        const noCampsitesContent = `
            <div style="text-align: center; padding: 40px; color: #999;">
                <i class="fas fa-campground" style="font-size: 2rem; margin-bottom: 10px; opacity: 0.5;"></i><br>
                No campsites available yet.<br>
                Campsites will appear here once added.
            </div>`;

        if (this.campsites.length === 0) {
            if (campsitesList) campsitesList.innerHTML = noCampsitesContent;
            if (mobileCampsitesList) mobileCampsitesList.innerHTML = noCampsitesContent;
            return;
        }

        const campsitesHTML = this.campsites.map((campsite, index) => {
            // Get the first type icon if available
            const firstType = campsite.types && campsite.types.length > 0 ? campsite.types[0] : null;
            const typeIcon = firstType ? firstType.name : 'Campsite';

            // Get rating display
            const ratingDisplay = campsite.rating ?
                `<span style="color: #f39c12;"><i class="fas fa-star"></i> ${campsite.rating.toFixed(1)}</span>` :
                '<span style="color: #999;">No rating</span>';

            return `
                <div class="place-item ${this.selectedIndex === index ? 'selected' : ''}"
                     data-index="${index}"
                     onclick="window.app?.selectCampsite(${index})">
                    <div class="place-header">
                        <div class="place-number" style="background: linear-gradient(135deg, #2A9D8F, #3EBBA5);">
                            <i class="fas fa-campground"></i>
                        </div>
                        <div class="place-name">${campsite.name || 'Unnamed Campsite'}</div>
                    </div>
                    <div style="padding: 5px 0; font-size: 0.85rem; color: #666;">
                        <div style="margin-bottom: 3px;">
                            <i class="fas fa-tag" style="width: 16px;"></i> ${typeIcon}
                        </div>
                        <div style="margin-bottom: 3px;">
                            ${ratingDisplay}
                        </div>
                        ${campsite.price ? `<div><i class="fas fa-dollar-sign" style="width: 16px;"></i> ${campsite.price}</div>` : ''}
                    </div>
                    <div class="place-links">
                        <a href="https://www.google.com/maps/search/?api=1&query=${campsite.latitude},${campsite.longitude}"
                           target="_blank"
                           class="link-btn google-maps"
                           onclick="event.stopPropagation()">
                            <i class="fas fa-map"></i> Maps
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
        }).join('');

        if (campsitesList) campsitesList.innerHTML = campsitesHTML;
        if (mobileCampsitesList) mobileCampsitesList.innerHTML = campsitesHTML;
    }

    getCampsites() {
        return this.campsites;
    }

    selectCampsite(index) {
        if (index < 0 || index >= this.campsites.length) return;
        this.selectedIndex = index;
        this.updateCampsitesList();

        // Scroll to the selected campsite in the list
        setTimeout(() => {
            const selectedElement = document.querySelector(`.place-item[data-index="${index}"]`);
            if (selectedElement) {
                selectedElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }, 100);
    }

    deselectCampsite() {
        this.selectedIndex = null;
        this.updateCampsitesList();
    }

    async searchCampsites(query) {
        try {
            return await ApiService.searchCampsites(query);
        } catch (error) {
            console.error('Failed to search campsites:', error);
            showError('Failed to search campsites');
            return [];
        }
    }
}
