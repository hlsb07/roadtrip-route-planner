using Microsoft.EntityFrameworkCore;
using NetTopologySuite.Geometries;
using RoutePlanner.API.Data;
using RoutePlanner.API.DTOs;
using RoutePlanner.API.Models;
using System.Text.Json;

namespace RoutePlanner.API.Services
{
    public class GoogleMapsService
    {
        private readonly AppDbContext _context;
        private readonly IConfiguration _configuration;
        private readonly HttpClient _httpClient;
        private readonly ILogger<GoogleMapsService> _logger;
        private readonly GeometryFactory _geometryFactory;

        // Cache TTL (365 days)
        private readonly TimeSpan _cacheTtl = TimeSpan.FromDays(365);

        public GoogleMapsService(
            AppDbContext context,
            IConfiguration configuration,
            HttpClient httpClient,
            ILogger<GoogleMapsService> logger)
        {
            _context = context;
            _configuration = configuration;
            _httpClient = httpClient;
            _logger = logger;
            _geometryFactory = new GeometryFactory(new PrecisionModel(), 4326);
        }

        /// <summary>
        /// Search places with intelligent caching and deduplication
        /// </summary>
        public async Task<GoogleMapsSearchResponse> SearchPlaces(string query)
        {
            var normalizedQuery = query.Trim().ToLower();

            // Step 1: Check existing Places in database (exact or similar match)
            var existingPlace = await FindSimilarPlaceInDatabase(normalizedQuery);
            if (existingPlace != null)
            {
                _logger.LogInformation($"Found existing place in database: {existingPlace.Name}");
                return new GoogleMapsSearchResponse
                {
                    Results = new List<PlaceSearchResult>
                    {
                        new PlaceSearchResult
                        {
                            PlaceId = existingPlace.Id.ToString(),
                            Name = existingPlace.Name,
                            FormattedAddress = $"{existingPlace.Name}",
                            Latitude = existingPlace.Location.Y,
                            Longitude = existingPlace.Location.X,
                            FromCache = true
                        }
                    },
                    FromCache = true,
                    Statistics = await GetCacheStatistics()
                };
            }

            // Step 2: Check Google Maps cache
            var cachedResults = await GetFromCache(normalizedQuery, "autocomplete");
            if (cachedResults.Any())
            {
                _logger.LogInformation($"Cache HIT for query: {query}");
                var results = cachedResults.Select(c =>
                {
                    var result = new PlaceSearchResult
                    {
                        PlaceId = c.GooglePlaceId,
                        Name = c.Name,
                        FormattedAddress = c.FormattedAddress,
                        Latitude = c.Location.Y,
                        Longitude = c.Location.X,
                        Types = ParseTypes(c.Types),
                        FromCache = true
                    };
                    PopulateExtendedDataFromCache(result, c.AdditionalData);
                    return result;
                }).ToList();

                return new GoogleMapsSearchResponse
                {
                    Results = results,
                    FromCache = true,
                    Statistics = await GetCacheStatistics()
                };
            }

            // Step 3: Call Google Maps API
            _logger.LogInformation($"Cache MISS for query: {query} - calling Google API");
            var apiResults = await CallGooglePlacesAutocomplete(query);

            // Step 4: Cache the results
            await CacheSearchResults(normalizedQuery, apiResults);

            return new GoogleMapsSearchResponse
            {
                Results = apiResults,
                FromCache = false,
                Statistics = await GetCacheStatistics()
            };
        }

        /// <summary>
        /// Get place details by Google Place ID
        /// </summary>
        public async Task<PlaceSearchResult?> GetPlaceDetails(string placeId)
        {
            // Check cache first
            var cached = await _context.GoogleMapsCache
                .FirstOrDefaultAsync(c => c.GooglePlaceId == placeId && c.ExpiresAt > DateTime.UtcNow);

            if (cached != null)
            {
                cached.HitCount++;
                await _context.SaveChangesAsync();

                _logger.LogInformation($"Cache HIT for place ID: {placeId}");
                var cachedResult = new PlaceSearchResult
                {
                    PlaceId = cached.GooglePlaceId,
                    Name = cached.Name,
                    FormattedAddress = cached.FormattedAddress,
                    Latitude = cached.Location.Y,
                    Longitude = cached.Location.X,
                    Types = ParseTypes(cached.Types),
                    FromCache = true
                };
                PopulateExtendedDataFromCache(cachedResult, cached.AdditionalData);
                return cachedResult;
            }

            // Call Google API
            _logger.LogInformation($"Cache MISS for place ID: {placeId} - calling Google API");
            var apiKey = _configuration["GoogleMaps:ApiKey"];
            if (string.IsNullOrEmpty(apiKey))
            {
                throw new InvalidOperationException("Google Maps API key not configured");
            }

            var url = $"https://maps.googleapis.com/maps/api/place/details/json?place_id={placeId}&key={apiKey}&fields=place_id,name,formatted_address,geometry,types,rating,user_ratings_total,price_level,website,formatted_phone_number,opening_hours,photos";

            var response = await _httpClient.GetAsync(url);
            response.EnsureSuccessStatusCode();

            var json = await response.Content.ReadAsStringAsync();
            var data = JsonSerializer.Deserialize<JsonElement>(json);

            var result = data.GetProperty("result");
            var geometry = result.GetProperty("geometry").GetProperty("location");

            var placeResult = new PlaceSearchResult
            {
                PlaceId = result.GetProperty("place_id").GetString() ?? "",
                Name = result.GetProperty("name").GetString() ?? "",
                FormattedAddress = result.GetProperty("formatted_address").GetString() ?? "",
                Latitude = geometry.GetProperty("lat").GetDouble(),
                Longitude = geometry.GetProperty("lng").GetDouble(),
                Types = result.TryGetProperty("types", out var types)
                    ? types.EnumerateArray().Select(t => t.GetString() ?? "").ToList()
                    : new List<string>(),
                Rating = result.TryGetProperty("rating", out var rating) ? rating.GetDouble() : null,
                UserRatingsTotal = result.TryGetProperty("user_ratings_total", out var ratingsTotal) ? ratingsTotal.GetInt32() : null,
                PriceLevel = result.TryGetProperty("price_level", out var priceLevel) ? priceLevel.GetInt32() : null,
                Website = result.TryGetProperty("website", out var website) ? website.GetString() : null,
                PhoneNumber = result.TryGetProperty("formatted_phone_number", out var phone) ? phone.GetString() : null,
                OpeningHours = result.TryGetProperty("opening_hours", out var hours)
                    ? JsonSerializer.Serialize(hours) : null,
                Photos = result.TryGetProperty("photos", out var photos)
                    ? photos.EnumerateArray().Select(p => new DTOs.PlacePhotoDto
                    {
                        PhotoReference = p.GetProperty("photo_reference").GetString() ?? "",
                        Width = p.GetProperty("width").GetInt32(),
                        Height = p.GetProperty("height").GetInt32()
                    }).ToList()
                    : new List<DTOs.PlacePhotoDto>()
            };

            // Populate photo URLs
            PopulatePhotoUrls(placeResult);

            // Cache the result
            await CachePlaceDetails(placeResult);

            return placeResult;
        }

        /// <summary>
        /// Find similar place in existing database using fuzzy matching
        /// </summary>
        private async Task<Place?> FindSimilarPlaceInDatabase(string query)
        {
            // Try exact match first
            var exactMatch = await _context.Places
                .FirstOrDefaultAsync(p => EF.Functions.ILike(p.Name, query));

            if (exactMatch != null) return exactMatch;

            // Try partial match (contains)
            var partialMatch = await _context.Places
                .Where(p => EF.Functions.ILike(p.Name, $"%{query}%"))
                .OrderBy(p => p.Name.Length) // Prefer shorter names (more specific)
                .FirstOrDefaultAsync();

            return partialMatch;
        }

        /// <summary>
        /// Get cached results from database
        /// </summary>
        private async Task<List<GoogleMapsCache>> GetFromCache(string query, string apiType)
        {
            var results = await _context.GoogleMapsCache
                .Where(c => c.SearchQuery == query &&
                           c.ApiType == apiType &&
                           c.ExpiresAt > DateTime.UtcNow)
                .OrderByDescending(c => c.HitCount) // Most popular first
                .Take(10)
                .ToListAsync();

            // Update hit counts
            foreach (var result in results)
            {
                result.HitCount++;
            }

            if (results.Any())
            {
                await _context.SaveChangesAsync();
            }

            return results;
        }

        /// <summary>
        /// Call Google Places Autocomplete API
        /// </summary>
        private async Task<List<PlaceSearchResult>> CallGooglePlacesAutocomplete(string query)
        {
            var apiKey = _configuration["GoogleMaps:ApiKey"];
            if (string.IsNullOrEmpty(apiKey))
            {
                throw new InvalidOperationException("Google Maps API key not configured");
            }

            var url = $"https://maps.googleapis.com/maps/api/place/autocomplete/json?input={Uri.EscapeDataString(query)}&key={apiKey}";

            var response = await _httpClient.GetAsync(url);
            response.EnsureSuccessStatusCode();

            var json = await response.Content.ReadAsStringAsync();
            var data = JsonSerializer.Deserialize<JsonElement>(json);

            var predictions = data.GetProperty("predictions");
            var results = new List<PlaceSearchResult>();

            foreach (var prediction in predictions.EnumerateArray())
            {
                var placeId = prediction.GetProperty("place_id").GetString() ?? "";

                // Get place details for coordinates
                var details = await GetPlaceDetailsFromGoogle(placeId);
                if (details != null)
                {
                    results.Add(details);
                }
            }

            return results;
        }

        /// <summary>
        /// Get place details from Google API
        /// </summary>
        private async Task<PlaceSearchResult?> GetPlaceDetailsFromGoogle(string placeId)
        {
            var apiKey = _configuration["GoogleMaps:ApiKey"];
            var url = $"https://maps.googleapis.com/maps/api/place/details/json?place_id={placeId}&key={apiKey}&fields=place_id,name,formatted_address,geometry,types,rating,user_ratings_total,price_level,website,formatted_phone_number,opening_hours,photos";

            var response = await _httpClient.GetAsync(url);
            if (!response.IsSuccessStatusCode) return null;

            var json = await response.Content.ReadAsStringAsync();
            var data = JsonSerializer.Deserialize<JsonElement>(json);

            if (!data.TryGetProperty("result", out var result)) return null;

            // Safely extract geometry
            if (!result.TryGetProperty("geometry", out var geometryProp) ||
                !geometryProp.TryGetProperty("location", out var location))
            {
                _logger.LogWarning($"Place {placeId} is missing geometry or location data");
                return null;
            }

            var placeResult = new PlaceSearchResult
            {
                PlaceId = result.TryGetProperty("place_id", out var placeIdProp) ? placeIdProp.GetString() ?? "" : "",
                Name = result.TryGetProperty("name", out var nameProp) ? nameProp.GetString() ?? "" : "",
                FormattedAddress = result.TryGetProperty("formatted_address", out var addressProp) ? addressProp.GetString() ?? "" : "",
                Latitude = location.TryGetProperty("lat", out var latProp) ? latProp.GetDouble() : 0,
                Longitude = location.TryGetProperty("lng", out var lngProp) ? lngProp.GetDouble() : 0,
                Types = result.TryGetProperty("types", out var types)
                    ? types.EnumerateArray().Select(t => t.GetString() ?? "").ToList()
                    : new List<string>(),
                Rating = result.TryGetProperty("rating", out var rating) ? rating.GetDouble() : null,
                UserRatingsTotal = result.TryGetProperty("user_ratings_total", out var ratingsTotal) ? ratingsTotal.GetInt32() : null,
                PriceLevel = result.TryGetProperty("price_level", out var priceLevel) ? priceLevel.GetInt32() : null,
                Website = result.TryGetProperty("website", out var website) ? website.GetString() : null,
                PhoneNumber = result.TryGetProperty("formatted_phone_number", out var phone) ? phone.GetString() : null,
                OpeningHours = result.TryGetProperty("opening_hours", out var hours)
                    ? JsonSerializer.Serialize(hours) : null,
                Photos = result.TryGetProperty("photos", out var photos)
                    ? photos.EnumerateArray().Select(p => new DTOs.PlacePhotoDto
                    {
                        PhotoReference = p.GetProperty("photo_reference").GetString() ?? "",
                        Width = p.GetProperty("width").GetInt32(),
                        Height = p.GetProperty("height").GetInt32()
                    }).ToList()
                    : new List<DTOs.PlacePhotoDto>()
            };

            // Populate photo URLs
            PopulatePhotoUrls(placeResult);

            return placeResult;
        }

        /// <summary>
        /// Generate Google Photos URL from photo reference (public for use by other services)
        /// </summary>
        public string GeneratePhotoUrl(string photoReference, int maxWidth = 400)
        {
            var apiKey = _configuration["GoogleMaps:ApiKey"];
            return $"https://maps.googleapis.com/maps/api/place/photo?maxwidth={maxWidth}&photo_reference={photoReference}&key={apiKey}";
        }

        /// <summary>
        /// Populate photo URLs for a place result
        /// </summary>
        private void PopulatePhotoUrls(PlaceSearchResult result)
        {
            _logger.LogInformation($"Populating photo URLs for {result.Photos.Count} photos");

            foreach (var photo in result.Photos)
            {
                if (string.IsNullOrEmpty(photo.PhotoReference))
                {
                    _logger.LogWarning($"Photo has empty PhotoReference, skipping URL generation");
                    continue;
                }

                photo.PhotoUrl = GeneratePhotoUrl(photo.PhotoReference, photo.Width);
                _logger.LogDebug($"Generated photo URL: {(photo.PhotoUrl?.Length > 80 ? photo.PhotoUrl.Substring(0, 80) + "..." : photo.PhotoUrl)}");
            }

            var photosWithUrl = result.Photos.Count(p => !string.IsNullOrEmpty(p.PhotoUrl));
            _logger.LogInformation($"Generated URLs for {photosWithUrl} out of {result.Photos.Count} photos");
        }

        /// <summary>
        /// Serialize extended place data for caching
        /// </summary>
        private string? SerializeExtendedData(PlaceSearchResult result)
        {
            var extendedData = new
            {
                rating = result.Rating,
                userRatingsTotal = result.UserRatingsTotal,
                priceLevel = result.PriceLevel,
                website = result.Website,
                phoneNumber = result.PhoneNumber,
                openingHours = result.OpeningHours,
                photos = result.Photos
            };

            return JsonSerializer.Serialize(extendedData);
        }

        /// <summary>
        /// Deserialize and populate extended data from cache
        /// </summary>
        private void PopulateExtendedDataFromCache(PlaceSearchResult result, string? additionalDataJson)
        {
            if (string.IsNullOrEmpty(additionalDataJson)) return;

            try
            {
                var data = JsonSerializer.Deserialize<JsonElement>(additionalDataJson);

                result.Rating = data.TryGetProperty("rating", out var rating) && rating.ValueKind != JsonValueKind.Null
                    ? rating.GetDouble() : null;
                result.UserRatingsTotal = data.TryGetProperty("userRatingsTotal", out var ratingsTotal) && ratingsTotal.ValueKind != JsonValueKind.Null
                    ? ratingsTotal.GetInt32() : null;
                result.PriceLevel = data.TryGetProperty("priceLevel", out var priceLevel) && priceLevel.ValueKind != JsonValueKind.Null
                    ? priceLevel.GetInt32() : null;
                result.Website = data.TryGetProperty("website", out var website) && website.ValueKind != JsonValueKind.Null
                    ? website.GetString() : null;
                result.PhoneNumber = data.TryGetProperty("phoneNumber", out var phone) && phone.ValueKind != JsonValueKind.Null
                    ? phone.GetString() : null;
                result.OpeningHours = data.TryGetProperty("openingHours", out var hours) && hours.ValueKind != JsonValueKind.Null
                    ? hours.GetString() : null;

                if (data.TryGetProperty("photos", out var photos) && photos.ValueKind == JsonValueKind.Array)
                {
                    result.Photos = photos.EnumerateArray().Select(p =>
                    {
                        // Try both PascalCase (C# serialization) and camelCase (JS serialization)
                        var photoRef = p.TryGetProperty("PhotoReference", out var pr1) ? pr1.GetString()
                                     : p.TryGetProperty("photoReference", out var pr2) ? pr2.GetString()
                                     : "";

                        var width = p.TryGetProperty("Width", out var w1) ? w1.GetInt32()
                                  : p.TryGetProperty("width", out var w2) ? w2.GetInt32()
                                  : 0;

                        var height = p.TryGetProperty("Height", out var h1) ? h1.GetInt32()
                                   : p.TryGetProperty("height", out var h2) ? h2.GetInt32()
                                   : 0;

                        var photoUrl = p.TryGetProperty("PhotoUrl", out var pu1) ? pu1.GetString()
                                     : p.TryGetProperty("photoUrl", out var pu2) ? pu2.GetString()
                                     : null;

                        return new DTOs.PlacePhotoDto
                        {
                            PhotoReference = photoRef ?? "",
                            Width = width,
                            Height = height,
                            PhotoUrl = photoUrl
                        };
                    }).ToList();

                    _logger.LogInformation($"Deserialized {result.Photos.Count} photos from cache");
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning($"Failed to deserialize extended data: {ex.Message}");
            }
        }

        /// <summary>
        /// Cache search results in database
        /// </summary>
        private async Task CacheSearchResults(string query, List<PlaceSearchResult> results)
        {
            foreach (var result in results)
            {
                var cacheEntry = new GoogleMapsCache
                {
                    SearchQuery = query,
                    GooglePlaceId = result.PlaceId,
                    Name = result.Name,
                    FormattedAddress = result.FormattedAddress,
                    Location = _geometryFactory.CreatePoint(new Coordinate(result.Longitude, result.Latitude)),
                    Types = JsonSerializer.Serialize(result.Types),
                    AdditionalData = SerializeExtendedData(result),
                    ApiType = "autocomplete",
                    CachedAt = DateTime.UtcNow,
                    ExpiresAt = DateTime.UtcNow.Add(_cacheTtl),
                    HitCount = 0
                };

                _context.GoogleMapsCache.Add(cacheEntry);
            }

            await _context.SaveChangesAsync();
        }

        /// <summary>
        /// Cache place details
        /// </summary>
        private async Task CachePlaceDetails(PlaceSearchResult result)
        {
            var cacheEntry = new GoogleMapsCache
            {
                SearchQuery = result.Name.ToLower(),
                GooglePlaceId = result.PlaceId,
                Name = result.Name,
                FormattedAddress = result.FormattedAddress,
                Location = _geometryFactory.CreatePoint(new Coordinate(result.Longitude, result.Latitude)),
                Types = JsonSerializer.Serialize(result.Types),
                AdditionalData = SerializeExtendedData(result),
                ApiType = "place_details",
                CachedAt = DateTime.UtcNow,
                ExpiresAt = DateTime.UtcNow.Add(_cacheTtl),
                HitCount = 0
            };

            _context.GoogleMapsCache.Add(cacheEntry);
            await _context.SaveChangesAsync();
        }

        /// <summary>
        /// Get cache statistics
        /// </summary>
        public async Task<CacheStatistics> GetCacheStatistics()
        {
            var totalCached = await _context.GoogleMapsCache.CountAsync();
            var totalHits = await _context.GoogleMapsCache.SumAsync(c => c.HitCount);
            var uniqueQueries = await _context.GoogleMapsCache.Select(c => c.SearchQuery).Distinct().CountAsync();

            // Estimate API calls (rough estimate: unique queries = API calls)
            var estimatedApiCalls = uniqueQueries;
            var cacheHitRate = totalHits > 0 ? (double)totalHits / (totalHits + estimatedApiCalls) * 100 : 0;

            // Cost calculation ($0.017 per request for autocomplete)
            var costPerRequest = 0.017m;
            var estimatedSavings = totalHits * costPerRequest;

            return new CacheStatistics
            {
                TotalCachedPlaces = totalCached,
                CacheHits = totalHits,
                ApiCalls = estimatedApiCalls,
                CacheHitRate = Math.Round(cacheHitRate, 2),
                EstimatedCostSavings = estimatedSavings
            };
        }

        /// <summary>
        /// Parse JSON types array
        /// </summary>
        private List<string> ParseTypes(string? typesJson)
        {
            if (string.IsNullOrEmpty(typesJson)) return new List<string>();

            try
            {
                return JsonSerializer.Deserialize<List<string>>(typesJson) ?? new List<string>();
            }
            catch
            {
                return new List<string>();
            }
        }

        /// <summary>
        /// Clean expired cache entries
        /// </summary>
        public async Task CleanExpiredCache()
        {
            var expired = await _context.GoogleMapsCache
                .Where(c => c.ExpiresAt < DateTime.UtcNow)
                .ToListAsync();

            _context.GoogleMapsCache.RemoveRange(expired);
            await _context.SaveChangesAsync();

            _logger.LogInformation($"Cleaned {expired.Count} expired cache entries");
        }

        /// <summary>
        /// Clear ALL cache entries (for testing/debugging)
        /// </summary>
        public async Task ClearAllCache()
        {
            var allEntries = await _context.GoogleMapsCache.ToListAsync();
            var count = allEntries.Count;

            _context.GoogleMapsCache.RemoveRange(allEntries);
            await _context.SaveChangesAsync();

            _logger.LogWarning($"Cleared ALL {count} cache entries - this should only be used for testing!");
        }

        /// <summary>
        /// Reverse geocode coordinates to find the nearest Google Place
        /// Used for linking existing manual places to Google data
        /// </summary>
        /// <param name="lat">Latitude</param>
        /// <param name="lng">Longitude</param>
        /// <param name="placeTypes">Optional comma-separated place types to filter (e.g., "restaurant,cafe")</param>
        /// <returns>Best matching place or null if not found</returns>
        public async Task<PlaceSearchResult?> ReverseGeocode(double lat, double lng, string? placeTypes = null)
        {
            var apiKey = _configuration["GoogleMaps:ApiKey"];
            if (string.IsNullOrEmpty(apiKey))
            {
                throw new InvalidOperationException("Google Maps API key not configured");
            }

            // Build URL with optional type filtering
            var url = $"https://maps.googleapis.com/maps/api/geocode/json?latlng={lat},{lng}&key={apiKey}";
            if (!string.IsNullOrEmpty(placeTypes))
            {
                url += $"&result_type={placeTypes}";
            }

            _logger.LogInformation($"Reverse geocoding coordinates: ({lat}, {lng})");

            try
            {
                var response = await _httpClient.GetAsync(url);
                response.EnsureSuccessStatusCode();

                var json = await response.Content.ReadAsStringAsync();
                var data = JsonSerializer.Deserialize<JsonElement>(json);

                if (!data.TryGetProperty("results", out var results) || results.GetArrayLength() == 0)
                {
                    _logger.LogInformation($"No results found for reverse geocoding: ({lat}, {lng})");
                    return null;
                }

                // Get the first (best) result
                var firstResult = results[0];
                var placeId = firstResult.GetProperty("place_id").GetString();

                if (string.IsNullOrEmpty(placeId))
                {
                    return null;
                }

                // Get full place details using the place ID
                var placeDetails = await GetPlaceDetails(placeId);

                if (placeDetails != null)
                {
                    _logger.LogInformation($"Reverse geocode success: {placeDetails.Name}");
                }

                return placeDetails;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error reverse geocoding coordinates: ({lat}, {lng})");
                return null;
            }
        }

        /// <summary>
        /// Search for places near a location (e.g., clicked point on map)
        /// Future feature for discovering places by clicking on map
        /// </summary>
        /// <param name="lat">Latitude</param>
        /// <param name="lng">Longitude</param>
        /// <param name="radiusMeters">Search radius in meters (max 50000)</param>
        /// <param name="type">Optional place type to filter (e.g., "restaurant", "tourist_attraction")</param>
        /// <returns>List of nearby places</returns>
        public async Task<List<PlaceSearchResult>> NearbySearch(double lat, double lng, int radiusMeters, string? type = null)
        {
            var apiKey = _configuration["GoogleMaps:ApiKey"];
            if (string.IsNullOrEmpty(apiKey))
            {
                throw new InvalidOperationException("Google Maps API key not configured");
            }

            // Limit radius to Google's max
            if (radiusMeters > 50000)
            {
                radiusMeters = 50000;
            }

            // Build URL with optional type filtering
            var url = $"https://maps.googleapis.com/maps/api/place/nearbysearch/json?location={lat},{lng}&radius={radiusMeters}&key={apiKey}";
            if (!string.IsNullOrEmpty(type))
            {
                url += $"&type={type}";
            }

            _logger.LogInformation($"Nearby search at ({lat}, {lng}) with radius {radiusMeters}m");

            try
            {
                var response = await _httpClient.GetAsync(url);
                response.EnsureSuccessStatusCode();

                var json = await response.Content.ReadAsStringAsync();
                var data = JsonSerializer.Deserialize<JsonElement>(json);

                if (!data.TryGetProperty("results", out var results))
                {
                    _logger.LogInformation($"No results found for nearby search at ({lat}, {lng})");
                    return new List<PlaceSearchResult>();
                }

                var places = new List<PlaceSearchResult>();

                foreach (var result in results.EnumerateArray())
                {
                    var placeId = result.GetProperty("place_id").GetString();
                    if (string.IsNullOrEmpty(placeId)) continue;

                    // Get full details for each place (includes photos, ratings, etc.)
                    var placeDetails = await GetPlaceDetails(placeId);
                    if (placeDetails != null)
                    {
                        places.Add(placeDetails);
                    }

                    // Limit to 20 results to avoid excessive API calls
                    if (places.Count >= 20) break;
                }

                _logger.LogInformation($"Nearby search found {places.Count} places");
                return places;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error in nearby search at ({lat}, {lng})");
                return new List<PlaceSearchResult>();
            }
        }
    }
}
