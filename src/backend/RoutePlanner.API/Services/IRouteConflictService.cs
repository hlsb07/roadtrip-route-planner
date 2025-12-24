using RoutePlanner.API.DTOs;

namespace RoutePlanner.API.Services
{
    /// <summary>
    /// Service for detecting and resolving conflicts between timeline order (by PlannedStart)
    /// and route order (by OrderIndex)
    /// </summary>
    public interface IRouteConflictService
    {
        /// <summary>
        /// Detects if timeline order (sorted by PlannedStart) differs from OrderIndex
        /// </summary>
        /// <param name="routeId">The route ID to check</param>
        /// <returns>Conflict information including which stops are out of sequence</returns>
        Task<RouteOrderConflictDto> DetectOrderConflicts(int routeId);

        /// <summary>
        /// Checks if a specific stop schedule change would create conflicts
        /// </summary>
        /// <param name="routeId">The route ID</param>
        /// <param name="routePlaceId">The route place ID being modified</param>
        /// <param name="newPlannedStart">The new planned start time</param>
        /// <param name="newPlannedEnd">The new planned end time</param>
        /// <returns>Conflict analysis for the proposed change</returns>
        Task<ScheduleChangeConflictDto> CheckScheduleChangeConflict(
            int routeId,
            int routePlaceId,
            DateTimeOffset newPlannedStart,
            DateTimeOffset newPlannedEnd);

        /// <summary>
        /// Determines new OrderIndex sequence based on PlannedStart times
        /// </summary>
        /// <param name="routeId">The route ID</param>
        /// <returns>List of place IDs sorted by PlannedStart time</returns>
        Task<List<int>> CalculateOrderByTimeSequence(int routeId);

        /// <summary>
        /// Applies the time-based order to the route (reorders stops by PlannedStart)
        /// </summary>
        /// <param name="routeId">The route ID to reorder</param>
        Task ApplyTimeBasedOrder(int routeId);
    }
}
