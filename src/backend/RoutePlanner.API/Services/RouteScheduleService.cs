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

        public async Task<RecalculateScheduleResultDto> RecalculateScheduleAfterReorder(
            int routeId,
            bool preserveLockedDays = true,
            bool ignoreLockedStops = false,
            int? movedPlaceId = null,
            int? oldIndex = null,
            int? newIndex = null)
        {
            var route = await _context.Routes
                .Include(r => r.Places.OrderBy(p => p.OrderIndex))
                    .ThenInclude(rp => rp.Place)
                .Include(r => r.Legs.OrderBy(l => l.OrderIndex))
                .FirstOrDefaultAsync(r => r.Id == routeId);

            if (route == null)
            {
                throw new InvalidOperationException($"Route {routeId} not found");
            }

            var orderedStops = route.Places.OrderBy(p => p.OrderIndex).ToList();

            if (orderedStops.Count == 0)
            {
                return new RecalculateScheduleResultDto { UpdatedStops = 0 };
            }

            // If no move detected, return early (no changes needed)
            if (!movedPlaceId.HasValue || !oldIndex.HasValue || !newIndex.HasValue)
            {
                _logger.LogInformation($"No move detected for route {routeId}, skipping schedule recalculation");
                return new RecalculateScheduleResultDto { UpdatedStops = 0 };
            }

            int updatedCount = 0;
            var changes = new List<ScheduleChangeDetail>();

            // Calculate affected range
            int minIndex = Math.Min(oldIndex.Value, newIndex.Value);
            int maxIndex = Math.Max(oldIndex.Value, newIndex.Value);
            bool movedUp = newIndex.Value < oldIndex.Value;  // Moved to lower index

            // Find the moved place
            var movedPlace = orderedStops.FirstOrDefault(rp => rp.PlaceId == movedPlaceId.Value);
            if (movedPlace == null)
            {
                _logger.LogWarning($"Moved place {movedPlaceId.Value} not found in route {routeId}");
                return new RecalculateScheduleResultDto { UpdatedStops = 0 };
            }

            // Store original times for all places (before any updates)
            var originalTimes = orderedStops
                .ToDictionary(rp => rp.PlaceId, rp => new { Start = rp.PlannedStart, End = rp.PlannedEnd });

            _logger.LogInformation($"RecalculateScheduleAfterReorder: movedPlaceId={movedPlaceId}, oldIndex={oldIndex}, newIndex={newIndex}");

            // Use the route's StartDateTime as the base date for consistent day assignment
            // Each position in the route should be on its corresponding day: position 0 = day 0, position 1 = day 1, etc.
            var routeStartDate = route.StartDateTime ?? DateTimeOffset.UtcNow;
            var baseDate = new DateTimeOffset(
                routeStartDate.Date,
                routeStartDate.Offset);

            _logger.LogInformation($"Using route start date as base: {routeStartDate}, updating ALL {orderedStops.Count} positions");

            // Update ALL places (not just affected range) to ensure consistency
            // When a place moves, all positions may shift, so we recalculate everything
            // Assign days based on absolute position: position i gets day i (relative to route start)
            for (int i = 0; i < orderedStops.Count; i++)
            {
                var stop = orderedStops[i];
                var originalStart = originalTimes[stop.PlaceId].Start;
                var originalEnd = originalTimes[stop.PlaceId].End;

                if (originalStart.HasValue)
                {
                    // Position i should be on day i (relative to route start)
                    // This ensures consistent day assignment regardless of existing times
                    var dayOffset = i;

                    // Calculate the new date for this position
                    var newDate = baseDate.Date.AddDays(dayOffset);
                    var timeOfDay = originalStart.Value.TimeOfDay;
                    var newDateTime = newDate.Add(timeOfDay);

                    _logger.LogInformation($"  Position {i} ({stop.Place?.Name}, PlaceId={stop.PlaceId}): dayOffset={dayOffset}, newDate={newDate:yyyy-MM-dd}, timeOfDay={timeOfDay}, newDateTime={newDateTime}");

                    // Keep original time-of-day, assign to new day
                    stop.PlannedStart = new DateTimeOffset(
                        newDateTime,
                        originalStart.Value.Offset);

                    if (originalEnd.HasValue)
                    {
                        // Keep original duration
                        var duration = originalEnd.Value - originalStart.Value;
                        stop.PlannedEnd = stop.PlannedStart.Value.Add(duration);
                    }

                    _logger.LogInformation($"  Position {i}: {stop.Place?.Name} - Original: {originalStart} -> New: {stop.PlannedStart}");

                    updatedCount++;
                }

                changes.Add(new ScheduleChangeDetail
                {
                    RoutePlaceId = stop.Id,
                    PlaceName = stop.Place?.Name ?? "",
                    OldStart = originalStart,
                    OldEnd = originalEnd,
                    NewStart = stop.PlannedStart,
                    NewEnd = stop.PlannedEnd,
                    WasLocked = stop.IsStartLocked || stop.IsEndLocked
                });
            }

            route.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            _logger.LogInformation(
                $"Recalculated schedule for route {routeId}: {updatedCount} stops updated (moved place: {movedPlaceId}, {oldIndex}→{newIndex})");

            return new RecalculateScheduleResultDto
            {
                UpdatedStops = updatedCount,
                Changes = changes,
                PreservedLockedDays = preserveLockedDays
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
