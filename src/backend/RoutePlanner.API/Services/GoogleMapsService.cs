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
                    ? photos.EnumerateArray().Select(p => new PlacePhoto
                    {
                        PhotoReference = p.GetProperty("photo_reference").GetString() ?? "",
                        Width = p.GetProperty("width").GetInt32(),
                        Height = p.GetProperty("height").GetInt32()
                    }).ToList()
                    : new List<PlacePhoto>()
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
                    ? photos.EnumerateArray().Select(p => new PlacePhoto
                    {
                        PhotoReference = p.GetProperty("photo_reference").GetString() ?? "",
                        Width = p.GetProperty("width").GetInt32(),
                        Height = p.GetProperty("height").GetInt32()
                    }).ToList()
                    : new List<PlacePhoto>()
            };

            // Populate photo URLs
            PopulatePhotoUrls(placeResult);

            return placeResult;
        }

        /// <summary>
        /// Generate Google Photos URL from photo reference
        /// </summary>
        private string GeneratePhotoUrl(string photoReference, int maxWidth = 400)
        {
            var apiKey = _configuration["GoogleMaps:ApiKey"];
            return $"https://maps.googleapis.com/maps/api/place/photo?maxwidth={maxWidth}&photo_reference={photoReference}&key={apiKey}";
        }

        /// <summary>
        /// Populate photo URLs for a place result
        /// </summary>
        private void PopulatePhotoUrls(PlaceSearchResult result)
        {
            foreach (var photo in result.Photos)
            {
                photo.PhotoUrl = GeneratePhotoUrl(photo.PhotoReference, photo.Width);
            }
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
                    result.Photos = photos.EnumerateArray().Select(p => new PlacePhoto
                    {
                        PhotoReference = p.GetProperty("photoReference").GetString() ?? "",
                        Width = p.GetProperty("width").GetInt32(),
                        Height = p.GetProperty("height").GetInt32(),
                        PhotoUrl = p.TryGetProperty("photoUrl", out var url) ? url.GetString() : null
                    }).ToList();
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
    }
}
