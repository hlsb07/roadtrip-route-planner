import { ApiService } from '../api.js';

/**
 * Auto-initialize schedule for routes that don't have schedule data
 */

/**
 * Initialize schedule if needed for a route
 * @param {number} routeId - Route ID
 * @param {Object} route - Route object with places
 * @returns {Promise<void>}
 */
export async function initializeScheduleIfNeeded(routeId, route) {
    console.log('Checking if schedule initialization is needed for route:', routeId);

    // Load itinerary first to check if schedule settings exist
    let itinerary = await ApiService.getItinerary(routeId);

    // Check if route has StartDateTime in schedule settings
    if (!itinerary.scheduleSettings?.startDateTime) {
        console.log('Route has no start date time, initializing...');
        const startDateTime = calculateDefaultStart(route);
        await ApiService.updateRouteScheduleSettings(routeId, {
            timeZoneId: route.timeZoneId || "Europe/Berlin",
            startDateTime: startDateTime.toISOString(),
            endDateTime: route.endDateTime || null,
            defaultArrivalTime: route.defaultArrivalTime || null,
            defaultDepartureTime: route.defaultDepartureTime || null
        });
        // Reload itinerary to get updated schedule settings
        itinerary = await ApiService.getItinerary(routeId);
    }

    // Check if places have schedule data
    const placesNeedSchedule = itinerary.places && itinerary.places.some(p => !p.plannedStart);

    if (placesNeedSchedule) {
        console.log('Some places need schedule data, generating default schedules...');
        await generateDefaultStopSchedules(routeId, itinerary);
    }

    // Check if legs exist AND have valid OSRM data
    const legsAreMissing = !itinerary.legs || itinerary.legs.length !== itinerary.places.length - 1;
    const legsHaveNoData = itinerary.legs && itinerary.legs.length > 0 &&
                           itinerary.legs.every(leg => leg.distanceMeters === 0 && leg.durationSeconds === 0);

    if (legsAreMissing || legsHaveNoData) {
        console.log('Legs missing or have no OSRM data, triggering backend recalculation...');

        // Trigger backend to recalculate legs from OSRM
        if (itinerary.places && itinerary.places.length > 1) {
            await triggerBackendLegRecalculation(routeId);
        }
    }

    console.log('Schedule initialization complete');
}

/**
 * Calculate default start date/time for a route
 * @param {Object} route - Route object
 * @returns {Date} Default start date/time
 */
function calculateDefaultStart(route) {
    const now = new Date();

    // Use default arrival time if set, otherwise 09:00
    if (route.defaultArrivalTime) {
        const [hours, minutes] = route.defaultArrivalTime.split(':').map(Number);
        now.setHours(hours, minutes, 0, 0);
    } else {
        now.setHours(9, 0, 0, 0); // Default to 09:00
    }

    return now;
}

/**
 * Generate default stop schedules for all places in a route
 * @param {number} routeId - Route ID
 * @param {Object} itinerary - Itinerary object with places (containing RoutePlace IDs)
 * @returns {Promise<void>}
 */
async function generateDefaultStopSchedules(routeId, itinerary) {
    if (!itinerary.places || itinerary.places.length === 0) {
        console.log('No places in itinerary, skipping schedule generation');
        return;
    }

    const startDateTime = itinerary.scheduleSettings?.startDateTime
        ? new Date(itinerary.scheduleSettings.startDateTime)
        : new Date();
    console.log(`Generating schedules starting from: ${startDateTime.toISOString()}`);

    // Only initialize places that don't have a schedule yet
    const placesWithoutSchedule = itinerary.places.filter(p => !p.plannedStart);

    if (placesWithoutSchedule.length === 0) {
        console.log('All places already have schedules, skipping');
        return;
    }

    console.log(`Initializing schedules for ${placesWithoutSchedule.length} places without schedule`);

    for (const place of placesWithoutSchedule) {
        const routePlaceId = place.id;
        // Use the place's orderIndex for day offset
        const dayOffset = place.orderIndex;

        const plannedStart = new Date(startDateTime);
        plannedStart.setDate(plannedStart.getDate() + dayOffset);
        plannedStart.setHours(9, 0, 0, 0); // 09:00 arrival

        const plannedEnd = new Date(plannedStart);

        // Default: Overnight = 1 night (next day 09:00), DayStop = 2 hours
        const stopType = 0; // Overnight enum value

        if (stopType === 0) { // Overnight
            plannedEnd.setDate(plannedEnd.getDate() + 1); // Next day 09:00
        } else {
            plannedEnd.setHours(plannedEnd.getHours() + 2); // 2 hours later
        }

        console.log(`Setting schedule for place ${place.orderIndex + 1} (${place.placeName}): ${plannedStart.toISOString()} to ${plannedEnd.toISOString()}`);

        try {
            await ApiService.updateStopSchedule(routeId, routePlaceId, {
                stopType: stopType,
                timeZoneId: null, // Use route default
                plannedStart: plannedStart.toISOString(),
                plannedEnd: plannedEnd.toISOString(),
                stayNights: stopType === 0 ? 1 : null,
                stayDurationMinutes: stopType === 1 ? 120 : null,
                isStartLocked: false,
                isEndLocked: false
            });
        } catch (error) {
            console.error(`Failed to set schedule for place ${place.placeName}:`, error);
            // Continue with other places even if one fails
        }
    }
}

/**
 * Trigger backend to recalculate OSRM legs for entire route
 * @param {number} routeId - Route ID
 * @returns {Promise<void>}
 */
async function triggerBackendLegRecalculation(routeId) {
    console.log(`Triggering backend leg recalculation for route ${routeId}...`);

    try {
        const result = await ApiService.recalculateLegsFromOsrm(routeId);
        console.log('Backend leg recalculation complete:', result);
    } catch (error) {
        console.error('Failed to trigger backend leg recalculation:', error);
        throw error;
    }
}
