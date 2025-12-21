using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RoutePlanner.API.Data;
using RoutePlanner.API.DTOs;
using RoutePlanner.API.Models;
using RoutePlanner.API.Services;

namespace RoutePlanner.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class RoutesController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IRouteScheduleService _scheduleService;
        private readonly IRouteLegService _legService;
        private readonly ILogger<RoutesController> _logger;

        public RoutesController(
            AppDbContext context,
            IRouteScheduleService scheduleService,
            IRouteLegService legService,
            ILogger<RoutesController> logger)
        {
            _context = context;
            _scheduleService = scheduleService;
            _legService = legService;
            _logger = logger;
        }

        // GET: api/routes - Alle Routen anzeigen
        [HttpGet]
        public async Task<ActionResult<List<RouteListDto>>> GetRoutes()
        {
            var routes = await _context.Routes
                .Include(r => r.Places)
                .Select(r => new RouteListDto
                {
                    Id = r.Id,
                    Name = r.Name,
                    PlaceCount = r.Places.Count,
                    CreatedAt = r.CreatedAt
                })
                .OrderByDescending(r => r.CreatedAt)
                .ToListAsync();

            return Ok(routes);
        }

        // GET: api/routes/{id} - Spezifische Route mit allen Orten
        [HttpGet("{id}")]
        public async Task<ActionResult<RouteDto>> GetRoute(int id)
        {
            var route = await _context.Routes
                .Include(r => r.Places)
                    .ThenInclude(rp => rp.Place)
                        .ThenInclude(p => p.PlaceCategories)
                            .ThenInclude(pc => pc.Category)
                .Include(r => r.Places)
                    .ThenInclude(rp => rp.Place)
                        .ThenInclude(p => p.PlaceCountries)
                            .ThenInclude(pc => pc.Country)
                .FirstOrDefaultAsync(r => r.Id == id);

            if (route == null)
                return NotFound($"Route with ID {id} not found");

            var routeDto = new RouteDto
            {
                Id = route.Id,
                Name = route.Name,
                Description = route.Description,
                CreatedAt = route.CreatedAt,
                UpdatedAt = route.UpdatedAt,
                PlaceCount = route.Places.Count,
                Places = route.Places
                    .OrderBy(rp => rp.OrderIndex)
                    .Select(rp => new RoutePlaceDto
                    {
                        Id = rp.Place.Id,
                        Name = rp.Place.Name,
                        Latitude = rp.Place.Location.Y,
                        Longitude = rp.Place.Location.X,
                        Notes = rp.Place.Notes,
                        OrderIndex = rp.OrderIndex,
                        GooglePlaceId = rp.Place.GooglePlaceId,
                        Categories = rp.Place.PlaceCategories.Select(pc => new CategoryDto
                        {
                            Id = pc.Category.Id,
                            Name = pc.Category.Name,
                            Icon = pc.Category.Icon,
                            Description = pc.Category.Description
                        }).ToList(),
                        Countries = rp.Place.PlaceCountries.Select(pc => new CountryDto
                        {
                            Id = pc.Country.Id,
                            Name = pc.Country.Name,
                            Code = pc.Country.Code,
                            Icon = pc.Country.Icon,
                            Description = pc.Country.Description
                        }).ToList()
                    })
                    .ToList()
            };

            return Ok(routeDto);
        }

        // POST: api/routes - Neue Route erstellen
        [HttpPost]
        public async Task<ActionResult<RouteDto>> CreateRoute(CreateRouteDto createDto)
        {
            var route = new Models.Route
            {
                Name = createDto.Name,
                Description = createDto.Description,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            _context.Routes.Add(route);
            await _context.SaveChangesAsync();

            var routeDto = new RouteDto
            {
                Id = route.Id,
                Name = route.Name,
                Description = route.Description,
                CreatedAt = route.CreatedAt,
                UpdatedAt = route.UpdatedAt,
                Places = new List<RoutePlaceDto>(),
                PlaceCount = 0
            };

            return CreatedAtAction(nameof(GetRoute), new { id = route.Id }, routeDto);
        }

        // PUT: api/routes/{id} - Route aktualisieren
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateRoute(int id, UpdateRouteDto updateDto)
        {
            var route = await _context.Routes.FindAsync(id);
            if (route == null)
                return NotFound();

            route.Name = updateDto.Name;
            route.Description = updateDto.Description;
            route.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();

            return NoContent();
        }

        // DELETE: api/routes/{id} - Route löschen
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteRoute(int id)
        {
            var route = await _context.Routes
                .Include(r => r.Places)
                .FirstOrDefaultAsync(r => r.Id == id);

            if (route == null)
                return NotFound();

            _context.Routes.Remove(route);
            await _context.SaveChangesAsync();

            return NoContent();
        }

        // POST: api/routes/{id}/places - Ort zu Route hinzufügen
        [HttpPost("{id}/places")]
        public async Task<IActionResult> AddPlaceToRoute(int id, AddPlaceToRouteDto addDto)
        {
            var route = await _context.Routes
                .Include(r => r.Places)
                .FirstOrDefaultAsync(r => r.Id == id);

            if (route == null)
                return NotFound("Route not found");

            var place = await _context.Places.FindAsync(addDto.PlaceId);
            if (place == null)
                return NotFound("Place not found");

            // Prüfen ob Ort bereits in Route
            if (route.Places.Any(rp => rp.PlaceId == addDto.PlaceId))
                return BadRequest("Place already in route");

            // OrderIndex bestimmen - use max + 1 to avoid conflicts
            var orderIndex = addDto.OrderIndex ?? (route.Places.Any() ? route.Places.Max(rp => rp.OrderIndex) + 1 : 0);

            var routePlace = new RoutePlace
            {
                RouteId = id,
                PlaceId = addDto.PlaceId,
                OrderIndex = orderIndex
            };

            _context.RoutePlaces.Add(routePlace);
            route.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            // Auto-recalculate legs from OSRM after adding place
            try
            {
                await _legService.RecalculateLegsFromOsrm(id);
                _logger.LogInformation($"Auto-recalculated legs after adding place to route {id}");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, $"Failed to auto-recalculate legs for route {id}");
                // Don't fail the operation if recalculation fails
            }

            return Ok(new { message = "Place added to route successfully" });
        }

        // DELETE: api/routes/{id}/places/{placeId} - Ort aus Route entfernen
        [HttpDelete("{id}/places/{placeId}")]
        public async Task<IActionResult> RemovePlaceFromRoute(int id, int placeId)
        {
            var routePlace = await _context.RoutePlaces
                .FirstOrDefaultAsync(rp => rp.RouteId == id && rp.PlaceId == placeId);

            if (routePlace == null)
                return NotFound("Place not found in route");

            _context.RoutePlaces.Remove(routePlace);

            // UpdatedAt der Route aktualisieren
            var route = await _context.Routes.FindAsync(id);
            if (route != null)
            {
                route.UpdatedAt = DateTime.UtcNow;
            }

            await _context.SaveChangesAsync();

            // Auto-recalculate legs from OSRM after removing place
            try
            {
                await _legService.RecalculateLegsFromOsrm(id);
                _logger.LogInformation($"Auto-recalculated legs after removing place from route {id}");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, $"Failed to auto-recalculate legs for route {id}");
                // Don't fail the operation if recalculation fails
            }

            return NoContent();
        }

        // PUT: api/routes/{id}/places/reorder - Reihenfolge der Orte ändern
        [HttpPut("{id}/places/reorder")]
        public async Task<IActionResult> ReorderPlaces(int id, [FromBody] List<int> placeIds)
        {
            var route = await _context.Routes
                .Include(r => r.Places)
                .FirstOrDefaultAsync(r => r.Id == id);

            if (route == null)
                return NotFound();

            // Step 1: Set all OrderIndex to negative values to avoid unique constraint conflicts
            for (int i = 0; i < route.Places.Count; i++)
            {
                route.Places.ElementAt(i).OrderIndex = -(i + 1);
            }
            await _context.SaveChangesAsync();

            // Step 2: Set the new order
            for (int i = 0; i < placeIds.Count; i++)
            {
                var routePlace = route.Places.FirstOrDefault(rp => rp.PlaceId == placeIds[i]);
                if (routePlace != null)
                {
                    routePlace.OrderIndex = i;
                }
            }

            route.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            // Auto-recalculate legs from OSRM after reordering places
            try
            {
                await _legService.RecalculateLegsFromOsrm(id);
                _logger.LogInformation($"Auto-recalculated legs after reordering places in route {id}");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, $"Failed to auto-recalculate legs for route {id}");
                // Don't fail the operation if recalculation fails
            }

            return NoContent();
        }

        // BONUS: PostGIS Feature - Route-Statistiken
        [HttpGet("{id}/stats")]
        public async Task<ActionResult<object>> GetRouteStats(int id)
        {
            var route = await _context.Routes
                .Include(r => r.Places)
                    .ThenInclude(rp => rp.Place)
                .FirstOrDefaultAsync(r => r.Id == id);

            if (route == null)
                return NotFound();

            if (route.Places.Count < 2)
            {
                return Ok(new 
                { 
                    routeId = id,
                    totalDistance = 0.0,
                    placeCount = route.Places.Count,
                    message = "Need at least 2 places to calculate distance"
                });
            }

            // Gesamtdistanz der Route berechnen (PostGIS)
            var orderedPlaces = route.Places.OrderBy(rp => rp.OrderIndex).ToList();
            double totalDistance = 0;

            for (int i = 0; i < orderedPlaces.Count - 1; i++)
            {
                var place1 = orderedPlaces[i].Place;
                var place2 = orderedPlaces[i + 1].Place;
                
                var distance = place1.Location.Distance(place2.Location);
                totalDistance += distance;
            }

            return Ok(new
            {
                routeId = id,
                totalDistanceKm = Math.Round(totalDistance / 1000, 2),
                placeCount = route.Places.Count,
                startPlace = orderedPlaces.First().Place.Name,
                endPlace = orderedPlaces.Last().Place.Name
            });
        }

        // ===== Schedule Management Endpoints =====

        // GET: api/routes/{id}/itinerary - Get full route with schedule, stops, and legs
        [HttpGet("{id}/itinerary")]
        public async Task<ActionResult<RouteItineraryDto>> GetItinerary(int id)
        {
            try
            {
                var itinerary = await _scheduleService.GetItinerary(id);
                if (itinerary == null)
                    return NotFound($"Route with ID {id} not found");

                return Ok(itinerary);
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = "Error retrieving itinerary", error = ex.Message });
            }
        }

        // PUT: api/routes/{id}/schedule-settings - Update route schedule settings
        [HttpPut("{id}/schedule-settings")]
        public async Task<IActionResult> UpdateScheduleSettings(int id, [FromBody] UpdateRouteScheduleDto dto)
        {
            try
            {
                await _scheduleService.UpdateRouteScheduleSettings(id, dto);
                return NoContent();
            }
            catch (InvalidOperationException ex)
            {
                return NotFound(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = "Error updating schedule settings", error = ex.Message });
            }
        }

        // PUT: api/routes/{routeId}/places/{routePlaceId}/schedule - Update stop schedule
        [HttpPut("{routeId}/places/{routePlaceId}/schedule")]
        public async Task<IActionResult> UpdateRoutePlaceSchedule(int routeId, int routePlaceId, [FromBody] RoutePlaceScheduleUpdateDto dto)
        {
            try
            {
                await _scheduleService.UpdateRoutePlaceSchedule(routeId, routePlaceId, dto);
                return NoContent();
            }
            catch (InvalidOperationException ex)
            {
                return NotFound(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = "Error updating stop schedule", error = ex.Message });
            }
        }

        // ===== Leg Management Endpoints =====

        // POST: api/routes/{id}/legs/rebuild - Rebuild leg skeleton
        [HttpPost("{id}/legs/rebuild")]
        public async Task<IActionResult> RebuildLegSkeleton(int id)
        {
            try
            {
                await _legService.RebuildLegSkeleton(id);
                return Ok(new { message = $"Successfully rebuilt leg skeleton for route {id}" });
            }
            catch (InvalidOperationException ex)
            {
                return NotFound(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = "Error rebuilding leg skeleton", error = ex.Message });
            }
        }

        // PUT: api/routes/{routeId}/legs/{legId} - Update leg metrics
        [HttpPut("{routeId}/legs/{legId}")]
        public async Task<IActionResult> UpdateLegMetrics(int routeId, int legId, [FromBody] UpdateLegMetricsDto dto)
        {
            try
            {
                await _legService.UpdateLegMetrics(routeId, legId, dto.DistanceMeters, dto.DurationSeconds);
                return NoContent();
            }
            catch (InvalidOperationException ex)
            {
                return NotFound(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = "Error updating leg metrics", error = ex.Message });
            }
        }

        // POST: api/routes/{id}/legs/recalculate - Recalculate legs from OSRM
        [HttpPost("{id}/legs/recalculate")]
        public async Task<IActionResult> RecalculateLegsFromOsrm(int id)
        {
            try
            {
                await _legService.RecalculateLegsFromOsrm(id);
                return Ok(new { message = $"Successfully recalculated legs for route {id}" });
            }
            catch (InvalidOperationException ex)
            {
                return NotFound(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = "Error recalculating legs", error = ex.Message });
            }
        }
    }
}