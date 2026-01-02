import { AuthManager } from './authManager.js';

/**
 * Login Modal Manager
 * Handles login modal UI and authentication flow
 */
export class LoginModal {
    constructor() {
        this.modal = null;
        this.emailInput = null;
        this.passwordInput = null;
        this.loginButton = null;
        this.errorMessage = null;
        this.closeButton = null;
        this.onLoginSuccess = null;
    }

    /**
     * Initialize the login modal
     * @param {Function} onLoginSuccess - Callback function called after successful login
     */
    init(onLoginSuccess) {
        this.onLoginSuccess = onLoginSuccess;
        this.modal = document.getElementById('login-modal');
        this.emailInput = document.getElementById('login-email');
        this.passwordInput = document.getElementById('login-password');
        this.loginButton = document.getElementById('login-submit');
        this.errorMessage = document.getElementById('login-error');
        this.closeButton = document.getElementById('login-close');

        if (!this.modal) {
            console.error('Login modal not found in DOM');
            return;
        }

        this.setupEventListeners();
    }

    /**
     * Setup event listeners for the login modal
     */
    setupEventListeners() {
        // Login button click
        if (this.loginButton) {
            this.loginButton.addEventListener('click', () => this.handleLogin());
        }

        // Enter key in password field
        if (this.passwordInput) {
            this.passwordInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleLogin();
                }
            });
        }

        // Close button
        if (this.closeButton) {
            this.closeButton.addEventListener('click', () => this.hide());
        }

        // Click outside modal to close
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.hide();
            }
        });

        // Escape key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible()) {
                this.hide();
            }
        });
    }

    /**
     * Handle login form submission
     */
    async handleLogin() {
        const email = this.emailInput?.value.trim();
        const password = this.passwordInput?.value;

        // Validation
        if (!email || !password) {
            this.showError('Please enter both email and password');
            return;
        }

        // Disable button during login
        if (this.loginButton) {
            this.loginButton.disabled = true;
            this.loginButton.textContent = 'Logging in...';
        }

        this.clearError();

        try {
            // Attempt login
            await AuthManager.login(email, password);

            // Success - hide modal and call success callback
            this.hide();
            this.clearForm();

            if (this.onLoginSuccess) {
                this.onLoginSuccess();
            }

        } catch (error) {
            console.error('Login failed:', error);
            this.showError(error.message || 'Login failed. Please check your credentials.');
        } finally {
            // Re-enable button
            if (this.loginButton) {
                this.loginButton.disabled = false;
                this.loginButton.textContent = 'Login';
            }
        }
    }

    /**
     * Show the login modal
     */
    show() {
        if (this.modal) {
            this.modal.style.display = 'flex';
            // Focus email input
            setTimeout(() => {
                if (this.emailInput) {
                    this.emailInput.focus();
                }
            }, 100);
        }
    }

    /**
     * Hide the login modal
     */
    hide() {
        if (this.modal) {
            this.modal.style.display = 'none';
            this.clearError();
        }
    }

    /**
     * Check if modal is visible
     */
    isVisible() {
        return this.modal && this.modal.style.display === 'flex';
    }

    /**
     * Show error message
     * @param {string} message - Error message to display
     */
    showError(message) {
        if (this.errorMessage) {
            this.errorMessage.textContent = message;
            this.errorMessage.style.display = 'block';
        }
    }

    /**
     * Clear error message
     */
    clearError() {
        if (this.errorMessage) {
            this.errorMessage.textContent = '';
            this.errorMessage.style.display = 'none';
        }
    }

    /**
     * Clear login form
     */
    clearForm() {
        if (this.emailInput) this.emailInput.value = '';
        if (this.passwordInput) this.passwordInput.value = '';
        this.clearError();
    }
}
