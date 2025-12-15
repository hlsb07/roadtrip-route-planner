using Microsoft.EntityFrameworkCore;
using RoutePlanner.API.Data;
using RoutePlanner.API.Models;

namespace RoutePlanner.API.Services
{
    /// <summary>
    /// Service for managing route legs (routing data between stops)
    /// </summary>
    public class RouteLegService : IRouteLegService
    {
        private readonly AppDbContext _context;
        private readonly ILogger<RouteLegService> _logger;

        public RouteLegService(AppDbContext context, ILogger<RouteLegService> logger)
        {
            _context = context;
            _logger = logger;
        }

        public async Task RebuildLegSkeleton(int routeId)
        {
            // Load route with ordered places
            var route = await _context.Routes
                .Include(r => r.Places.OrderBy(p => p.OrderIndex))
                .FirstOrDefaultAsync(r => r.Id == routeId);

            if (route == null)
            {
                throw new InvalidOperationException($"Route with ID {routeId} not found");
            }

            // Delete existing legs for this route
            var existingLegs = await _context.RouteLegs
                .Where(l => l.RouteId == routeId)
                .ToListAsync();

            _context.RouteLegs.RemoveRange(existingLegs);
            _logger.LogInformation($"Deleted {existingLegs.Count} existing legs for route {routeId}");

            // Create new legs for each consecutive stop pair
            var orderedPlaces = route.Places.OrderBy(p => p.OrderIndex).ToList();
            var newLegs = new List<RouteLeg>();

            for (int i = 0; i < orderedPlaces.Count - 1; i++)
            {
                var fromPlace = orderedPlaces[i];
                var toPlace = orderedPlaces[i + 1];

                var leg = new RouteLeg
                {
                    RouteId = routeId,
                    FromRoutePlaceId = fromPlace.Id,
                    ToRoutePlaceId = toPlace.Id,
                    OrderIndex = i,
                    DistanceMeters = 0, // Placeholder - will be updated by OSRM
                    DurationSeconds = 0, // Placeholder - will be updated by OSRM
                    Provider = "OSRM",
                    CalculatedAt = DateTime.UtcNow
                };

                newLegs.Add(leg);
            }

            _context.RouteLegs.AddRange(newLegs);
            route.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();
            _logger.LogInformation($"Created {newLegs.Count} new leg skeletons for route {routeId}");
        }

        public async Task UpdateLegMetrics(int routeId, int legId, int distanceMeters, int durationSeconds)
        {
            var leg = await _context.RouteLegs
                .FirstOrDefaultAsync(l => l.Id == legId && l.RouteId == routeId);

            if (leg == null)
            {
                throw new InvalidOperationException($"Leg with ID {legId} not found in route {routeId}");
            }

            leg.DistanceMeters = distanceMeters;
            leg.DurationSeconds = durationSeconds;
            leg.CalculatedAt = DateTime.UtcNow;

            // Update route's UpdatedAt timestamp
            var route = await _context.Routes.FindAsync(routeId);
            if (route != null)
            {
                route.UpdatedAt = DateTime.UtcNow;
            }

            await _context.SaveChangesAsync();
            _logger.LogInformation($"Updated metrics for leg {legId}: {distanceMeters}m, {durationSeconds}s");
        }
    }
}
