using Microsoft.AspNetCore.Mvc;
using RoutePlanner.API.Services;

namespace RoutePlanner.API.Controllers
{
    [ApiController]
    [Route("api/osrm")]
    public class OsrmController : ControllerBase
    {
        private readonly IOsrmClient _osrmClient;
        private readonly ILogger<OsrmController> _logger;

        public OsrmController(IOsrmClient osrmClient, ILogger<OsrmController> logger)
        {
            _osrmClient = osrmClient;
            _logger = logger;
        }

        /// <summary>
        /// Proxy endpoint for OSRM routing requests
        /// Allows Leaflet Routing Machine to use backend instead of direct OSRM calls
        /// </summary>
        /// <param name="profile">OSRM routing profile (e.g., "driving", "walking", "cycling")</param>
        /// <param name="coordinates">Semicolon-separated coordinates in "lon,lat;lon,lat;..." format</param>
        /// <returns>OSRM route response as JSON</returns>
        [HttpGet("route/v1/{profile}/{**coordinates}")]
        public async Task<IActionResult> ProxyRoute(string profile, string coordinates)
        {
            try
            {
                _logger.LogInformation($"OSRM proxy request: {profile}/{coordinates}");

                // Forward query string parameters (e.g., ?overview=full&geometries=geojson)
                var queryString = Request.QueryString.HasValue
                    ? Request.QueryString.Value
                    : "";

                var coordsWithQuery = coordinates + queryString;
                var response = await _osrmClient.GetRouteRaw(coordsWithQuery);

                return Content(response, "application/json");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "OSRM proxy request failed");
                return StatusCode(500, new { error = "Routing service unavailable" });
            }
        }
    }
}
