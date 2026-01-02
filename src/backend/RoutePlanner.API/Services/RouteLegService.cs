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
        private readonly IOsrmClient _osrmClient;

        public RouteLegService(AppDbContext context, ILogger<RouteLegService> logger, IOsrmClient osrmClient)
        {
            _context = context;
            _logger = logger;
            _osrmClient = osrmClient;
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

        public async Task RecalculateLegsFromOsrm(int routeId)
        {
            _logger.LogInformation($"Recalculating legs from OSRM for route {routeId}");

            // Load route with ordered places and their Place entities (for coordinates)
            var route = await _context.Routes
                .Include(r => r.Places.OrderBy(p => p.OrderIndex))
                    .ThenInclude(rp => rp.Place)
                .Include(r => r.Legs.OrderBy(l => l.OrderIndex))
                .FirstOrDefaultAsync(r => r.Id == routeId);

            if (route == null)
            {
                throw new InvalidOperationException($"Route with ID {routeId} not found");
            }

            var orderedPlaces = route.Places.OrderBy(p => p.OrderIndex).ToList();

            if (orderedPlaces.Count < 2)
            {
                _logger.LogWarning($"Route {routeId} has less than 2 places, skipping OSRM calculation");
                return;
            }

            // Extract waypoints as NetTopologySuite Points
            var waypoints = orderedPlaces
                .Select(rp => rp.Place.Location)
                .ToList();

            try
            {
                // Call OSRM once for entire route with steps=true and geometries=geojson
                var osrmResponse = await _osrmClient.GetRoute(waypoints, includeSteps: true);

                if (osrmResponse.Routes == null || osrmResponse.Routes.Count == 0)
                {
                    throw new InvalidOperationException("OSRM returned no routes");
                }

                var osrmRoute = osrmResponse.Routes[0];
                var osrmLegs = osrmRoute.Legs;

                if (osrmLegs.Count != orderedPlaces.Count - 1)
                {
                    throw new InvalidOperationException(
                        $"OSRM returned {osrmLegs.Count} legs but expected {orderedPlaces.Count - 1}");
                }

                using var transaction = await _context.Database.BeginTransactionAsync();

                try
                {
                    // Delete existing legs
                    var existingLegs = await _context.RouteLegs
                        .Where(l => l.RouteId == routeId)
                        .ToListAsync();

                    _context.RouteLegs.RemoveRange(existingLegs);
                    _logger.LogInformation($"Deleted {existingLegs.Count} existing legs");

                    // Create new legs from OSRM data
                    var newLegs = new List<RouteLeg>();

                    for (int i = 0; i < osrmLegs.Count; i++)
                    {
                        var osrmLeg = osrmLegs[i];
                        var fromPlace = orderedPlaces[i];
                        var toPlace = orderedPlaces[i + 1];

                        // Merge step geometries into single LineString
                        var geometry = GeometryUtils.MergeLegGeometry(osrmLeg);

                        var leg = new RouteLeg
                        {
                            RouteId = routeId,
                            FromRoutePlaceId = fromPlace.Id,
                            ToRoutePlaceId = toPlace.Id,
                            OrderIndex = i,
                            DistanceMeters = (int)Math.Round(osrmLeg.Distance),
                            DurationSeconds = (int)Math.Round(osrmLeg.Duration),
                            Geometry = geometry,
                            Provider = "OSRM",
                            CalculatedAt = DateTime.UtcNow
                        };

                        newLegs.Add(leg);

                        _logger.LogDebug(
                            $"Created leg {i}: {fromPlace.Place.Name} -> {toPlace.Place.Name}, " +
                            $"{leg.DistanceMeters}m, {leg.DurationSeconds}s, " +
                            $"{geometry.Coordinates.Length} geometry points");
                    }

                    _context.RouteLegs.AddRange(newLegs);
                    route.UpdatedAt = DateTime.UtcNow;

                    await _context.SaveChangesAsync();
                    await transaction.CommitAsync();

                    _logger.LogInformation(
                        $"Successfully created {newLegs.Count} legs with geometry for route {routeId}");
                }
                catch
                {
                    await transaction.RollbackAsync();
                    throw;
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Failed to recalculate legs from OSRM for route {routeId}");

                // On error, keep existing legs (if any) but log error
                // Don't throw - allow route to remain in current state
                // Frontend can retry or user can manually trigger recalculation
            }
        }
    }
}
