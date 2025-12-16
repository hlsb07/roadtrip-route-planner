/**
 * Timeline Mapper - Convert backend itinerary data to timeline coordinates
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Map itinerary data from backend to timeline stops with float day coordinates
 * @param {Object} itinerary - Route itinerary from backend
 * @returns {Array} Timeline stops with startT/endT coordinates
 */
export function mapItineraryToTimelineStops(itinerary) {
    if (!itinerary || !itinerary.places || itinerary.places.length === 0) {
        console.warn('Empty itinerary provided to mapper');
        return [];
    }

    const routeStart = itinerary.scheduleSettings?.startDateTime
        ? new Date(itinerary.scheduleSettings.startDateTime)
        : new Date(); // Fallback (shouldn't happen with auto-init)

    console.log(`Mapping ${itinerary.places.length} stops, route start: ${routeStart.toISOString()}`);

    return itinerary.places.map((stop, idx) => {
        const start = stop.plannedStart ? new Date(stop.plannedStart) : null;
        let end = stop.plannedEnd ? new Date(stop.plannedEnd) : null;

        // Fallback calculation if plannedEnd missing
        if (start && !end) {
            if (stop.stopType === 0 && stop.stayNights != null) { // Overnight
                end = new Date(start.getTime() + stop.stayNights * MS_PER_DAY);
            } else if (stop.stayDurationMinutes != null) {
                end = new Date(start.getTime() + stop.stayDurationMinutes * 60 * 1000);
            } else {
                end = new Date(start.getTime() + 2 * 60 * 60 * 1000); // 2h default
            }
        }

        // Calculate float days (0.0 = route start, 1.0 = end of day 1)
        const startT = start
            ? (start.getTime() - routeStart.getTime()) / MS_PER_DAY
            : idx; // Fallback to sequential
        const endT = end
            ? (end.getTime() - routeStart.getTime()) / MS_PER_DAY
            : (idx + 1);

        const timelineStop = {
            routePlaceId: stop.id,
            placeId: stop.placeId,
            name: stop.placeName || stop.name || `Stop ${idx + 1}`,
            latitude: stop.latitude,
            longitude: stop.longitude,
            orderIndex: stop.orderIndex,
            stopType: stop.stopType || 0,
            color: `color-${(idx % 5) + 1}`,
            startT: Math.max(0, startT), // Clamp to valid range
            endT: Math.max(startT + 0.05, endT), // Ensure minimum duration (~1.2 hours)

            // Store original times for saving back
            originalStart: stop.plannedStart,
            originalEnd: stop.plannedEnd,
            isStartLocked: stop.isStartLocked || false,
            isEndLocked: stop.isEndLocked || false
        };

        console.log(`  Stop ${idx + 1} (${timelineStop.name}): startT=${timelineStop.startT.toFixed(2)}, endT=${timelineStop.endT.toFixed(2)}`);

        return timelineStop;
    });
}

/**
 * Calculate total days for the timeline based on stops
 * @param {Array} timelineStops - Array of timeline stops
 * @returns {number} Total days (rounded up)
 */
export function calculateTotalDays(timelineStops) {
    if (!timelineStops || timelineStops.length === 0) {
        return 1;
    }

    const maxEndT = Math.max(...timelineStops.map(s => s.endT));
    const totalDays = Math.ceil(maxEndT);

    console.log(`Calculated total days: ${totalDays} (from max endT: ${maxEndT.toFixed(2)})`);

    return totalDays;
}

/**
 * Convert timeline coordinates (float days) back to UTC timestamps
 * @param {number} startT - Start time in float days
 * @param {number} endT - End time in float days
 * @param {string} routeStartUtc - Route start datetime (ISO string)
 * @returns {Object} {startUtc, endUtc} ISO timestamp strings
 */
export function timelineCoordsToUTC(startT, endT, routeStartUtc) {
    const routeStart = new Date(routeStartUtc);

    const startUtc = new Date(routeStart.getTime() + startT * MS_PER_DAY);
    const endUtc = new Date(routeStart.getTime() + endT * MS_PER_DAY);

    return {
        startUtc: startUtc.toISOString(),
        endUtc: endUtc.toISOString()
    };
}

/**
 * Format a float day value to a human-readable string
 * @param {number} t - Time in float days
 * @param {number} totalDays - Total days in timeline
 * @returns {string} Formatted string like "Day 1 · 09:00"
 */
export function formatDayTime(t, totalDays) {
    const dayIndex = Math.floor(t) + 1;
    let minutes = Math.round((t - Math.floor(t)) * 24 * 60);
    if (minutes >= 24 * 60) minutes = 0;

    const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
    const mm = String(minutes % 60).padStart(2, '0');
    const dayClamped = Math.max(1, Math.min(dayIndex, totalDays));

    return `Day ${dayClamped} · ${hh}:${mm}`;
}
