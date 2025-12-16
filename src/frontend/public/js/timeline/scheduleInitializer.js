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

    // Check if route has StartDateTime
    if (!route.startDateTime) {
        console.log('Route has no start date time, initializing...');
        const startDateTime = calculateDefaultStart(route);
        await ApiService.updateRouteScheduleSettings(routeId, {
            timeZoneId: route.timeZoneId || "Europe/Berlin",
            startDateTime: startDateTime.toISOString(),
            endDateTime: route.endDateTime || null,
            defaultArrivalTime: route.defaultArrivalTime || null,
            defaultDepartureTime: route.defaultDepartureTime || null
        });
    }

    // Check if places have schedule data
    const placesNeedSchedule = route.places && route.places.some(p => !p.plannedStart);

    if (placesNeedSchedule) {
        console.log('Some places need schedule data, generating default schedules...');
        await generateDefaultStopSchedules(routeId, route);
    }

    // Check if legs exist
    if (!route.legs || route.legs.length !== route.places.length - 1) {
        console.log('Legs missing or stale, rebuilding...');
        await ApiService.rebuildLegs(routeId);

        // Then calculate OSRM and save
        if (route.places && route.places.length > 1) {
            await calculateAndSaveOSRMLegs(routeId, route.places);
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
 * @param {Object} route - Route object with places
 * @returns {Promise<void>}
 */
async function generateDefaultStopSchedules(routeId, route) {
    if (!route.places || route.places.length === 0) {
        console.log('No places in route, skipping schedule generation');
        return;
    }

    const startDateTime = route.startDateTime ? new Date(route.startDateTime) : calculateDefaultStart(route);
    console.log(`Generating schedules starting from: ${startDateTime.toISOString()}`);

    for (let i = 0; i < route.places.length; i++) {
        const place = route.places[i];
        const routePlaceId = place.id;

        // Simple logic: 1 day per stop
        const dayOffset = i; // Day 1 = index 0
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

        console.log(`Setting schedule for place ${i + 1} (${place.name}): ${plannedStart.toISOString()} to ${plannedEnd.toISOString()}`);

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
            console.error(`Failed to set schedule for place ${place.name}:`, error);
            // Continue with other places even if one fails
        }
    }
}

/**
 * Calculate OSRM legs and save to backend
 * @param {number} routeId - Route ID
 * @param {Array} places - Array of places in the route
 * @returns {Promise<void>}
 */
async function calculateAndSaveOSRMLegs(routeId, places) {
    console.log(`Calculating OSRM legs for ${places.length} places...`);

    // For each consecutive pair of places
    for (let i = 0; i < places.length - 1; i++) {
        const from = places[i];
        const to = places[i + 1];

        console.log(`Calculating leg ${i + 1}: ${from.name} → ${to.name}`);

        try {
            // Call OSRM
            const result = await callOSRM([from, to]);

            if (!result || !result.routes || result.routes.length === 0) {
                console.warn(`No route found for leg ${i + 1}`);
                continue;
            }

            const route = result.routes[0];
            const distanceMeters = Math.round(route.distance);
            const durationSeconds = Math.round(route.duration);

            console.log(`  Distance: ${distanceMeters}m, Duration: ${durationSeconds}s`);

            // Get the itinerary to find the leg ID
            const itinerary = await ApiService.getItinerary(routeId);
            const leg = itinerary.legs.find(l => l.orderIndex === i);

            if (leg) {
                await ApiService.updateLegMetrics(routeId, leg.id, {
                    distanceMeters: distanceMeters,
                    durationSeconds: durationSeconds
                });
                console.log(`  Saved metrics for leg ${leg.id}`);
            } else {
                console.warn(`  Could not find leg with orderIndex ${i}`);
            }
        } catch (error) {
            console.error(`Failed to calculate/save leg ${i + 1}:`, error);
            // Continue with other legs even if one fails
        }
    }

    console.log('OSRM leg calculation complete');
}

/**
 * Call OSRM API to get route between waypoints
 * @param {Array} waypoints - Array of place objects with latitude/longitude
 * @returns {Promise<Object>} OSRM response
 */
async function callOSRM(waypoints) {
    const coords = waypoints.map(p => `${p.longitude},${p.latitude}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full`;

    console.log(`  OSRM request: ${url}`);

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`OSRM request failed: ${response.status}`);
    }

    return await response.json();
}
