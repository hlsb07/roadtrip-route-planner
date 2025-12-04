/**
 * NotificationManager - Modern toast notification and confirmation dialog system
 * Replaces browser alerts and confirms with beautiful, non-intrusive notifications
 */
export class NotificationManager {
    constructor() {
        this.container = null;
        this.toasts = [];
        this.init();
    }

    init() {
        // Create notification container
        this.container = document.createElement('div');
        this.container.className = 'notification-container';
        document.body.appendChild(this.container);
    }

    /**
     * Show a toast notification
     * @param {string} message - The message to display
     * @param {string} type - Type of notification: 'success', 'error', 'info', 'warning'
     * @param {number} duration - Auto-dismiss duration in ms (0 = no auto-dismiss)
     */
    showToast(message, type = 'info', duration = 4000) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icon = this.getIcon(type);

        toast.innerHTML = `
            <div class="toast-icon">
                <i class="fas ${icon}"></i>
            </div>
            <div class="toast-content">
                <div class="toast-message">${this.escapeHtml(message)}</div>
            </div>
            <button class="toast-close" aria-label="Close">
                <i class="fas fa-times"></i>
            </button>
        `;

        // Add close button handler
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => this.hideToast(toast));

        // Add to container and track
        this.container.appendChild(toast);
        this.toasts.push(toast);

        // Trigger animation
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // Auto-dismiss if duration is set
        if (duration > 0) {
            // Add progress bar
            const progress = document.createElement('div');
            progress.className = 'toast-progress';
            progress.style.width = '100%';
            toast.appendChild(progress);

            // Animate progress bar
            requestAnimationFrame(() => {
                progress.style.transitionDuration = `${duration}ms`;
                progress.style.width = '0%';
            });

            // Auto-remove after duration
            setTimeout(() => {
                this.hideToast(toast);
            }, duration);
        }

        return toast;
    }

    /**
     * Hide and remove a toast
     */
    hideToast(toast) {
        if (!toast || !toast.classList.contains('show')) return;

        toast.classList.remove('show');
        toast.classList.add('hide');

        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
            const index = this.toasts.indexOf(toast);
            if (index > -1) {
                this.toasts.splice(index, 1);
            }
        }, 300);
    }

    /**
     * Show success notification
     */
    success(message, duration = 3000) {
        return this.showToast(message, 'success', duration);
    }

    /**
     * Show error notification
     */
    error(message, duration = 5000) {
        return this.showToast(message, 'error', duration);
    }

    /**
     * Show info notification
     */
    info(message, duration = 4000) {
        return this.showToast(message, 'info', duration);
    }

    /**
     * Show warning notification
     */
    warning(message, duration = 4000) {
        return this.showToast(message, 'warning', duration);
    }

    /**
     * Show confirmation dialog
     * @param {Object} options - Configuration object
     * @param {string} options.title - Dialog title
     * @param {string} options.message - Dialog message
     * @param {string} options.type - Dialog type: 'question', 'warning', 'danger'
     * @param {string} options.confirmText - Confirm button text
     * @param {string} options.cancelText - Cancel button text
     * @returns {Promise<boolean>} - Resolves to true if confirmed, false if cancelled
     */
    confirm({
        title = 'Confirm Action',
        message = 'Are you sure?',
        type = 'question',
        confirmText = 'Confirm',
        cancelText = 'Cancel'
    } = {}) {
        return new Promise((resolve) => {
            // Create overlay
            const overlay = document.createElement('div');
            overlay.className = 'confirm-overlay';

            const icon = this.getConfirmIcon(type);

            overlay.innerHTML = `
                <div class="confirm-dialog">
                    <div class="confirm-header">
                        <div class="confirm-icon ${type}">
                            <i class="fas ${icon}"></i>
                        </div>
                        <div class="confirm-title">${this.escapeHtml(title)}</div>
                    </div>
                    <div class="confirm-message">${this.escapeHtml(message)}</div>
                    <div class="confirm-actions">
                        <button class="confirm-btn cancel">${this.escapeHtml(cancelText)}</button>
                        <button class="confirm-btn confirm ${type === 'danger' ? 'danger' : ''}">${this.escapeHtml(confirmText)}</button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            // Show with animation
            requestAnimationFrame(() => {
                overlay.classList.add('show');
            });

            const cleanup = (result) => {
                overlay.classList.remove('show');
                setTimeout(() => {
                    if (overlay.parentNode) {
                        overlay.parentNode.removeChild(overlay);
                    }
                }, 300);
                resolve(result);
            };

            // Handle button clicks
            overlay.querySelector('.confirm-btn.cancel').addEventListener('click', () => cleanup(false));
            overlay.querySelector('.confirm-btn.confirm').addEventListener('click', () => cleanup(true));

            // Handle overlay click (close on background click)
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    cleanup(false);
                }
            });

            // Handle Escape key
            const escapeHandler = (e) => {
                if (e.key === 'Escape') {
                    cleanup(false);
                    document.removeEventListener('keydown', escapeHandler);
                }
            };
            document.addEventListener('keydown', escapeHandler);
        });
    }

    /**
     * Get icon for toast type
     */
    getIcon(type) {
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            info: 'fa-info-circle',
            warning: 'fa-exclamation-triangle'
        };
        return icons[type] || icons.info;
    }

    /**
     * Get icon for confirmation dialog type
     */
    getConfirmIcon(type) {
        const icons = {
            question: 'fa-question-circle',
            warning: 'fa-exclamation-triangle',
            danger: 'fa-exclamation-triangle'
        };
        return icons[type] || icons.question;
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Clear all toasts
     */
    clearAll() {
        this.toasts.forEach(toast => this.hideToast(toast));
    }
}

// Create singleton instance
export const notificationManager = new NotificationManager();
