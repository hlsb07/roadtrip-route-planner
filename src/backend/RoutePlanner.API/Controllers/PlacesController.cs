using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RoutePlanner.API.Data;
using RoutePlanner.API.DTOs;
using RoutePlanner.API.Models;
using NetTopologySuite.Geometries;

namespace RoutePlanner.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class PlacesController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly GeometryFactory _geometryFactory;

        public PlacesController(AppDbContext context)
        {
            _context = context;
            _geometryFactory = new GeometryFactory(new PrecisionModel(), 4326);
        }

        // GET: api/places
        [HttpGet]
        public async Task<ActionResult<List<PlaceDto>>> GetPlaces()
        {
            var places = await _context.Places
                .Select(p => new PlaceDto
                {
                    Id = p.Id,
                    Name = p.Name,
                    Latitude = p.Location.Y,
                    Longitude = p.Location.X
                })
                .ToListAsync();

            return Ok(places);
        }

        // GET: api/places/{id}
        [HttpGet("{id}")]
        public async Task<ActionResult<PlaceDto>> GetPlace(int id)
        {
            var place = await _context.Places.FindAsync(id);

            if (place == null)
                return NotFound();

            var placeDto = new PlaceDto
            {
                Id = place.Id,
                Name = place.Name,
                Latitude = place.Location.Y,
                Longitude = place.Location.X
            };

            return Ok(placeDto);
        }

        // POST: api/places
        [HttpPost]
        public async Task<ActionResult<PlaceDto>> CreatePlace(CreatePlaceDto createDto)
        {
            try
            {
                var place = new Place
                {
                    Name = createDto.Name,
                    Location = _geometryFactory.CreatePoint(new Coordinate(createDto.Longitude, createDto.Latitude))
                };

                _context.Places.Add(place);
                await _context.SaveChangesAsync();

                var placeDto = new PlaceDto
                {
                    Id = place.Id,
                    Name = place.Name,
                    Latitude = place.Location.Y,
                    Longitude = place.Location.X
                };

                return CreatedAtAction(nameof(GetPlace), new { id = place.Id }, placeDto);
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = "Error creating place", error = ex.Message });
            }
        }

        // DELETE: api/places/{id}
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeletePlace(int id)
        {
            var place = await _context.Places
                .Include(p => p.RoutePlaces)
                .FirstOrDefaultAsync(p => p.Id == id);

            if (place == null)
                return NotFound();

            if (place.RoutePlaces.Count > 0)
            {
                var routeNames = await _context.RoutePlaces
                    .Where(rp => rp.PlaceId == id)
                    .Include(rp => rp.Route)
                    .Where(rp => rp.Route != null)
                    .Select(rp => rp.Route!.Name)
                    .ToListAsync();

                return BadRequest(new 
                { 
                    message = "Cannot delete place because it is used in routes",
                    usedInRoutes = routeNames
                });
            }

            _context.Places.Remove(place);
            await _context.SaveChangesAsync();

            return NoContent();
        }

        // DELETE: api/places/{id}/force
        [HttpDelete("{id}/force")]
        public async Task<IActionResult> ForceDeletePlace(int id)
        {
            var place = await _context.Places
                .Include(p => p.RoutePlaces)
                .FirstOrDefaultAsync(p => p.Id == id);

            if (place == null)
                return NotFound();

            _context.RoutePlaces.RemoveRange(place.RoutePlaces);
            _context.Places.Remove(place);
            
            await _context.SaveChangesAsync();

            return Ok(new { message = "Place and all route references deleted successfully" });
        }

        // GET: api/places/nearby
        [HttpGet("nearby")]
        public async Task<ActionResult<List<PlaceDto>>> GetNearbyPlaces(
            [FromQuery] double latitude, 
            [FromQuery] double longitude, 
            [FromQuery] double radiusKm = 50)
        {
            try
            {
                var searchPoint = _geometryFactory.CreatePoint(new Coordinate(longitude, latitude));
                var radiusMeters = radiusKm * 1000;

                var nearbyPlaces = await _context.Places
                    .Where(p => p.Location.IsWithinDistance(searchPoint, radiusMeters))
                    .OrderBy(p => p.Location.Distance(searchPoint))
                    .Select(p => new PlaceDto
                    {
                        Id = p.Id,
                        Name = p.Name,
                        Latitude = p.Location.Y,
                        Longitude = p.Location.X
                    })
                    .ToListAsync();

                return Ok(nearbyPlaces);
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = "Error finding nearby places", error = ex.Message });
            }
        }

        // GET: api/places/{id}/usage
        [HttpGet("{id}/usage")]
        public async Task<ActionResult<object>> GetPlaceUsage(int id)
        {
            var place = await _context.Places.FindAsync(id);
            if (place == null)
                return NotFound();

            var usage = await _context.RoutePlaces
                .Where(rp => rp.PlaceId == id)
                .Include(rp => rp.Route)
                .Where(rp => rp.Route != null)
                .Select(rp => new 
                {
                    RouteId = rp.RouteId,
                    RouteName = rp.Route!.Name,
                    OrderIndex = rp.OrderIndex
                })
                .ToListAsync();

            return Ok(new 
            {
                PlaceId = id,
                PlaceName = place.Name,
                UsedInRoutes = usage.Count,
                Routes = usage
            });
        }
    }
}