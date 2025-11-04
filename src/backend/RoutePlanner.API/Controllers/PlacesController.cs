using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RoutePlanner.API.Data;
using RoutePlanner.API.DTOs;
using RoutePlanner.API.Models;
using RoutePlanner.API.Services;
using NetTopologySuite.Geometries;

namespace RoutePlanner.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class PlacesController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IPlaceService _placeService;
        private readonly GeometryFactory _geometryFactory;
        private const int CurrentUserId = 1; // Hardcoded until authentication is implemented

        public PlacesController(AppDbContext context, IPlaceService placeService)
        {
            _context = context;
            _placeService = placeService;
            _geometryFactory = new GeometryFactory(new PrecisionModel(), 4326);
        }

        // GET: api/places
        [HttpGet]
        public async Task<ActionResult<List<PlaceDto>>> GetPlaces()
        {
            var places = await _context.Places
                .Where(p => p.UserId == CurrentUserId)
                .Include(p => p.PlaceCategories)
                .ThenInclude(pc => pc.Category)
                .Include(p => p.PlaceCountries)
                .ThenInclude(pc => pc.Country)
                .Select(p => new PlaceDto
                {
                    Id = p.Id,
                    UserId = p.UserId,
                    Name = p.Name,
                    Latitude = p.Location.Y,
                    Longitude = p.Location.X,
                    Notes = p.Notes,
                    GooglePlaceId = p.GooglePlaceId,
                    CreatedAt = p.CreatedAt,
                    UpdatedAt = p.UpdatedAt,
                    LastViewedAt = p.LastViewedAt,
                    Categories = p.PlaceCategories.Select(pc => new CategoryDto
                    {
                        Id = pc.Category.Id,
                        Name = pc.Category.Name,
                        Icon = pc.Category.Icon,
                        Description = pc.Category.Description
                    }).ToList(),
                    Countries = p.PlaceCountries.Select(pc => new CountryDto
                    {
                        Id = pc.Country.Id,
                        Name = pc.Country.Name,
                        Code = pc.Country.Code,
                        Icon = pc.Country.Icon,
                        Description = pc.Country.Description
                    }).ToList()
                })
                .ToListAsync();

            return Ok(places);
        }

        // GET: api/places/{id}
        [HttpGet("{id}")]
        public async Task<ActionResult<PlaceDto>> GetPlace(int id)
        {
            var place = await _context.Places
                .Where(p => p.UserId == CurrentUserId)
                .Include(p => p.PlaceCategories)
                .ThenInclude(pc => pc.Category)
                .Include(p => p.PlaceCountries)
                .ThenInclude(pc => pc.Country)
                .FirstOrDefaultAsync(p => p.Id == id);

            if (place == null)
                return NotFound();

            // Update LastViewedAt
            place.LastViewedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            var placeDto = new PlaceDto
            {
                Id = place.Id,
                UserId = place.UserId,
                Name = place.Name,
                Latitude = place.Location.Y,
                Longitude = place.Location.X,
                Notes = place.Notes,
                GooglePlaceId = place.GooglePlaceId,
                CreatedAt = place.CreatedAt,
                UpdatedAt = place.UpdatedAt,
                LastViewedAt = place.LastViewedAt,
                Categories = place.PlaceCategories.Select(pc => new CategoryDto
                {
                    Id = pc.Category.Id,
                    Name = pc.Category.Name,
                    Icon = pc.Category.Icon,
                    Description = pc.Category.Description
                }).ToList(),
                Countries = place.PlaceCountries.Select(pc => new CountryDto
                {
                    Id = pc.Country.Id,
                    Name = pc.Country.Name,
                    Code = pc.Country.Code,
                    Icon = pc.Country.Icon,
                    Description = pc.Country.Description
                }).ToList()
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
                    UserId = CurrentUserId,
                    Name = createDto.Name,
                    Location = _geometryFactory.CreatePoint(new Coordinate(createDto.Longitude, createDto.Latitude)),
                    Notes = createDto.Notes
                };

                _context.Places.Add(place);
                await _context.SaveChangesAsync();

                var placeDto = new PlaceDto
                {
                    Id = place.Id,
                    UserId = place.UserId,
                    Name = place.Name,
                    Latitude = place.Location.Y,
                    Longitude = place.Location.X,
                    Notes = place.Notes,
                    CreatedAt = place.CreatedAt,
                    UpdatedAt = place.UpdatedAt
                };

                return CreatedAtAction(nameof(GetPlace), new { id = place.Id }, placeDto);
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = "Error creating place", error = ex.Message });
            }
        }

        // PUT: api/places/{id}
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdatePlace(int id, UpdatePlaceDto updateDto)
        {
            var place = await _context.Places.FirstOrDefaultAsync(p => p.Id == id && p.UserId == CurrentUserId);

            if (place == null)
                return NotFound();

            // Update name if provided
            if (!string.IsNullOrWhiteSpace(updateDto.Name))
            {
                place.Name = updateDto.Name;
            }

            // Update location if provided
            if (updateDto.Latitude.HasValue && updateDto.Longitude.HasValue)
            {
                place.Location = _geometryFactory.CreatePoint(
                    new Coordinate(updateDto.Longitude.Value, updateDto.Latitude.Value));
            }

            // Update notes if provided
            if (updateDto.Notes != null)
            {
                place.Notes = updateDto.Notes;
            }

            place.UpdatedAt = DateTime.UtcNow;

            try
            {
                await _context.SaveChangesAsync();
                return NoContent();
            }
            catch (DbUpdateConcurrencyException)
            {
                if (!await _context.Places.AnyAsync(p => p.Id == id && p.UserId == CurrentUserId))
                    return NotFound();
                throw;
            }
        }

        // DELETE: api/places/{id}
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeletePlace(int id)
        {
            var place = await _context.Places
                .Where(p => p.UserId == CurrentUserId)
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
                .Where(p => p.UserId == CurrentUserId)
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
                    .Where(p => p.UserId == CurrentUserId)
                    .Include(p => p.PlaceCategories)
                    .ThenInclude(pc => pc.Category)
                    .Include(p => p.PlaceCountries)
                    .ThenInclude(pc => pc.Country)
                    .Where(p => p.Location.IsWithinDistance(searchPoint, radiusMeters))
                    .OrderBy(p => p.Location.Distance(searchPoint))
                    .Select(p => new PlaceDto
                    {
                        Id = p.Id,
                        UserId = p.UserId,
                        Name = p.Name,
                        Latitude = p.Location.Y,
                        Longitude = p.Location.X,
                        Notes = p.Notes,
                        GooglePlaceId = p.GooglePlaceId,
                        CreatedAt = p.CreatedAt,
                        UpdatedAt = p.UpdatedAt,
                        LastViewedAt = p.LastViewedAt,
                        Categories = p.PlaceCategories.Select(pc => new CategoryDto
                        {
                            Id = pc.Category.Id,
                            Name = pc.Category.Name,
                            Icon = pc.Category.Icon,
                            Description = pc.Category.Description
                        }).ToList(),
                        Countries = p.PlaceCountries.Select(pc => new CountryDto
                        {
                            Id = pc.Country.Id,
                            Name = pc.Country.Name,
                            Code = pc.Country.Code,
                            Icon = pc.Country.Icon,
                            Description = pc.Country.Description
                        }).ToList()
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
            var place = await _context.Places.FirstOrDefaultAsync(p => p.Id == id && p.UserId == CurrentUserId);
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

        // POST: api/places/{id}/categories
        [HttpPost("{id}/categories")]
        public async Task<IActionResult> AssignCategoryToPlace(int id, AssignCategoryDto assignDto)
        {
            var place = await _context.Places.FirstOrDefaultAsync(p => p.Id == id && p.UserId == CurrentUserId);
            if (place == null)
                return NotFound(new { message = "Place not found" });

            var category = await _context.Categories.FindAsync(assignDto.CategoryId);
            if (category == null)
                return NotFound(new { message = "Category not found" });

            // Check if the relationship already exists
            var exists = await _context.PlaceCategories
                .AnyAsync(pc => pc.PlaceId == id && pc.CategoryId == assignDto.CategoryId);

            if (exists)
                return BadRequest(new { message = "Place is already assigned to this category" });

            var placeCategory = new PlaceCategory
            {
                PlaceId = id,
                CategoryId = assignDto.CategoryId
            };

            _context.PlaceCategories.Add(placeCategory);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Category assigned to place successfully" });
        }

        // DELETE: api/places/{id}/categories/{categoryId}
        [HttpDelete("{id}/categories/{categoryId}")]
        public async Task<IActionResult> RemoveCategoryFromPlace(int id, int categoryId)
        {
            var placeCategory = await _context.PlaceCategories
                .FirstOrDefaultAsync(pc => pc.PlaceId == id && pc.CategoryId == categoryId);

            if (placeCategory == null)
                return NotFound(new { message = "Category assignment not found" });

            _context.PlaceCategories.Remove(placeCategory);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Category removed from place successfully" });
        }

        // GET: api/places/{id}/categories
        [HttpGet("{id}/categories")]
        public async Task<ActionResult<List<CategoryDto>>> GetPlaceCategories(int id)
        {
            var place = await _context.Places.FirstOrDefaultAsync(p => p.Id == id && p.UserId == CurrentUserId);
            if (place == null)
                return NotFound();

            var categories = await _context.PlaceCategories
                .Where(pc => pc.PlaceId == id)
                .Include(pc => pc.Category)
                .Select(pc => new CategoryDto
                {
                    Id = pc.Category.Id,
                    Name = pc.Category.Name,
                    Icon = pc.Category.Icon,
                    Description = pc.Category.Description
                })
                .ToListAsync();

            return Ok(categories);
        }

        // POST: api/places/{id}/countries
        [HttpPost("{id}/countries")]
        public async Task<IActionResult> AssignCountryToPlace(int id, AssignCountryDto assignDto)
        {
            var place = await _context.Places.FirstOrDefaultAsync(p => p.Id == id && p.UserId == CurrentUserId);
            if (place == null)
                return NotFound(new { message = "Place not found" });

            var country = await _context.Countries.FindAsync(assignDto.CountryId);
            if (country == null)
                return NotFound(new { message = "Country not found" });

            // Check if the relationship already exists
            var exists = await _context.PlaceCountries
                .AnyAsync(pc => pc.PlaceId == id && pc.CountryId == assignDto.CountryId);

            if (exists)
                return BadRequest(new { message = "Place is already assigned to this country" });

            var placeCountry = new PlaceCountry
            {
                PlaceId = id,
                CountryId = assignDto.CountryId
            };

            _context.PlaceCountries.Add(placeCountry);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Country assigned to place successfully" });
        }

        // DELETE: api/places/{id}/countries/{countryId}
        [HttpDelete("{id}/countries/{countryId}")]
        public async Task<IActionResult> RemoveCountryFromPlace(int id, int countryId)
        {
            var placeCountry = await _context.PlaceCountries
                .FirstOrDefaultAsync(pc => pc.PlaceId == id && pc.CountryId == countryId);

            if (placeCountry == null)
                return NotFound(new { message = "Country assignment not found" });

            _context.PlaceCountries.Remove(placeCountry);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Country removed from place successfully" });
        }

        // GET: api/places/{id}/countries
        [HttpGet("{id}/countries")]
        public async Task<ActionResult<List<CountryDto>>> GetPlaceCountries(int id)
        {
            var place = await _context.Places.FirstOrDefaultAsync(p => p.Id == id && p.UserId == CurrentUserId);
            if (place == null)
                return NotFound();

            var countries = await _context.PlaceCountries
                .Where(pc => pc.PlaceId == id)
                .Include(pc => pc.Country)
                .Select(pc => new CountryDto
                {
                    Id = pc.Country.Id,
                    Name = pc.Country.Name,
                    Code = pc.Country.Code,
                    Icon = pc.Country.Icon,
                    Description = pc.Country.Description
                })
                .ToListAsync();

            return Ok(countries);
        }

        // ===== Google Places Integration Endpoints =====

        // POST: api/places/from-google
        [HttpPost("from-google")]
        public async Task<ActionResult<PlaceDto>> CreatePlaceFromGoogle(CreatePlaceFromGoogleDto createDto)
        {
            try
            {
                var place = await _placeService.CreatePlaceFromGoogle(
                    createDto.GooglePlaceId,
                    CurrentUserId,
                    createDto.Notes);

                var placeDto = new PlaceDto
                {
                    Id = place.Id,
                    UserId = place.UserId,
                    Name = place.Name,
                    Latitude = place.Location.Y,
                    Longitude = place.Location.X,
                    Notes = place.Notes,
                    GooglePlaceId = place.GooglePlaceId,
                    CreatedAt = place.CreatedAt,
                    UpdatedAt = place.UpdatedAt
                };

                return CreatedAtAction(nameof(GetPlace), new { id = place.Id }, placeDto);
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = "Error creating place from Google", error = ex.Message });
            }
        }

        // POST: api/places/check-duplicate
        [HttpPost("check-duplicate")]
        public async Task<ActionResult<DuplicateCheckResponse>> CheckDuplicate(DuplicateCheckRequest request)
        {
            try
            {
                var result = await _placeService.CheckDuplicate(request.GooglePlaceId, CurrentUserId);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = "Error checking duplicate", error = ex.Message });
            }
        }

        // POST: api/places/{id}/refresh-google
        [HttpPost("{id}/refresh-google")]
        public async Task<ActionResult<RefreshGoogleDataResponse>> RefreshGoogleData(int id)
        {
            try
            {
                // Verify the place exists and belongs to current user
                var place = await _context.Places.FirstOrDefaultAsync(p => p.Id == id && p.UserId == CurrentUserId);
                if (place == null)
                    return NotFound(new { message = "Place not found" });

                if (string.IsNullOrEmpty(place.GooglePlaceId))
                    return BadRequest(new { message = "This place is not linked to Google Places" });

                var result = await _placeService.RefreshGoogleData(id);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = "Error refreshing Google data", error = ex.Message });
            }
        }

        // GET: api/places/{id}/enriched
        [HttpGet("{id}/enriched")]
        public async Task<ActionResult<EnrichedPlaceDto>> GetEnrichedPlace(int id)
        {
            try
            {
                var enrichedPlace = await _placeService.GetEnrichedPlace(id, CurrentUserId);

                if (enrichedPlace == null)
                    return NotFound();

                // Update LastViewedAt
                var place = await _context.Places.FindAsync(id);
                if (place != null)
                {
                    place.LastViewedAt = DateTime.UtcNow;
                    await _context.SaveChangesAsync();
                }

                return Ok(enrichedPlace);
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = "Error getting enriched place", error = ex.Message });
            }
        }

        // PUT: api/places/{id}/notes
        [HttpPut("{id}/notes")]
        public async Task<IActionResult> UpdateNotes(int id, UpdateNotesDto updateDto)
        {
            try
            {
                var success = await _placeService.UpdateNotes(id, CurrentUserId, updateDto.Notes);

                if (!success)
                    return NotFound();

                return NoContent();
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = "Error updating notes", error = ex.Message });
            }
        }

        // POST: api/places/reverse-geocode
        [HttpPost("reverse-geocode")]
        public async Task<ActionResult<object>> ReverseGeocodeExistingPlaces()
        {
            try
            {
                var count = await _placeService.ReverseGeocodeExistingPlaces(CurrentUserId);

                return Ok(new
                {
                    message = $"Successfully linked {count} places to Google data",
                    placesLinked = count
                });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = "Error reverse geocoding places", error = ex.Message });
            }
        }
    }
}