import { ApiService } from './api.js';
import { showSuccess, showError } from './utils.js';

/**
 * TagManager - Manages category and country tags with full CRUD operations
 */
export class TagManager {
    constructor() {
        this.categories = [];
        this.countries = [];
        this.currentEditType = null; // 'category' or 'country'
        this.currentEditId = null;
        this.currentDeleteType = null;
        this.currentDeleteId = null;
        this.emojis = this.getEmojiList();
        this.filteredEmojis = [...this.emojis];
    }

    /**
     * Load categories and countries from API
     */
    async loadTags() {
        try {
            [this.categories, this.countries] = await Promise.all([
                ApiService.getAllCategories(),
                ApiService.getAllCountries()
            ]);

            this.renderTags();
        } catch (error) {
            console.error('Failed to load tags:', error);
            showError('Failed to load tags');
        }
    }

    /**
     * Render tags in both tabs
     */
    renderTags() {
        this.renderCategoriesList();
        this.renderCountriesList();
    }

    /**
     * Render categories list
     */
    renderCategoriesList() {
        const list = document.getElementById('categoriesList');
        if (!list) return;

        if (this.categories.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-tag" style="font-size: 3rem; opacity: 0.3;"></i>
                    <p>No categories yet</p>
                    <p style="font-size: 0.9rem; opacity: 0.7;">Click "Add Category" to create one</p>
                </div>
            `;
            return;
        }

        const sortedCategories = [...this.categories].sort((a, b) => a.name.localeCompare(b.name));

        list.innerHTML = sortedCategories.map(cat => `
            <div class="tag-item" data-tag-id="${cat.id}">
                <div class="tag-icon">${cat.icon || '📍'}</div>
                <div class="tag-name">${cat.name}</div>
                <div class="tag-actions">
                    <button class="tag-action-btn edit-btn" onclick="tagManager.showEditTagModal('category', ${cat.id})" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="tag-action-btn delete-btn" onclick="tagManager.showDeleteTagModal('category', ${cat.id})" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    /**
     * Render countries list
     */
    renderCountriesList() {
        const list = document.getElementById('countriesList');
        if (!list) return;

        if (this.countries.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-flag" style="font-size: 3rem; opacity: 0.3;"></i>
                    <p>No countries yet</p>
                    <p style="font-size: 0.9rem; opacity: 0.7;">Click "Add Country" to create one</p>
                </div>
            `;
            return;
        }

        const sortedCountries = [...this.countries].sort((a, b) => a.name.localeCompare(b.name));

        list.innerHTML = sortedCountries.map(country => `
            <div class="tag-item" data-tag-id="${country.id}">
                <div class="tag-icon">${country.icon || '🌍'}</div>
                <div class="tag-name">${country.name}</div>
                <div class="tag-actions">
                    <button class="tag-action-btn edit-btn" onclick="tagManager.showEditTagModal('country', ${country.id})" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="tag-action-btn delete-btn" onclick="tagManager.showDeleteTagModal('country', ${country.id})" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    /**
     * Show create tag form (opens edit modal in create mode)
     */
    showCreateTagForm(type) {
        this.currentEditType = type;
        this.currentEditId = null;

        const modal = document.getElementById('editTagModal');
        const title = document.getElementById('editTagModalTitle');
        const nameInput = document.getElementById('tagName');
        const iconInput = document.getElementById('tagIcon');

        if (type === 'category') {
            title.innerHTML = '<i class="fas fa-plus"></i> Add Category';
        } else {
            title.innerHTML = '<i class="fas fa-plus"></i> Add Country';
        }

        nameInput.value = '';
        iconInput.value = '';

        modal.classList.add('active');
        nameInput.focus();
    }

    /**
     * Show edit tag modal
     */
    async showEditTagModal(type, id) {
        this.currentEditType = type;
        this.currentEditId = id;

        const modal = document.getElementById('editTagModal');
        const title = document.getElementById('editTagModalTitle');
        const nameInput = document.getElementById('tagName');
        const iconInput = document.getElementById('tagIcon');

        try {
            let tag;
            if (type === 'category') {
                tag = this.categories.find(c => c.id === id);
                title.innerHTML = '<i class="fas fa-edit"></i> Edit Category';
            } else {
                tag = this.countries.find(c => c.id === id);
                title.innerHTML = '<i class="fas fa-edit"></i> Edit Country';
            }

            if (!tag) {
                showError('Tag not found');
                return;
            }

            nameInput.value = tag.name;
            iconInput.value = tag.icon || '';

            modal.classList.add('active');
            nameInput.focus();
            nameInput.select();

        } catch (error) {
            console.error('Failed to load tag:', error);
            showError('Failed to load tag');
        }
    }

    /**
     * Save tag (create or update)
     */
    async saveTag() {
        const nameInput = document.getElementById('tagName');
        const iconInput = document.getElementById('tagIcon');

        const name = nameInput.value.trim();
        const icon = iconInput.value.trim();

        if (!name) {
            showError('Please enter a name');
            nameInput.focus();
            return;
        }

        try {
            if (this.currentEditId) {
                // Update existing tag
                if (this.currentEditType === 'category') {
                    await ApiService.updateCategory(this.currentEditId, name, icon);
                    showSuccess(`Updated category "${name}"`);
                } else {
                    await ApiService.updateCountry(this.currentEditId, name, icon);
                    showSuccess(`Updated country "${name}"`);
                }
            } else {
                // Create new tag
                if (this.currentEditType === 'category') {
                    await ApiService.createCategory(name, icon);
                    showSuccess(`Created category "${name}"`);
                } else {
                    await ApiService.createCountry(name, icon);
                    showSuccess(`Created country "${name}"`);
                }
            }

            // Reload tags and update UI
            await this.loadTags();

            // Refresh filters if available
            if (window.filterManager) {
                await window.filterManager.init();
            }

            // Close modal
            window.closeEditTagModal();

        } catch (error) {
            console.error('Failed to save tag:', error);
            showError(error.message || 'Failed to save tag');
        }
    }

    /**
     * Show delete tag modal with smart behavior
     */
    async showDeleteTagModal(type, id) {
        this.currentDeleteType = type;
        this.currentDeleteId = id;

        const modal = document.getElementById('deleteTagModal');
        const message = document.getElementById('deleteTagMessage');
        const placesList = document.getElementById('deleteTagPlacesList');
        const confirmBtn = document.getElementById('confirmDeleteTagBtn');

        try {
            // Get tag info and places using this tag
            let tag, places;

            if (type === 'category') {
                tag = this.categories.find(c => c.id === id);
                places = await ApiService.getPlacesByCategory(id);
            } else {
                tag = this.countries.find(c => c.id === id);
                places = await ApiService.getPlacesByCountry(id);
            }

            if (!tag) {
                showError('Tag not found');
                return;
            }

            // Scenario 1: No places using this tag
            if (places.length === 0) {
                message.innerHTML = `
                    Are you sure you want to delete <strong>"${tag.name}"</strong>?
                    <br><br>
                    This tag is not used by any places and can be safely deleted.
                `;
                placesList.style.display = 'none';
                confirmBtn.style.display = 'inline-flex';
            }
            // Scenario 2 & 3: Places are using this tag
            else {
                message.innerHTML = `
                    <strong>"${tag.name}"</strong> is currently used by <strong>${places.length}</strong> place${places.length > 1 ? 's' : ''}:
                `;
                placesList.style.display = 'block';
                placesList.innerHTML = `
                    <div class="delete-tag-places-scroll">
                        ${places.map(place => `
                            <div class="delete-tag-place-item">
                                <i class="fas fa-map-marker-alt"></i>
                                <span>${place.name}</span>
                            </div>
                        `).join('')}
                    </div>
                    <p style="margin-top: 15px; font-size: 0.9rem; color: #666;">
                        Deleting this tag will remove it from all these places. This cannot be undone.
                    </p>
                `;
                confirmBtn.style.display = 'inline-flex';
            }

            modal.classList.add('active');

        } catch (error) {
            console.error('Failed to check tag usage:', error);
            showError('Failed to check tag usage');
        }
    }

    /**
     * Confirm and execute tag deletion
     */
    async confirmDeleteTag() {
        if (!this.currentDeleteId || !this.currentDeleteType) return;

        const type = this.currentDeleteType;
        const id = this.currentDeleteId;

        try {
            let tagName;

            if (type === 'category') {
                const tag = this.categories.find(c => c.id === id);
                tagName = tag?.name || 'Category';
                await ApiService.deleteCategory(id);
            } else {
                const tag = this.countries.find(c => c.id === id);
                tagName = tag?.name || 'Country';
                await ApiService.deleteCountry(id);
            }

            showSuccess(`Deleted "${tagName}"`);

            // Reload tags and update UI
            await this.loadTags();

            // Refresh filters and all places if available
            if (window.filterManager) {
                await window.filterManager.init();
            }

            if (window.allPlacesManager) {
                window.allPlacesManager.updateAllPlacesList();
            }

            // Close modal
            window.closeDeleteTagModal();

        } catch (error) {
            console.error('Failed to delete tag:', error);
            showError(error.message || 'Failed to delete tag');
        }
    }

    /**
     * Initialize emoji picker
     */
    initEmojiPicker() {
        const grid = document.getElementById('emojiPickerGrid');
        const searchInput = document.getElementById('emojiSearch');

        if (!grid) return;

        // Render emojis
        this.renderEmojis();

        // Setup search listener (only once)
        if (searchInput && !searchInput.dataset.listenerAttached) {
            searchInput.addEventListener('input', (e) => {
                this.searchEmojis(e.target.value);
            });
            searchInput.dataset.listenerAttached = 'true';
        }
    }

    /**
     * Render emojis in grid
     */
    renderEmojis() {
        const grid = document.getElementById('emojiPickerGrid');
        if (!grid) return;

        grid.innerHTML = this.filteredEmojis.map(emoji => `
            <button class="emoji-btn" onclick="tagManager.selectEmoji('${emoji.char}')" title="${emoji.name}">
                ${emoji.char}
            </button>
        `).join('');
    }

    /**
     * Select emoji
     */
    selectEmoji(emoji) {
        const iconInput = document.getElementById('tagIcon');
        if (iconInput) {
            iconInput.value = emoji;
        }

        // Close emoji picker
        const emojiPicker = document.getElementById('emojiPicker');
        if (emojiPicker) {
            emojiPicker.style.display = 'none';
        }
    }

    /**
     * Search emojis
     */
    searchEmojis(query) {
        const lowerQuery = query.toLowerCase().trim();

        if (!lowerQuery) {
            this.filteredEmojis = [...this.emojis];
        } else {
            this.filteredEmojis = this.emojis.filter(emoji =>
                emoji.name.toLowerCase().includes(lowerQuery)
            );
        }

        this.renderEmojis();
    }

    /**
     * Filter emojis by category
     */
    filterEmojis(category) {
        if (category === 'all') {
            this.filteredEmojis = [...this.emojis];
        } else {
            this.filteredEmojis = this.emojis.filter(emoji => emoji.category === category);
        }

        // Clear search
        const searchInput = document.getElementById('emojiSearch');
        if (searchInput) searchInput.value = '';

        this.renderEmojis();
    }

    /**
     * Get comprehensive emoji list
     */
    getEmojiList() {
        return [
            // Smileys & Emotion
            { char: '😀', name: 'grinning face', category: 'smileys' },
            { char: '😃', name: 'grinning face with big eyes', category: 'smileys' },
            { char: '😄', name: 'grinning face with smiling eyes', category: 'smileys' },
            { char: '😁', name: 'beaming face with smiling eyes', category: 'smileys' },
            { char: '😊', name: 'smiling face with smiling eyes', category: 'smileys' },
            { char: '😍', name: 'smiling face with heart-eyes', category: 'smileys' },
            { char: '🤩', name: 'star-struck', category: 'smileys' },
            { char: '😎', name: 'smiling face with sunglasses', category: 'smileys' },

            // Nature & Animals
            { char: '🌲', name: 'evergreen tree', category: 'nature' },
            { char: '🌳', name: 'deciduous tree', category: 'nature' },
            { char: '🌴', name: 'palm tree', category: 'nature' },
            { char: '🌿', name: 'herb', category: 'nature' },
            { char: '🍀', name: 'four leaf clover', category: 'nature' },
            { char: '🌺', name: 'hibiscus', category: 'nature' },
            { char: '🌻', name: 'sunflower', category: 'nature' },
            { char: '🌸', name: 'cherry blossom', category: 'nature' },
            { char: '🏔️', name: 'snow-capped mountain', category: 'nature' },
            { char: '⛰️', name: 'mountain', category: 'nature' },
            { char: '🌊', name: 'water wave', category: 'nature' },
            { char: '🏖️', name: 'beach with umbrella', category: 'nature' },

            // Food & Drink
            { char: '🍕', name: 'pizza', category: 'food' },
            { char: '🍔', name: 'hamburger', category: 'food' },
            { char: '🍟', name: 'french fries', category: 'food' },
            { char: '🍰', name: 'shortcake', category: 'food' },
            { char: '☕', name: 'coffee', category: 'food' },
            { char: '🍺', name: 'beer mug', category: 'food' },
            { char: '🍷', name: 'wine glass', category: 'food' },
            { char: '🍎', name: 'red apple', category: 'food' },

            // Activity & Sports
            { char: '⚽', name: 'soccer ball', category: 'activities' },
            { char: '🏀', name: 'basketball', category: 'activities' },
            { char: '🎾', name: 'tennis', category: 'activities' },
            { char: '🏊', name: 'person swimming', category: 'activities' },
            { char: '🏄', name: 'person surfing', category: 'activities' },
            { char: '🚴', name: 'person biking', category: 'activities' },
            { char: '🎿', name: 'skis', category: 'activities' },
            { char: '⛷️', name: 'skier', category: 'activities' },

            // Travel & Places
            { char: '✈️', name: 'airplane', category: 'travel' },
            { char: '🚗', name: 'car', category: 'travel' },
            { char: '🚙', name: 'sport utility vehicle', category: 'travel' },
            { char: '🚌', name: 'bus', category: 'travel' },
            { char: '🚂', name: 'locomotive', category: 'travel' },
            { char: '⛵', name: 'sailboat', category: 'travel' },
            { char: '🚢', name: 'ship', category: 'travel' },
            { char: '🏨', name: 'hotel', category: 'travel' },
            { char: '🏰', name: 'castle', category: 'travel' },
            { char: '🏛️', name: 'classical building', category: 'travel' },
            { char: '🗼', name: 'tokyo tower', category: 'travel' },
            { char: '🗽', name: 'statue of liberty', category: 'travel' },
            { char: '⛪', name: 'church', category: 'travel' },
            { char: '🕌', name: 'mosque', category: 'travel' },
            { char: '🏕️', name: 'camping', category: 'travel' },
            { char: '⛺', name: 'tent', category: 'travel' },
            { char: '🏖️', name: 'beach', category: 'travel' },
            { char: '🏝️', name: 'desert island', category: 'travel' },

            // Objects
            { char: '💡', name: 'light bulb', category: 'objects' },
            { char: '📍', name: 'round pushpin', category: 'objects' },
            { char: '📌', name: 'pushpin', category: 'objects' },
            { char: '📷', name: 'camera', category: 'objects' },
            { char: '📱', name: 'mobile phone', category: 'objects' },
            { char: '💻', name: 'laptop', category: 'objects' },
            { char: '📚', name: 'books', category: 'objects' },
            { char: '🎵', name: 'musical note', category: 'objects' },

            // Symbols
            { char: '❤️', name: 'red heart', category: 'symbols' },
            { char: '💙', name: 'blue heart', category: 'symbols' },
            { char: '💚', name: 'green heart', category: 'symbols' },
            { char: '💛', name: 'yellow heart', category: 'symbols' },
            { char: '⭐', name: 'star', category: 'symbols' },
            { char: '✨', name: 'sparkles', category: 'symbols' },
            { char: '🔥', name: 'fire', category: 'symbols' },
            { char: '💫', name: 'dizzy', category: 'symbols' },

            // Flags
            { char: '🏁', name: 'chequered flag', category: 'flags' },
            { char: '🇩🇪', name: 'germany', category: 'flags' },
            { char: '🇫🇷', name: 'france', category: 'flags' },
            { char: '🇪🇸', name: 'spain', category: 'flags' },
            { char: '🇮🇹', name: 'italy', category: 'flags' },
            { char: '🇬🇧', name: 'united kingdom', category: 'flags' },
            { char: '🇺🇸', name: 'united states', category: 'flags' },
            { char: '🇨🇦', name: 'canada', category: 'flags' },
            { char: '🇯🇵', name: 'japan', category: 'flags' },
            { char: '🇨🇳', name: 'china', category: 'flags' },
            { char: '🇦🇺', name: 'australia', category: 'flags' },
            { char: '🇧🇷', name: 'brazil', category: 'flags' },
            { char: '🇲🇽', name: 'mexico', category: 'flags' },
            { char: '🌍', name: 'globe showing europe africa', category: 'flags' },
            { char: '🌎', name: 'globe showing americas', category: 'flags' },
            { char: '🌏', name: 'globe showing asia australia', category: 'flags' }
        ];
    }
}
