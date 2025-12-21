using Microsoft.EntityFrameworkCore;
using RoutePlanner.API.Data;
using RoutePlanner.API.DTOs;
using RoutePlanner.API.Models;

namespace RoutePlanner.API.Services
{
    /// <summary>
    /// Service for managing route schedule settings and stop scheduling
    /// </summary>
    public class RouteScheduleService : IRouteScheduleService
    {
        private readonly AppDbContext _context;
        private readonly ILogger<RouteScheduleService> _logger;

        public RouteScheduleService(AppDbContext context, ILogger<RouteScheduleService> logger)
        {
            _context = context;
            _logger = logger;
        }

        public async Task UpdateRouteScheduleSettings(int routeId, UpdateRouteScheduleDto dto)
        {
            var route = await _context.Routes.FindAsync(routeId);
            if (route == null)
            {
                throw new InvalidOperationException($"Route with ID {routeId} not found");
            }

            route.TimeZoneId = dto.TimeZoneId;
            route.StartDateTime = dto.StartDateTime;
            route.EndDateTime = dto.EndDateTime;
            route.DefaultArrivalTime = dto.DefaultArrivalTime;
            route.DefaultDepartureTime = dto.DefaultDepartureTime;
            route.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();
            _logger.LogInformation($"Updated schedule settings for route {routeId}");
        }

        public async Task UpdateRoutePlaceSchedule(int routeId, int routePlaceId, RoutePlaceScheduleUpdateDto dto)
        {
            var routePlace = await _context.RoutePlaces
                .FirstOrDefaultAsync(rp => rp.Id == routePlaceId && rp.RouteId == routeId);

            if (routePlace == null)
            {
                throw new InvalidOperationException($"RoutePlace with ID {routePlaceId} not found in route {routeId}");
            }

            routePlace.StopType = dto.StopType;
            routePlace.TimeZoneId = dto.TimeZoneId;
            routePlace.PlannedStart = dto.PlannedStart;
            routePlace.PlannedEnd = dto.PlannedEnd;
            routePlace.StayNights = dto.StayNights;
            routePlace.StayDurationMinutes = dto.StayDurationMinutes;
            routePlace.IsStartLocked = dto.IsStartLocked;
            routePlace.IsEndLocked = dto.IsEndLocked;

            // Update route's UpdatedAt timestamp
            var route = await _context.Routes.FindAsync(routeId);
            if (route != null)
            {
                route.UpdatedAt = DateTime.UtcNow;
            }

            await _context.SaveChangesAsync();
            _logger.LogInformation($"Updated schedule for RoutePlace {routePlaceId} in route {routeId}");
        }

        public async Task<RouteItineraryDto?> GetItinerary(int routeId)
        {
            var route = await _context.Routes
                .Include(r => r.Places.OrderBy(p => p.OrderIndex))
                    .ThenInclude(rp => rp.Place)
                .Include(r => r.Legs.OrderBy(l => l.OrderIndex))
                .FirstOrDefaultAsync(r => r.Id == routeId);

            if (route == null)
            {
                return null;
            }

            return new RouteItineraryDto
            {
                Id = route.Id,
                Name = route.Name,
                Description = route.Description,
                ScheduleSettings = MapToRouteScheduleSettingsDto(route),
                Places = route.Places.Select(MapToRoutePlaceWithScheduleDto).ToList(),
                Legs = route.Legs.Select(MapToRouteLegDto).ToList(),
                CreatedAt = route.CreatedAt,
                UpdatedAt = route.UpdatedAt
            };
        }

        // ===== Manual Mapping Helpers =====

        private RouteScheduleSettingsDto MapToRouteScheduleSettingsDto(Models.Route route)
        {
            return new RouteScheduleSettingsDto(
                route.TimeZoneId,
                route.StartDateTime,
                route.EndDateTime,
                route.DefaultArrivalTime,
                route.DefaultDepartureTime
            );
        }

        private RoutePlaceWithScheduleDto MapToRoutePlaceWithScheduleDto(RoutePlace routePlace)
        {
            return new RoutePlaceWithScheduleDto
            {
                Id = routePlace.Id,
                PlaceId = routePlace.PlaceId,
                PlaceName = routePlace.Place?.Name ?? "",
                Latitude = routePlace.Place?.Location.Y ?? 0,
                Longitude = routePlace.Place?.Location.X ?? 0,
                OrderIndex = routePlace.OrderIndex,
                StopType = routePlace.StopType,
                TimeZoneId = routePlace.TimeZoneId,
                PlannedStart = routePlace.PlannedStart,
                PlannedEnd = routePlace.PlannedEnd,
                StayNights = routePlace.StayNights,
                StayDurationMinutes = routePlace.StayDurationMinutes,
                IsStartLocked = routePlace.IsStartLocked,
                IsEndLocked = routePlace.IsEndLocked
            };
        }

        private RouteLegDto MapToRouteLegDto(RouteLeg leg)
        {
            // Convert LineString to coordinate array for frontend
            var geometryCoords = GeometryUtils.LineStringToCoordinateArray(leg.Geometry);

            return new RouteLegDto(
                leg.Id,
                leg.OrderIndex,
                leg.FromRoutePlaceId,
                leg.ToRoutePlaceId,
                leg.DistanceMeters,
                leg.DurationSeconds,
                leg.Provider,
                leg.CalculatedAt,
                geometryCoords
            );
        }
    }
}
