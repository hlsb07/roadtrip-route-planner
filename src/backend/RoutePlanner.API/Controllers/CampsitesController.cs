using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RoutePlanner.API.Data;
using RoutePlanner.API.DTOs;
using RoutePlanner.API.Models;
using RoutePlanner.API.Services;
using System.Text.Json;

namespace RoutePlanner.API.Controllers
{
    /// <summary>
    /// Controller for managing campsites and scraping Park4Night data
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    [Produces("application/json")]
    public class CampsitesController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly Park4NightScraperService _scraperService;
        private readonly ILogger<CampsitesController> _logger;

        public CampsitesController(
            AppDbContext context,
            Park4NightScraperService scraperService,
            ILogger<CampsitesController> logger)
        {
            _context = context;
            _scraperService = scraperService;
            _logger = logger;
        }

        /// <summary>
        /// Scrape a campsite from Park4Night and save it to the database
        /// </summary>
        /// <param name="url">Park4Night URL (e.g., https://park4night.com/de/place/561613)</param>
        /// <returns>Scraped and saved campsite data</returns>
        /// <response code="200">Campsite successfully scraped and saved</response>
        /// <response code="400">Invalid URL or scraping failed</response>
        /// <response code="409">Campsite already exists in database</response>
        /// <response code="500">Internal server error</response>
        [HttpGet]
        [ProducesResponseType(typeof(ScrapeCampsiteResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ScrapeCampsiteResponse), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(ScrapeCampsiteResponse), StatusCodes.Status409Conflict)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<ScrapeCampsiteResponse>> ScrapeCampsite([FromQuery] string url)
        {
            try
            {
                // Validate URL
                if (string.IsNullOrWhiteSpace(url) || !url.Contains("park4night.com"))
                {
                    return BadRequest(new ScrapeCampsiteResponse
                    {
                        Success = false,
                        Message = "Invalid Park4Night URL. Please provide a valid URL (e.g., https://park4night.com/de/place/561613)"
                    });
                }

                _logger.LogInformation("Received request to scrape Park4Night URL: {Url}", url);

                // Scrape the campsite
                var campsite = await _scraperService.ScrapeCampsiteAsync(url);

                if (campsite == null)
                {
                    return BadRequest(new ScrapeCampsiteResponse
                    {
                        Success = false,
                        Message = "Failed to scrape campsite data. The URL may be invalid or the page structure has changed."
                    });
                }

                // Check for duplicate (by Park4Night ID or URL)
                var existingCampsite = await _context.Campsites
                    .FirstOrDefaultAsync(c => c.Park4NightId == campsite.Park4NightId || c.SourceUrl == campsite.SourceUrl);

                if (existingCampsite != null)
                {
                    _logger.LogWarning("Campsite already exists: {Id}", existingCampsite.Park4NightId);
                    return Conflict(new ScrapeCampsiteResponse
                    {
                        Success = false,
                        Message = $"Campsite already exists in database (ID: {existingCampsite.Id}, Park4Night ID: {existingCampsite.Park4NightId})",
                        Campsite = MapToDto(existingCampsite)
                    });
                }

                // Save to database
                _context.Campsites.Add(campsite);
                await _context.SaveChangesAsync();

                _logger.LogInformation("Successfully saved campsite: {Name} (ID: {Id})", campsite.Name, campsite.Id);

                return Ok(new ScrapeCampsiteResponse
                {
                    Success = true,
                    Message = $"Successfully scraped and saved campsite: {campsite.Name}",
                    Campsite = MapToDto(campsite)
                });
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "HTTP error while scraping URL: {Url}", url);
                return BadRequest(new ScrapeCampsiteResponse
                {
                    Success = false,
                    Message = "Failed to fetch the Park4Night page. Please check the URL and try again."
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error scraping campsite from URL: {Url}", url);
                return StatusCode(500, new ScrapeCampsiteResponse
                {
                    Success = false,
                    Message = "An unexpected error occurred while scraping the campsite."
                });
            }
        }

        /// <summary>
        /// Get all campsites from the database
        /// </summary>
        /// <returns>List of all campsites</returns>
        /// <response code="200">Returns the list of campsites</response>
        [HttpGet("all")]
        [ProducesResponseType(typeof(List<CampsiteDto>), StatusCodes.Status200OK)]
        public async Task<ActionResult<List<CampsiteDto>>> GetAllCampsites()
        {
            var campsites = await _context.Campsites
                .OrderByDescending(c => c.CreatedAt)
                .ToListAsync();

            return Ok(campsites.Select(MapToDto).ToList());
        }

        /// <summary>
        /// Get a specific campsite by ID
        /// </summary>
        /// <param name="id">Campsite ID</param>
        /// <returns>Campsite details</returns>
        /// <response code="200">Returns the campsite</response>
        /// <response code="404">Campsite not found</response>
        [HttpGet("{id}")]
        [ProducesResponseType(typeof(CampsiteDto), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<ActionResult<CampsiteDto>> GetCampsite(int id)
        {
            var campsite = await _context.Campsites.FindAsync(id);

            if (campsite == null)
            {
                return NotFound();
            }

            return Ok(MapToDto(campsite));
        }

        /// <summary>
        /// Delete a campsite by ID
        /// </summary>
        /// <param name="id">Campsite ID</param>
        /// <returns>No content</returns>
        /// <response code="204">Campsite successfully deleted</response>
        /// <response code="404">Campsite not found</response>
        [HttpDelete("{id}")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> DeleteCampsite(int id)
        {
            var campsite = await _context.Campsites.FindAsync(id);

            if (campsite == null)
            {
                return NotFound();
            }

            // Delete associated campsite images
            // Note: Service and activity SVG icons are NOT deleted as they are shared across multiple campsites
            try
            {
                if (!string.IsNullOrEmpty(campsite.ImagePaths))
                {
                    var imagePaths = JsonSerializer.Deserialize<List<string>>(campsite.ImagePaths);
                    if (imagePaths != null)
                    {
                        foreach (var imagePath in imagePaths)
                        {
                            var fullPath = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", imagePath.TrimStart('/'));
                            if (System.IO.File.Exists(fullPath))
                            {
                                System.IO.File.Delete(fullPath);
                                _logger.LogDebug("Deleted image: {Path}", imagePath);
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error deleting images for campsite {Id}", id);
            }

            _context.Campsites.Remove(campsite);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Deleted campsite {Id}", id);

            return NoContent();
        }

        /// <summary>
        /// Search campsites by name or location
        /// </summary>
        /// <param name="query">Search query</param>
        /// <returns>Matching campsites</returns>
        /// <response code="200">Returns matching campsites</response>
        [HttpGet("search")]
        [ProducesResponseType(typeof(List<CampsiteDto>), StatusCodes.Status200OK)]
        public async Task<ActionResult<List<CampsiteDto>>> SearchCampsites([FromQuery] string query)
        {
            if (string.IsNullOrWhiteSpace(query))
            {
                return Ok(new List<CampsiteDto>());
            }

            var campsites = await _context.Campsites
                .Where(c => c.Name.Contains(query) ||
                           (c.Descriptions != null && c.Descriptions.Contains(query)) ||
                           (c.Types != null && c.Types.Contains(query)))
                .OrderByDescending(c => c.Rating)
                .Take(50)
                .ToListAsync();

            return Ok(campsites.Select(MapToDto).ToList());
        }

        private CampsiteDto MapToDto(Campsite campsite)
        {
            return new CampsiteDto
            {
                Id = campsite.Id,
                Park4NightId = campsite.Park4NightId,
                Name = campsite.Name,
                Latitude = campsite.Latitude,
                Longitude = campsite.Longitude,
                Rating = campsite.Rating,
                Types = campsite.TypesList,
                Services = campsite.ServicesList,
                Activities = campsite.ActivitiesList,
                Price = campsite.Price,
                NumberOfSpots = campsite.NumberOfSpots,
                Descriptions = campsite.DescriptionsDict,
                ImagePaths = string.IsNullOrEmpty(campsite.ImagePaths)
                    ? null
                    : JsonSerializer.Deserialize<List<string>>(campsite.ImagePaths),
                SourceUrl = campsite.SourceUrl,
                CreatedAt = campsite.CreatedAt,
                UpdatedAt = campsite.UpdatedAt
            };
        }
    }
}
