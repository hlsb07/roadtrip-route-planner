using System.Globalization;
using System.Text.Json;
using NetTopologySuite.Geometries;
using RoutePlanner.API.Models.Osrm;

namespace RoutePlanner.API.Services
{
    public class OsrmClient : IOsrmClient
    {
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;
        private readonly ILogger<OsrmClient> _logger;

        public OsrmClient(
            HttpClient httpClient,
            IConfiguration configuration,
            ILogger<OsrmClient> logger)
        {
            _httpClient = httpClient;
            _configuration = configuration;
            _logger = logger;

            // Configure HttpClient
            var baseUrl = _configuration["Osrm:BaseUrl"] ?? "https://router.project-osrm.org";
            _httpClient.BaseAddress = new Uri(baseUrl);

            var timeout = int.Parse(_configuration["Osrm:TimeoutSeconds"] ?? "30");
            _httpClient.Timeout = TimeSpan.FromSeconds(timeout);
        }

        public async Task<OsrmRouteResponse> GetRoute(
            List<Point> waypoints,
            bool includeSteps = true)
        {
            if (waypoints == null || waypoints.Count < 2)
            {
                throw new ArgumentException("At least 2 waypoints required", nameof(waypoints));
            }

            // Build coordinates string: "lon,lat;lon,lat;..."
            // OSRM expects longitude first, then latitude
            // Use InvariantCulture to ensure dots (not commas) for decimal separator
            var coordinates = string.Join(';', waypoints.Select(p =>
                $"{p.X.ToString("F6", CultureInfo.InvariantCulture)},{p.Y.ToString("F6", CultureInfo.InvariantCulture)}"));

            var profile = _configuration["Osrm:Profile"] ?? "driving";

            // Build URL with query parameters
            var url = $"/route/v1/{profile}/{coordinates}";
            url += "?overview=full";
            url += "&geometries=geojson";
            if (includeSteps)
            {
                url += "&steps=true";
            }

            _logger.LogInformation("OSRM request: {Url}", url);

            try
            {
                var response = await _httpClient.GetAsync(url);
                response.EnsureSuccessStatusCode();

                var json = await response.Content.ReadAsStringAsync();
                var options = new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                };

                var osrmResponse = JsonSerializer.Deserialize<OsrmRouteResponse>(json, options);

                if (osrmResponse == null)
                {
                    throw new InvalidOperationException("Failed to deserialize OSRM response");
                }

                if (osrmResponse.Code != "Ok")
                {
                    _logger.LogWarning("OSRM returned non-OK code: {Code}, Message: {Message}",
                        osrmResponse.Code, osrmResponse.Message);
                    throw new InvalidOperationException($"OSRM error: {osrmResponse.Message ?? osrmResponse.Code}");
                }

                _logger.LogInformation("OSRM response successful: {RouteCount} routes, {LegCount} legs",
                    osrmResponse.Routes?.Count ?? 0,
                    osrmResponse.Routes?.FirstOrDefault()?.Legs?.Count ?? 0);

                return osrmResponse;
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "HTTP request to OSRM failed");
                throw new InvalidOperationException("Failed to communicate with routing service", ex);
            }
            catch (TaskCanceledException ex)
            {
                _logger.LogError(ex, "OSRM request timeout");
                throw new TimeoutException("Routing service request timed out", ex);
            }
        }

        public async Task<string> GetRouteRaw(string coordinates)
        {
            var profile = _configuration["Osrm:Profile"] ?? "driving";
            var url = $"/route/v1/{profile}/{coordinates}";

            _logger.LogInformation("OSRM proxy request: {Url}", url);

            try
            {
                var response = await _httpClient.GetAsync(url);
                response.EnsureSuccessStatusCode();

                return await response.Content.ReadAsStringAsync();
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "OSRM proxy request failed");
                throw new InvalidOperationException("Routing service unavailable", ex);
            }
            catch (TaskCanceledException ex)
            {
                _logger.LogError(ex, "OSRM proxy request timeout");
                throw new TimeoutException("Routing service request timed out", ex);
            }
        }
    }
}
