using Microsoft.AspNetCore.Mvc;
using RoutePlanner.API.DTOs;
using RoutePlanner.API.Services;

namespace RoutePlanner.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class GoogleMapsController : ControllerBase
    {
        private readonly GoogleMapsService _googleMapsService;
        private readonly ILogger<GoogleMapsController> _logger;

        public GoogleMapsController(
            GoogleMapsService googleMapsService,
            ILogger<GoogleMapsController> logger)
        {
            _googleMapsService = googleMapsService;
            _logger = logger;
        }

        /// <summary>
        /// Search places with intelligent caching
        /// GET: api/googlemaps/search?query=Auckland
        /// </summary>
        [HttpGet("search")]
        public async Task<ActionResult<GoogleMapsSearchResponse>> SearchPlaces([FromQuery] string query)
        {
            if (string.IsNullOrWhiteSpace(query))
            {
                return BadRequest("Search query is required");
            }

            try
            {
                var results = await _googleMapsService.SearchPlaces(query);
                return Ok(results);
            }
            catch (InvalidOperationException ex)
            {
                _logger.LogError(ex, "Configuration error in Google Maps search");
                return StatusCode(500, new { error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error searching for '{query}'");
                return StatusCode(500, new { error = "Search failed", message = ex.Message });
            }
        }

        /// <summary>
        /// Get place details by Google Place ID
        /// GET: api/googlemaps/place/{placeId}
        /// </summary>
        [HttpGet("place/{placeId}")]
        public async Task<ActionResult<PlaceSearchResult>> GetPlaceDetails(string placeId)
        {
            if (string.IsNullOrWhiteSpace(placeId))
            {
                return BadRequest("Place ID is required");
            }

            try
            {
                var result = await _googleMapsService.GetPlaceDetails(placeId);

                if (result == null)
                {
                    return NotFound($"Place with ID '{placeId}' not found");
                }

                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error getting place details for '{placeId}'");
                return StatusCode(500, new { error = "Failed to get place details", message = ex.Message });
            }
        }

        /// <summary>
        /// Get cache statistics
        /// GET: api/googlemaps/stats
        /// </summary>
        [HttpGet("stats")]
        public async Task<ActionResult<CacheStatistics>> GetCacheStatistics()
        {
            try
            {
                var stats = await _googleMapsService.GetCacheStatistics();
                return Ok(stats);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting cache statistics");
                return StatusCode(500, new { error = "Failed to get statistics", message = ex.Message });
            }
        }

        /// <summary>
        /// Search for nearby places at coordinates
        /// GET: api/googlemaps/nearby?lat=40.7128&lng=-74.0060&radius=100&type=restaurant
        /// </summary>
        [HttpGet("nearby")]
        public async Task<ActionResult<List<PlaceSearchResult>>> NearbySearch(
            [FromQuery] double lat,
            [FromQuery] double lng,
            [FromQuery] int radius = 100,
            [FromQuery] string? type = null)
        {
            try
            {
                var results = await _googleMapsService.NearbySearch(lat, lng, radius, type);
                return Ok(new { results });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error in nearby search at ({lat}, {lng})");
                return StatusCode(500, new { error = "Nearby search failed", message = ex.Message });
            }
        }

        /// <summary>
        /// Clean expired cache entries (maintenance endpoint)
        /// POST: api/googlemaps/cache/clean
        /// </summary>
        [HttpPost("cache/clean")]
        public async Task<ActionResult> CleanExpiredCache()
        {
            try
            {
                await _googleMapsService.CleanExpiredCache();
                return Ok(new { message = "Expired cache entries cleaned successfully" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error cleaning expired cache");
                return StatusCode(500, new { error = "Failed to clean cache", message = ex.Message });
            }
        }

        /// <summary>
        /// Clear ALL cache entries (for testing/debugging)
        /// DELETE: api/googlemaps/cache/clear
        /// </summary>
        [HttpDelete("cache/clear")]
        public async Task<ActionResult> ClearAllCache()
        {
            try
            {
                await _googleMapsService.ClearAllCache();
                return Ok(new { message = "All cache entries cleared successfully" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error clearing all cache");
                return StatusCode(500, new { error = "Failed to clear cache", message = ex.Message });
            }
        }
    }
}
