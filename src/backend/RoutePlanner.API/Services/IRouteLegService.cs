namespace RoutePlanner.API.Services
{
    /// <summary>
    /// Service for managing route legs (routing data between stops)
    /// </summary>
    public interface IRouteLegService
    {
        /// <summary>
        /// Rebuilds leg skeleton for a route - deletes existing legs and creates new ones
        /// for each consecutive stop pair with default values (ready for OSRM integration)
        /// </summary>
        Task RebuildLegSkeleton(int routeId);

        /// <summary>
        /// Updates distance and duration metrics for a specific leg
        /// </summary>
        Task UpdateLegMetrics(int routeId, int legId, int distanceMeters, int durationSeconds);

        /// <summary>
        /// Recalculates all route legs using OSRM
        /// Loads ordered stops, calls OSRM once for entire route, updates legs with metrics and geometry
        /// </summary>
        Task RecalculateLegsFromOsrm(int routeId);
    }
}
