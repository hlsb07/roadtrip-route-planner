import { showConfirm } from '../utils.js';

/**
 * Conflict UI Manager - Handles visual indicators and user prompts for timeline/route conflicts
 */
export class ConflictUIManager {
    constructor() {
        this.activeConflicts = null;
        this.barElsByIndex = null;
    }

    /**
     * Show conflict warning banner at top of timeline
     * @param {Object} conflictInfo - Conflict information from backend
     * @param {Function} onResolve - Callback when user clicks "Reorder Route"
     * @param {Function} onDismiss - Callback when user clicks "Ignore"
     */
    showConflictBanner(conflictInfo, onResolve, onDismiss) {
        const banner = document.getElementById('conflictBanner') || this.createBanner();

        const conflictCount = conflictInfo.conflictingStops?.length || 0;

        banner.innerHTML = `
            <div class="conflict-banner-content">
                <i class="fas fa-exclamation-triangle"></i>
                <span class="conflict-message">
                    ${conflictCount} stop${conflictCount !== 1 ? 's' : ''}
                    ${conflictCount !== 1 ? 'have' : 'has'} timeline times
                    that don't match the route order
                </span>
                <div class="conflict-actions">
                    <button class="btn btn-primary btn-sm" id="resolveConflictBtn">
                        Reorder Route
                    </button>
                    <button class="btn btn-secondary btn-sm" id="dismissConflictBtn">
                        Ignore
                    </button>
                </div>
            </div>
        `;

        banner.classList.add('visible');

        document.getElementById('resolveConflictBtn').onclick = onResolve;
        document.getElementById('dismissConflictBtn').onclick = onDismiss;
    }

    /**
     * Hide conflict banner
     */
    hideConflictBanner() {
        const banner = document.getElementById('conflictBanner');
        if (banner) {
            banner.classList.remove('visible');
        }
    }

    /**
     * Create banner DOM element if it doesn't exist
     * @returns {HTMLElement} The banner element
     */
    createBanner() {
        const banner = document.createElement('div');
        banner.id = 'conflictBanner';
        banner.className = 'conflict-banner';

        const timelinePanel = document.getElementById('timelinePanel');
        if (timelinePanel) {
            timelinePanel.insertBefore(banner, timelinePanel.firstChild);
        }

        return banner;
    }

    /**
     * Mark specific timeline bars with conflict indicators
     * @param {Array} conflictingStops - Array of conflicting stop info
     * @param {Map} barElsByIndex - Map of bar elements by index
     * @param {Array} timelineStops - Array of timeline stop data
     */
    markConflictingBars(conflictingStops, barElsByIndex, timelineStops) {
        // Clear existing conflict markers
        document.querySelectorAll('.gantt-bar.conflict').forEach(bar => {
            bar.classList.remove('conflict');
            const tooltip = bar.querySelector('.conflict-tooltip');
            if (tooltip) {
                tooltip.remove();
            }
        });

        // Mark conflicting bars
        conflictingStops.forEach(stop => {
            const index = timelineStops.findIndex(s => s.routePlaceId === stop.routePlaceId);
            if (index !== -1) {
                const barEl = barElsByIndex.get(index);
                if (barEl) {
                    barEl.classList.add('conflict');

                    // Add tooltip
                    const tooltip = document.createElement('div');
                    tooltip.className = 'conflict-tooltip';
                    tooltip.innerHTML = `
                        <i class="fas fa-exclamation-triangle"></i>
                        Time order conflicts with route position
                    `;
                    barEl.appendChild(tooltip);
                }
            }
        });
    }

    /**
     * Show confirmation dialog for schedule change conflicts
     * @param {Object} conflictInfo - Conflict information
     * @returns {Promise<boolean>} True if user wants to reorder, false otherwise
     */
    async showScheduleChangeConflictPrompt(conflictInfo) {
        const message = `
Changing this time would move "${conflictInfo.placeName}" from
position ${conflictInfo.currentOrderIndex + 1} to position ${conflictInfo.newTimePosition + 1}
in the route order.

Would you like to reorder the route to match the new timeline?
        `;

        return await showConfirm(
            'Timeline Order Conflict',
            message,
            {
                confirmText: 'Reorder Route',
                cancelText: 'Keep Time Only',
                dangerButton: false
            }
        );
    }

    /**
     * Show success message for conflict resolution
     * @param {string} message - Success message to display
     */
    showResolutionSuccess(message = 'Route order updated to match timeline') {
        const toast = document.createElement('div');
        toast.className = 'toast success';
        toast.innerHTML = `
            <i class="fas fa-check-circle"></i>
            ${message}
        `;

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('visible');
        }, 10);

        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}
