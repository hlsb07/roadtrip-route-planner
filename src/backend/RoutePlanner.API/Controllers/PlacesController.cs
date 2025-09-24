using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RoutePlanner.API.Data;
using RoutePlanner.API.DTOs;
using RoutePlanner.API.Models;

namespace RoutePlanner.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class PlacesController : ControllerBase
    {
        private readonly AppDbContext _context;

        public PlacesController(AppDbContext context)
        {
            _context = context;
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
                    Latitude = p.Latitude,
                    Longitude = p.Longitude
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
                Latitude = place.Latitude,
                Longitude = place.Longitude
            };

            return Ok(placeDto);
        }

        // POST: api/places
        [HttpPost]
        public async Task<ActionResult<PlaceDto>> CreatePlace(CreatePlaceDto createDto)
        {
            var place = new Place
            {
                Name = createDto.Name,
                Latitude = createDto.Latitude,
                Longitude = createDto.Longitude
            };

            _context.Places.Add(place);
            await _context.SaveChangesAsync();

            var placeDto = new PlaceDto
            {
                Id = place.Id,
                Name = place.Name,
                Latitude = place.Latitude,
                Longitude = place.Longitude
            };

            return CreatedAtAction(nameof(GetPlace), new { id = place.Id }, placeDto);
        }

        // DELETE: api/places/{id}
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeletePlace(int id)
        {
            var place = await _context.Places.FindAsync(id);
            if (place == null)
                return NotFound();

            _context.Places.Remove(place);
            await _context.SaveChangesAsync();

            return NoContent();
        }
    }
}