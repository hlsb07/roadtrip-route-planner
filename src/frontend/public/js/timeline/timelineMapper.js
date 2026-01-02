/**
 * Timeline Mapper - Convert backend itinerary data to timeline coordinates
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Map itinerary data from backend to timeline stops with calendar-date-based coordinates
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

    // Get the calendar date of route start (at midnight UTC)
    const routeStartDate = new Date(Date.UTC(
        routeStart.getUTCFullYear(),
        routeStart.getUTCMonth(),
        routeStart.getUTCDate(),
        0, 0, 0, 0
    ));

    console.log(`Mapping ${itinerary.places.length} stops, route start: ${routeStart.toISOString()}, route start date (midnight): ${routeStartDate.toISOString()}`);

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

        // Calculate calendar-date-based coordinates
        // startT = day index (0-based) + fraction of day (time-of-day as 0.0-1.0)
        // Day 0 = first calendar date, Day 1 = second calendar date, etc.
        const startT = start
            ? (start.getTime() - routeStartDate.getTime()) / MS_PER_DAY
            : idx; // Fallback to sequential
        const endT = end
            ? (end.getTime() - routeStartDate.getTime()) / MS_PER_DAY
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
 * Convert timeline coordinates (calendar-date-based float days) back to UTC timestamps
 * @param {number} startT - Start time in float days (from first calendar date midnight)
 * @param {number} endT - End time in float days (from first calendar date midnight)
 * @param {string} routeStartUtc - Route start datetime (ISO string)
 * @returns {Object} {startUtc, endUtc} ISO timestamp strings
 */
export function timelineCoordsToUTC(startT, endT, routeStartUtc) {
    const routeStart = new Date(routeStartUtc);

    // Get the calendar date of route start (at midnight UTC)
    const routeStartDate = new Date(Date.UTC(
        routeStart.getUTCFullYear(),
        routeStart.getUTCMonth(),
        routeStart.getUTCDate(),
        0, 0, 0, 0
    ));

    const startUtc = new Date(routeStartDate.getTime() + startT * MS_PER_DAY);
    const endUtc = new Date(routeStartDate.getTime() + endT * MS_PER_DAY);

    return {
        startUtc: startUtc.toISOString(),
        endUtc: endUtc.toISOString()
    };
}

/**
 * Format a float day value to a human-readable string with calendar date and time
 * @param {number} t - Time in float days (from first calendar date midnight)
 * @param {number} totalDays - Total days in timeline
 * @param {string} routeStartUtc - Route start datetime (ISO string)
 * @returns {string} Formatted string like "Dec 26 · 09:00"
 */
export function formatDayTime(t, totalDays, routeStartUtc) {
    // Calculate absolute time
    if (routeStartUtc) {
        const routeStart = new Date(routeStartUtc);

        // Get the calendar date of route start (at midnight UTC)
        const routeStartDate = new Date(Date.UTC(
            routeStart.getUTCFullYear(),
            routeStart.getUTCMonth(),
            routeStart.getUTCDate(),
            0, 0, 0, 0
        ));

        const absoluteTime = new Date(routeStartDate.getTime() + t * MS_PER_DAY);

        // Format as "Month Day · HH:MM"
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = monthNames[absoluteTime.getUTCMonth()];
        const day = absoluteTime.getUTCDate();
        const hh = String(absoluteTime.getUTCHours()).padStart(2, '0');
        const mm = String(absoluteTime.getUTCMinutes()).padStart(2, '0');

        return `${month} ${day} · ${hh}:${mm}`;
    } else {
        // Fallback to Day N format if no route start provided
        const dayIndex = Math.floor(t) + 1;
        const dayClamped = Math.max(1, Math.min(dayIndex, totalDays));

        let minutes = Math.round((t - Math.floor(t)) * 24 * 60);
        if (minutes >= 24 * 60) minutes = 0;

        const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
        const mm = String(minutes % 60).padStart(2, '0');

        return `Day ${dayClamped} · ${hh}:${mm}`;
    }
}
