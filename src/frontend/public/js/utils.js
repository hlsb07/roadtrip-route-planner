import { notificationManager } from './notificationManager.js';

// Utility functions
export function showSuccess(message) {
    console.log('✅', message);
    notificationManager.success(message);
}

export function showError(message) {
    console.error('❌', message);
    notificationManager.error(message);
}

export function showInfo(message) {
    console.info('ℹ️', message);
    notificationManager.info(message);
}

export function showWarning(message) {
    console.warn('⚠️', message);
    notificationManager.warning(message);
}

/**
 * Show a confirmation dialog (replaces native confirm())
 * @param {string|Object} options - Either a message string or options object
 * @returns {Promise<boolean>} - Resolves to true if confirmed
 */
export async function showConfirm(options) {
    if (typeof options === 'string') {
        options = { message: options };
    }
    return await notificationManager.confirm(options);
}

export function parseGoogleMapsLink(url) {
    let coords = null;
    let name = 'Imported Location';
    
    // Try different Google Maps URL patterns
    const patterns = [
        /@(-?\d+\.\d+),(-?\d+\.\d+)/,  // @lat,lng format
        /q=(-?\d+\.\d+),(-?\d+\.\d+)/,  // query format
        /place\/([^\/]+)\/@(-?\d+\.\d+),(-?\d+\.\d+)/, // place format
        /dir\/[^\/]*\/(-?\d+\.\d+),(-?\d+\.\d+)/ // directions format
    ];
    
    for (let pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
            if (match.length === 4) {
                name = decodeURIComponent(match[1]).replace(/\+/g, ' ');
                coords = [parseFloat(match[2]), parseFloat(match[3])];
            } else {
                coords = [parseFloat(match[1]), parseFloat(match[2])];
            }
            break;
        }
    }
    
    // Also try to extract place name from URL
    const placeMatch = url.match(/place\/([^\/]+)/);
    if (placeMatch && !coords) {
        return { shouldSearch: true, query: decodeURIComponent(placeMatch[1]).replace(/\+/g, ' ') };
    }
    
    return { coords, name, shouldSearch: false };
}

export function validateCoordinates(coordsStr) {
    const parts = coordsStr.split(',').map(s => s.trim());
    if (parts.length !== 2) {
        return { valid: false, error: 'Invalid format. Use: latitude, longitude' };
    }
    
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    
    if (isNaN(lat) || isNaN(lng)) {
        return { valid: false, error: 'Invalid coordinates' };
    }
    
    return { valid: true, lat, lng };
}

export function formatPlaceName(lat, lng) {
    return `Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
}

export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}