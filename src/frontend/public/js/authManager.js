import { CONFIG } from './config.js';

/**
 * Authentication Manager
 * Handles JWT token storage, refresh, and authentication state
 */
export class AuthManager {
    static TOKEN_KEY = 'auth_access_token';
    static REFRESH_TOKEN_KEY = 'auth_refresh_token';
    static TOKEN_EXPIRY_KEY = 'auth_token_expiry';
    static USER_KEY = 'auth_user';

    /**
     * Check if user is authenticated (has valid token)
     */
    static isAuthenticated() {
        const token = this.getAccessToken();
        const expiry = this.getTokenExpiry();

        if (!token || !expiry) {
            return false;
        }

        // Check if token is expired (with 1 minute buffer)
        const expiryDate = new Date(expiry);
        const now = new Date();
        const bufferMs = 60 * 1000; // 1 minute

        return expiryDate.getTime() - now.getTime() > bufferMs;
    }

    /**
     * Get access token from localStorage
     */
    static getAccessToken() {
        return localStorage.getItem(this.TOKEN_KEY);
    }

    /**
     * Get refresh token from localStorage
     */
    static getRefreshToken() {
        return localStorage.getItem(this.REFRESH_TOKEN_KEY);
    }

    /**
     * Get token expiry from localStorage
     */
    static getTokenExpiry() {
        return localStorage.getItem(this.TOKEN_EXPIRY_KEY);
    }

    /**
     * Get stored user info
     */
    static getUser() {
        const userJson = localStorage.getItem(this.USER_KEY);
        return userJson ? JSON.parse(userJson) : null;
    }

    /**
     * Login with email and password
     * @param {string} email
     * @param {string} password
     * @returns {Promise<Object>} User info and tokens
     */
    static async login(email, password) {
        const response = await fetch(`${CONFIG.API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Login failed' }));
            throw new Error(error.message || 'Invalid email or password');
        }

        const data = await response.json();

        // Store tokens and user info
        this.storeAuthData(data);

        return data;
    }

    /**
     * Create demo user with pre-populated route
     * @returns {Promise<Object>} Demo user info, tokens, and route data
     */
    static async createDemo() {
        const response = await fetch(`${CONFIG.API_BASE}/auth/demo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Demo creation failed' }));
            throw new Error(error.message || 'Failed to create demo user');
        }

        const data = await response.json();

        // Store auth tokens from the nested authData
        this.storeAuthData(data.authData);

        return data;
    }

    /**
     * Store authentication data in localStorage
     * @param {Object} data - Auth response with tokens and user info
     */
    static storeAuthData(data) {
        localStorage.setItem(this.TOKEN_KEY, data.accessToken);
        localStorage.setItem(this.REFRESH_TOKEN_KEY, data.refreshToken);
        localStorage.setItem(this.TOKEN_EXPIRY_KEY, data.expiresAt);
        localStorage.setItem(this.USER_KEY, JSON.stringify({
            id: data.userId,
            email: data.email,
            username: data.username
        }));
    }

    /**
     * Refresh access token using refresh token
     * @returns {Promise<boolean>} Success status
     */
    static async refreshAccessToken() {
        const refreshToken = this.getRefreshToken();
        const accessToken = this.getAccessToken();

        if (!refreshToken || !accessToken) {
            return false;
        }

        try {
            const response = await fetch(`${CONFIG.API_BASE}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    refreshToken,
                    accessToken
                })
            });

            if (!response.ok) {
                // Refresh failed - clear auth data
                this.logout();
                return false;
            }

            const data = await response.json();

            // Store new tokens
            this.storeAuthData(data);

            return true;
        } catch (error) {
            console.error('Token refresh failed:', error);
            this.logout();
            return false;
        }
    }

    /**
     * Logout - clear tokens and revoke refresh token on backend
     */
    static async logout() {
        const refreshToken = this.getRefreshToken();

        // Try to revoke token on backend (don't wait for response)
        if (refreshToken) {
            try {
                await fetch(`${CONFIG.API_BASE}/auth/logout`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.getAccessToken()}`
                    },
                    body: JSON.stringify({ refreshToken })
                });
            } catch (error) {
                console.error('Logout error:', error);
            }
        }

        // Clear local storage
        localStorage.removeItem(this.TOKEN_KEY);
        localStorage.removeItem(this.REFRESH_TOKEN_KEY);
        localStorage.removeItem(this.TOKEN_EXPIRY_KEY);
        localStorage.removeItem(this.USER_KEY);
    }

    /**
     * Get authorization header for API requests
     * Automatically refreshes token if needed
     * @returns {Promise<Object>} Headers object with Authorization
     */
    static async getAuthHeaders() {
        // Check if token is expiring soon
        const expiry = this.getTokenExpiry();
        if (expiry) {
            const expiryDate = new Date(expiry);
            const now = new Date();
            const timeUntilExpiry = expiryDate.getTime() - now.getTime();
            const fiveMinutes = 5 * 60 * 1000;

            // Refresh if expiring in less than 5 minutes
            if (timeUntilExpiry < fiveMinutes) {
                await this.refreshAccessToken();
            }
        }

        const token = this.getAccessToken();
        if (!token) {
            throw new Error('Not authenticated');
        }

        return {
            'Authorization': `Bearer ${token}`
        };
    }

    /**
     * Check authentication status and redirect to login if needed
     * @returns {Promise<boolean>} True if authenticated, false otherwise
     */
    static async ensureAuthenticated() {
        if (this.isAuthenticated()) {
            return true;
        }

        // Try to refresh token
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
            return true;
        }

        return false;
    }

    /**
     * Get current user info
     * @returns {Promise<Object>} User information
     */
    static async getCurrentUser() {
        const response = await fetch(`${CONFIG.API_BASE}/auth/me`, {
            headers: await this.getAuthHeaders()
        });

        if (!response.ok) {
            throw new Error('Failed to get user info');
        }

        const user = await response.json();

        // Update stored user info
        localStorage.setItem(this.USER_KEY, JSON.stringify(user));

        return user;
    }
}
