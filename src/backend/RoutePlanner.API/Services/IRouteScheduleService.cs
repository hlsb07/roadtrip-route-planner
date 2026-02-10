using RoutePlanner.API.DTOs;

namespace RoutePlanner.API.Services
{
    /// <summary>
    /// Service for managing route schedule settings and stop scheduling
    /// </summary>
    public interface IRouteScheduleService
    {
        /// <summary>
        /// Updates route-level schedule settings (timezone, start/end dates, defaults)
        /// </summary>
        Task UpdateRouteScheduleSettings(int routeId, UpdateRouteScheduleDto dto);

        /// <summary>
        /// Updates schedule data for an individual stop in a route
        /// </summary>
        Task UpdateRoutePlaceSchedule(int routeId, int routePlaceId, RoutePlaceScheduleUpdateDto dto);

        /// <summary>
        /// Gets complete route itinerary with schedule settings, ordered stops, and legs
        /// </summary>
        Task<RouteItineraryDto?> GetItinerary(int routeId);

        /// <summary>
        /// Recalculates schedule for all stops after a reorder, preserving locked days
        /// </summary>
        /// <param name="routeId">The route ID</param>
        /// <param name="preserveLockedDays">If true, preserves day component of locked times</param>
        /// <param name="ignoreLockedStops">If true, updates all stops regardless of lock status (used after manual reorder)</param>
        /// <returns>Result with details of what was changed</returns>
        Task<RecalculateScheduleResultDto> RecalculateScheduleAfterReorder(
            int routeId,
            bool preserveLockedDays = true,
            bool ignoreLockedStops = false,
            int? movedPlaceId = null,
            int? oldIndex = null,
            int? newIndex = null);

        /// <summary>
        /// Recalculates the entire route as a continuous chain with no gaps.
        /// Chain: Place[0] -> Leg[0] -> Place[1] -> Leg[1] -> ...
        /// Each item starts exactly when the previous ends.
        /// Leg durations are fixed (from OSRM). Place durations are preserved.
        /// </summary>
        /// <param name="routeId">The route ID</param>
        /// <param name="fromOrderIndex">Start recalculation from this order index (0 = full recalc).
        /// The item at this index uses its current PlannedStart as the anchor.</param>
        /// <returns>Result with details of what was changed</returns>
        Task<RecalculateScheduleResultDto> RecalculateChainSchedule(int routeId, int fromOrderIndex = 0);
    }
}
