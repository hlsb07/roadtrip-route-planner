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
    }
}
