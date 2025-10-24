using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RoutePlanner.API.Data;
using RoutePlanner.API.DTOs;
using RoutePlanner.API.Models;

namespace RoutePlanner.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class CountriesController : ControllerBase
    {
        private readonly AppDbContext _context;

        public CountriesController(AppDbContext context)
        {
            _context = context;
        }

        // GET: api/countries
        [HttpGet]
        public async Task<ActionResult<List<CountryDto>>> GetCountries()
        {
            var countries = await _context.Countries
                .Select(c => new CountryDto
                {
                    Id = c.Id,
                    Name = c.Name,
                    Code = c.Code,
                    Icon = c.Icon,
                    Description = c.Description
                })
                .ToListAsync();

            return Ok(countries);
        }

        // GET: api/countries/{id}
        [HttpGet("{id}")]
        public async Task<ActionResult<CountryDto>> GetCountry(int id)
        {
            var country = await _context.Countries.FindAsync(id);

            if (country == null)
                return NotFound();

            var countryDto = new CountryDto
            {
                Id = country.Id,
                Name = country.Name,
                Code = country.Code,
                Icon = country.Icon,
                Description = country.Description
            };

            return Ok(countryDto);
        }

        // POST: api/countries
        [HttpPost]
        public async Task<ActionResult<CountryDto>> CreateCountry(CreateCountryDto createDto)
        {
            var country = new Country
            {
                Name = createDto.Name,
                Code = createDto.Code,
                Icon = createDto.Icon,
                Description = createDto.Description
            };

            _context.Countries.Add(country);
            await _context.SaveChangesAsync();

            var countryDto = new CountryDto
            {
                Id = country.Id,
                Name = country.Name,
                Code = country.Code,
                Icon = country.Icon,
                Description = country.Description
            };

            return CreatedAtAction(nameof(GetCountry), new { id = country.Id }, countryDto);
        }

        // PUT: api/countries/{id}
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateCountry(int id, UpdateCountryDto updateDto)
        {
            var country = await _context.Countries.FindAsync(id);

            if (country == null)
                return NotFound();

            country.Name = updateDto.Name;
            country.Code = updateDto.Code;
            country.Icon = updateDto.Icon;
            country.Description = updateDto.Description;

            await _context.SaveChangesAsync();

            return NoContent();
        }

        // DELETE: api/countries/{id}
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteCountry(int id)
        {
            var country = await _context.Countries
                .Include(c => c.PlaceCountries)
                .FirstOrDefaultAsync(c => c.Id == id);

            if (country == null)
                return NotFound();

            // Check if country is being used by any places
            if (country.PlaceCountries.Count > 0)
            {
                return BadRequest(new
                {
                    message = "Cannot delete country because it is assigned to places",
                    placesCount = country.PlaceCountries.Count
                });
            }

            _context.Countries.Remove(country);
            await _context.SaveChangesAsync();

            return NoContent();
        }

        // GET: api/countries/{id}/places
        [HttpGet("{id}/places")]
        public async Task<ActionResult<List<PlaceDto>>> GetPlacesByCountry(int id)
        {
            var country = await _context.Countries.FindAsync(id);

            if (country == null)
                return NotFound();

            var places = await _context.PlaceCountries
                .Where(pc => pc.CountryId == id)
                .Include(pc => pc.Place)
                .ThenInclude(p => p.PlaceCategories)
                .ThenInclude(pc => pc.Category)
                .Include(pc => pc.Place)
                .ThenInclude(p => p.PlaceCountries)
                .ThenInclude(pc => pc.Country)
                .Select(pc => new PlaceDto
                {
                    Id = pc.Place.Id,
                    Name = pc.Place.Name,
                    Latitude = pc.Place.Location.Y,
                    Longitude = pc.Place.Location.X,
                    Categories = pc.Place.PlaceCategories
                        .Select(pcat => new CategoryDto
                        {
                            Id = pcat.Category.Id,
                            Name = pcat.Category.Name,
                            Icon = pcat.Category.Icon,
                            Description = pcat.Category.Description
                        }).ToList(),
                    Countries = pc.Place.PlaceCountries
                        .Select(pco => new CountryDto
                        {
                            Id = pco.Country.Id,
                            Name = pco.Country.Name,
                            Code = pco.Country.Code,
                            Icon = pco.Country.Icon,
                            Description = pco.Country.Description
                        }).ToList()
                })
                .ToListAsync();

            return Ok(places);
        }
    }
}
