using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RoutePlanner.API.Data;
using RoutePlanner.API.DTOs;
using RoutePlanner.API.Models;
using RoutePlanner.API.Services;
using System.Security.Claims;
using System.Text.Json;

namespace RoutePlanner.API.Controllers
{
    /// <summary>
    /// Controller for managing campsites and scraping campsite data from various sources
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    [Produces("application/json")]
    [Authorize]
    public class CampsitesController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly Park4NightScraperService _park4NightScraperService;
        private readonly CamperMateScraperService _camperMateScraperService;
        private readonly ILogger<CampsitesController> _logger;

        public CampsitesController(
            AppDbContext context,
            Park4NightScraperService park4NightScraperService,
            CamperMateScraperService camperMateScraperService,
            ILogger<CampsitesController> logger)
        {
            _context = context;
            _park4NightScraperService = park4NightScraperService;
            _camperMateScraperService = camperMateScraperService;
            _logger = logger;
        }

        /// <summary>
        /// Get the current authenticated user's ID from JWT claims
        /// </summary>
        private int GetCurrentUserId()
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out var userId))
            {
                throw new UnauthorizedAccessException("User not authenticated");
            }
            return userId;
        }

        /// <summary>
        /// Detects the campsite source from the URL
        /// </summary>
        private CampsiteSource? DetectSource(string url)
        {
            if (string.IsNullOrWhiteSpace(url))
                return null;

            if (url.Contains("park4night.com", StringComparison.OrdinalIgnoreCase))
                return CampsiteSource.Park4Night;

            if (url.Contains("campermate.com", StringComparison.OrdinalIgnoreCase))
                return CampsiteSource.CamperMate;

            return null;
        }

        /// <summary>
        /// Extract Park4Night ID from URL (e.g., https://park4night.com/de/place/561613)
        /// </summary>
        private static string? ExtractPark4NightId(string url)
        {
            var match = System.Text.RegularExpressions.Regex.Match(url, @"(?:place|lieu)/(\d+)");
            return match.Success ? match.Groups[1].Value : null;
        }

        /// <summary>
        /// Extract CamperMate UUID from URL (last path segment that looks like a GUID)
        /// </summary>
        private static string? ExtractCamperMateId(string url)
        {
            var match = System.Text.RegularExpressions.Regex.Match(url, @"/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?:/|$)", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            return match.Success ? match.Groups[1].Value : null;
        }

        /// <summary>
        /// Scrape a campsite from Park4Night or CamperMate and save it to the database.
        /// If the campsite already exists globally, it will be linked to the current user's collection (fast).
        /// Only scrapes from external source if campsite is not in database yet.
        /// </summary>
        /// <param name="url">Campsite URL (Park4Night or CamperMate)</param>
        /// <returns>Scraped and saved campsite data</returns>
        /// <response code="200">Campsite successfully scraped/linked and saved</response>
        /// <response code="400">Invalid URL or scraping failed</response>
        /// <response code="409">Campsite already in user's collection</response>
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
                var currentUserId = GetCurrentUserId();

                // Detect source from URL
                var source = DetectSource(url);

                if (source == null)
                {
                    return BadRequest(new ScrapeCampsiteResponse
                    {
                        Success = false,
                        Message = "Invalid URL. Please provide a valid Park4Night URL (e.g., https://park4night.com/de/place/561613) or CamperMate URL (e.g., https://campermate.com/en/location/...)"
                    });
                }

                _logger.LogInformation("Received request to add campsite from {Source} URL: {Url} for user {UserId}", source, url, currentUserId);

                // OPTIMIZATION: Check database FIRST before scraping
                // Extract ID from URL to check if campsite already exists
                string? externalId = source switch
                {
                    CampsiteSource.Park4Night => ExtractPark4NightId(url),
                    CampsiteSource.CamperMate => ExtractCamperMateId(url),
                    _ => null
                };

                Campsite? existingCampsite = null;

                if (!string.IsNullOrEmpty(externalId))
                {
                    // Check database by external ID (fast lookup)
                    existingCampsite = source switch
                    {
                        CampsiteSource.Park4Night => await _context.Campsites
                            .FirstOrDefaultAsync(c => c.Park4NightId == externalId),
                        CampsiteSource.CamperMate => await _context.Campsites
                            .FirstOrDefaultAsync(c => c.CamperMateId == externalId),
                        _ => null
                    };
                }

                // If campsite exists, just link to user (no scraping needed!)
                if (existingCampsite != null)
                {
                    // Check if user already has this campsite linked
                    var existingLink = await _context.UserCampsites
                        .AnyAsync(uc => uc.UserId == currentUserId && uc.CampsiteId == existingCampsite.Id);

                    if (existingLink)
                    {
                        _logger.LogInformation("Campsite already in user {UserId}'s collection: {Source} ID {ExternalId}", currentUserId, existingCampsite.Source, externalId);
                        return Conflict(new ScrapeCampsiteResponse
                        {
                            Success = false,
                            Message = $"Campsite already in your collection (ID: {existingCampsite.Id})",
                            Campsite = MapToDto(existingCampsite)
                        });
                    }

                    // Create link for this user to existing campsite
                    _context.UserCampsites.Add(new UserCampsite
                    {
                        UserId = currentUserId,
                        CampsiteId = existingCampsite.Id,
                        AddedAt = DateTime.UtcNow
                    });
                    await _context.SaveChangesAsync();

                    _logger.LogInformation("Linked existing campsite {Id} to user {UserId} (skipped scraping)", existingCampsite.Id, currentUserId);

                    return Ok(new ScrapeCampsiteResponse
                    {
                        Success = true,
                        Message = $"Campsite added to your collection: {existingCampsite.Name}",
                        Campsite = MapToDto(existingCampsite)
                    });
                }

                // Campsite not in database - need to scrape it
                _logger.LogInformation("Campsite not in database, scraping from {Source}...", source);

                Campsite? campsite = source switch
                {
                    CampsiteSource.Park4Night => await _park4NightScraperService.ScrapeCampsiteAsync(url),
                    CampsiteSource.CamperMate => await _camperMateScraperService.ScrapeCampsiteAsync(url),
                    _ => null
                };

                if (campsite == null)
                {
                    return BadRequest(new ScrapeCampsiteResponse
                    {
                        Success = false,
                        Message = $"Failed to scrape campsite data from {source}. The URL may be invalid or the page structure has changed."
                    });
                }

                // Create new campsite
                _context.Campsites.Add(campsite);
                await _context.SaveChangesAsync();

                // Create UserCampsite link
                _context.UserCampsites.Add(new UserCampsite
                {
                    UserId = currentUserId,
                    CampsiteId = campsite.Id,
                    AddedAt = DateTime.UtcNow
                });
                await _context.SaveChangesAsync();

                _logger.LogInformation("Created new campsite {Id} and linked to user {UserId}", campsite.Id, currentUserId);

                return Ok(new ScrapeCampsiteResponse
                {
                    Success = true,
                    Message = $"Successfully scraped and saved campsite from {source}: {campsite.Name}",
                    Campsite = MapToDto(campsite)
                });
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "HTTP error while scraping URL: {Url}", url);
                return BadRequest(new ScrapeCampsiteResponse
                {
                    Success = false,
                    Message = "Failed to fetch the page. Please check the URL and try again."
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
        /// Get all campsites in the current user's collection
        /// </summary>
        /// <returns>List of user's campsites</returns>
        /// <response code="200">Returns the list of campsites</response>
        [HttpGet("all")]
        [ProducesResponseType(typeof(List<CampsiteDto>), StatusCodes.Status200OK)]
        public async Task<ActionResult<List<CampsiteDto>>> GetAllCampsites()
        {
            var currentUserId = GetCurrentUserId();

            var campsites = await _context.UserCampsites
                .Where(uc => uc.UserId == currentUserId)
                .Include(uc => uc.Campsite)
                .OrderByDescending(uc => uc.AddedAt)
                .Select(uc => uc.Campsite)
                .ToListAsync();

            return Ok(campsites.Select(MapToDto).ToList());
        }

        /// <summary>
        /// Get a specific campsite by ID (must be in user's collection)
        /// </summary>
        /// <param name="id">Campsite ID</param>
        /// <returns>Campsite details</returns>
        /// <response code="200">Returns the campsite</response>
        /// <response code="404">Campsite not found in user's collection</response>
        [HttpGet("{id}")]
        [ProducesResponseType(typeof(CampsiteDto), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<ActionResult<CampsiteDto>> GetCampsite(int id)
        {
            var currentUserId = GetCurrentUserId();

            // Check if user has access to this campsite
            var userCampsite = await _context.UserCampsites
                .Include(uc => uc.Campsite)
                .FirstOrDefaultAsync(uc => uc.UserId == currentUserId && uc.CampsiteId == id);

            if (userCampsite == null)
            {
                return NotFound();
            }

            return Ok(MapToDto(userCampsite.Campsite));
        }

        /// <summary>
        /// Remove a campsite from user's collection.
        /// If no other users reference it, the campsite and its images are deleted.
        /// </summary>
        /// <param name="id">Campsite ID</param>
        /// <returns>No content</returns>
        /// <response code="204">Campsite successfully removed from collection</response>
        /// <response code="404">Campsite not found in user's collection</response>
        [HttpDelete("{id}")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> DeleteCampsite(int id)
        {
            var currentUserId = GetCurrentUserId();

            // Find user's link to this campsite
            var userCampsite = await _context.UserCampsites
                .FirstOrDefaultAsync(uc => uc.UserId == currentUserId && uc.CampsiteId == id);

            if (userCampsite == null)
            {
                return NotFound();
            }

            // Remove user's link
            _context.UserCampsites.Remove(userCampsite);
            await _context.SaveChangesAsync();

            // Check if any other users still reference this campsite
            var otherUsersCount = await _context.UserCampsites
                .CountAsync(uc => uc.CampsiteId == id);

            if (otherUsersCount == 0)
            {
                // No other users, delete the campsite and images
                var campsite = await _context.Campsites.FindAsync(id);
                if (campsite != null)
                {
                    // Delete associated campsite images
                    await DeleteCampsiteImagesAsync(campsite);

                    _context.Campsites.Remove(campsite);
                    await _context.SaveChangesAsync();

                    _logger.LogInformation("Deleted campsite {Id} and its images (no remaining users)", id);
                }
            }
            else
            {
                _logger.LogInformation("Removed campsite {Id} from user {UserId}'s collection ({OtherCount} other users still reference it)",
                    id, currentUserId, otherUsersCount);
            }

            return NoContent();
        }

        /// <summary>
        /// Helper method to delete campsite images from filesystem
        /// </summary>
        private async Task DeleteCampsiteImagesAsync(Campsite campsite)
        {
            try
            {
                if (!string.IsNullOrEmpty(campsite.ImagePaths))
                {
                    var imagePaths = JsonSerializer.Deserialize<List<string>>(campsite.ImagePaths);
                    if (imagePaths != null)
                    {
                        foreach (var imagePath in imagePaths)
                        {
                            // Images are stored in /shared/images/ (not wwwroot)
                            var fullPath = Path.Combine(Directory.GetCurrentDirectory(), "..", "..", "shared", imagePath.TrimStart('/'));
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
                _logger.LogWarning(ex, "Error deleting images for campsite {Id}", campsite.Id);
            }

            await Task.CompletedTask; // Make method async-compatible
        }

        /// <summary>
        /// Search campsites in user's collection by name, description, or type
        /// </summary>
        /// <param name="query">Search query</param>
        /// <returns>Matching campsites from user's collection</returns>
        /// <response code="200">Returns matching campsites</response>
        [HttpGet("search")]
        [ProducesResponseType(typeof(List<CampsiteDto>), StatusCodes.Status200OK)]
        public async Task<ActionResult<List<CampsiteDto>>> SearchCampsites([FromQuery] string query)
        {
            if (string.IsNullOrWhiteSpace(query))
            {
                return Ok(new List<CampsiteDto>());
            }

            var currentUserId = GetCurrentUserId();

            var campsites = await _context.UserCampsites
                .Where(uc => uc.UserId == currentUserId)
                .Include(uc => uc.Campsite)
                .Select(uc => uc.Campsite)
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
                Source = campsite.Source.ToString(),
                Park4NightId = campsite.Park4NightId,
                CamperMateId = campsite.CamperMateId,
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
