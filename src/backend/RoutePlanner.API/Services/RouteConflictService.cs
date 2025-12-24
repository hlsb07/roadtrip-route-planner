using Microsoft.EntityFrameworkCore;
using RoutePlanner.API.Data;
using RoutePlanner.API.DTOs;

namespace RoutePlanner.API.Services
{
    /// <summary>
    /// Service for detecting and resolving conflicts between timeline order and route order
    /// </summary>
    public class RouteConflictService : IRouteConflictService
    {
        private readonly AppDbContext _context;
        private readonly ILogger<RouteConflictService> _logger;

        public RouteConflictService(AppDbContext context, ILogger<RouteConflictService> logger)
        {
            _context = context;
            _logger = logger;
        }

        public async Task<RouteOrderConflictDto> DetectOrderConflicts(int routeId)
        {
            var route = await _context.Routes
                .Include(r => r.Places.OrderBy(p => p.OrderIndex))
                    .ThenInclude(rp => rp.Place)
                .FirstOrDefaultAsync(r => r.Id == routeId);

            if (route == null || route.Places.Count < 2)
            {
                return new RouteOrderConflictDto { HasConflict = false };
            }

            // Get stops ordered by OrderIndex (driving sequence)
            var orderIndexSequence = route.Places
                .OrderBy(rp => rp.OrderIndex)
                .ToList();

            // Get stops ordered by PlannedStart (timeline sequence)
            var timeSequence = route.Places
                .Where(rp => rp.PlannedStart.HasValue)
                .OrderBy(rp => rp.PlannedStart)
                .ToList();

            // If not all stops have times, can't detect conflicts
            if (timeSequence.Count < route.Places.Count)
            {
                return new RouteOrderConflictDto { HasConflict = false };
            }

            // Compare sequences
            bool hasConflict = false;
            var conflictingStops = new List<ConflictingStopDto>();

            for (int i = 0; i < orderIndexSequence.Count; i++)
            {
                var stopByOrder = orderIndexSequence[i];
                var stopByTime = timeSequence[i];

                if (stopByOrder.Id != stopByTime.Id)
                {
                    hasConflict = true;

                    // Find where this stop should be in time sequence
                    int timePosition = timeSequence.FindIndex(s => s.Id == stopByOrder.Id);

                    conflictingStops.Add(new ConflictingStopDto
                    {
                        RoutePlaceId = stopByOrder.Id,
                        PlaceName = stopByOrder.Place?.Name ?? "",
                        OrderIndexPosition = i,
                        TimeSequencePosition = timePosition,
                        PlannedStart = stopByOrder.PlannedStart
                    });
                }
            }

            return new RouteOrderConflictDto
            {
                HasConflict = hasConflict,
                ConflictingStops = conflictingStops,
                OrderIndexSequence = orderIndexSequence.Select(s => s.Id).ToList(),
                TimeSequence = timeSequence.Select(s => s.Id).ToList()
            };
        }

        public async Task<ScheduleChangeConflictDto> CheckScheduleChangeConflict(
            int routeId,
            int routePlaceId,
            DateTimeOffset newPlannedStart,
            DateTimeOffset newPlannedEnd)
        {
            var routePlace = await _context.RoutePlaces
                .Include(rp => rp.Place)
                .FirstOrDefaultAsync(rp => rp.Id == routePlaceId && rp.RouteId == routeId);

            if (routePlace == null)
            {
                throw new InvalidOperationException($"RoutePlace {routePlaceId} not found");
            }

            // Get all stops in route
            var allStops = await _context.RoutePlaces
                .Include(rp => rp.Place)
                .Where(rp => rp.RouteId == routeId)
                .OrderBy(rp => rp.OrderIndex)
                .ToListAsync();

            // Create hypothetical time sequence with new values
            var timeSequence = allStops
                .Select(rp => new
                {
                    RoutePlace = rp,
                    PlannedStart = rp.Id == routePlaceId
                        ? newPlannedStart
                        : rp.PlannedStart ?? DateTimeOffset.MaxValue
                })
                .Where(x => x.PlannedStart != DateTimeOffset.MaxValue)
                .OrderBy(x => x.PlannedStart)
                .ToList();

            // Check if this creates a conflict
            bool wouldCreateConflict = false;
            int currentOrderPosition = routePlace.OrderIndex;
            int timePosition = timeSequence.FindIndex(s => s.RoutePlace.Id == routePlaceId);

            if (currentOrderPosition != timePosition)
            {
                wouldCreateConflict = true;
            }

            return new ScheduleChangeConflictDto
            {
                WouldCreateConflict = wouldCreateConflict,
                RoutePlaceId = routePlaceId,
                PlaceName = routePlace.Place?.Name ?? "",
                CurrentOrderIndex = currentOrderPosition,
                NewTimePosition = timePosition,
                SuggestedReorder = wouldCreateConflict,
                AffectedStops = wouldCreateConflict
                    ? CalculateAffectedStops(allStops, timeSequence)
                    : new List<int>()
            };
        }

        public async Task<List<int>> CalculateOrderByTimeSequence(int routeId)
        {
            var stops = await _context.RoutePlaces
                .Where(rp => rp.RouteId == routeId && rp.PlannedStart.HasValue)
                .OrderBy(rp => rp.PlannedStart)
                .Select(rp => rp.PlaceId)
                .ToListAsync();

            return stops;
        }

        public async Task ApplyTimeBasedOrder(int routeId)
        {
            var stops = await _context.RoutePlaces
                .Include(rp => rp.Place)
                .Where(rp => rp.RouteId == routeId && rp.PlannedStart.HasValue)
                .OrderBy(rp => rp.PlannedStart)
                .ToListAsync();

            if (stops.Count < 2)
            {
                _logger.LogWarning($"Cannot apply time-based order for route {routeId}: insufficient stops with times");
                return;
            }

            // Two-pass update to avoid unique constraint violations
            for (int i = 0; i < stops.Count; i++)
            {
                stops[i].OrderIndex = -(i + 1);
            }
            await _context.SaveChangesAsync();

            for (int i = 0; i < stops.Count; i++)
            {
                stops[i].OrderIndex = i;
            }

            var route = await _context.Routes.FindAsync(routeId);
            if (route != null)
            {
                route.UpdatedAt = DateTime.UtcNow;
            }

            await _context.SaveChangesAsync();

            _logger.LogInformation($"Applied time-based order to route {routeId}: {stops.Count} stops reordered");
        }

        private List<int> CalculateAffectedStops(
            List<Models.RoutePlace> orderSequence,
            List<dynamic> timeSequence)
        {
            var affected = new List<int>();

            for (int i = 0; i < Math.Min(orderSequence.Count, timeSequence.Count); i++)
            {
                if (orderSequence[i].Id != timeSequence[i].RoutePlace.Id)
                {
                    affected.Add(orderSequence[i].Id);
                }
            }

            return affected;
        }
    }
}
