using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RoutePlanner.API.Data;
using RoutePlanner.API.DTOs;
using RoutePlanner.API.Models;

namespace RoutePlanner.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class RoutesController : ControllerBase
    {
        private readonly AppDbContext _context;

        public RoutesController(AppDbContext context)
        {
            _context = context;
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
                    .Select(rp => new PlaceDto
                    {
                        Id = rp.Place.Id,
                        Name = rp.Place.Name,
                        Latitude = rp.Place.Latitude,
                        Longitude = rp.Place.Longitude
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
                Places = new List<PlaceDto>(),
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

            // OrderIndex bestimmen
            var orderIndex = addDto.OrderIndex ?? route.Places.Count;

            var routePlace = new RoutePlace
            {
                RouteId = id,
                PlaceId = addDto.PlaceId,
                OrderIndex = orderIndex
            };

            _context.RoutePlaces.Add(routePlace);
            route.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

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

            return NoContent();
        }

        // PUT: api/routes/{id}/places/reorder - Reihenfolge der Orte ändern
        [HttpPut("{id}/places/reorder")]
        public async Task<IActionResult> ReorderPlaces(int id, List<int> placeIds)
        {
            var route = await _context.Routes
                .Include(r => r.Places)
                .FirstOrDefaultAsync(r => r.Id == id);

            if (route == null)
                return NotFound();

            // Neue Reihenfolge setzen
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

            return NoContent();
        }
    }
}