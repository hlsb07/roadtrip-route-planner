using Microsoft.EntityFrameworkCore;
using NetTopologySuite.Geometries;
using RoutePlanner.API.Data;
using RoutePlanner.API.DTOs;
using RoutePlanner.API.Models;
using System.Text.Json;

namespace RoutePlanner.API.Services
{
    public class PlaceService : IPlaceService
    {
        private readonly AppDbContext _context;
        private readonly GoogleMapsService _googleMapsService;
        private readonly GeometryFactory _geometryFactory;
        private readonly ILogger<PlaceService> _logger;

        public PlaceService(
            AppDbContext context,
            GoogleMapsService googleMapsService,
            ILogger<PlaceService> logger)
        {
            _context = context;
            _googleMapsService = googleMapsService;
            _geometryFactory = new GeometryFactory(new PrecisionModel(), 4326);
            _logger = logger;
        }

        public async Task<Place> CreatePlaceFromGoogle(string googlePlaceId, int userId, string? notes = null)
        {
            _logger.LogInformation($"Creating place from Google Place ID: {googlePlaceId} (length: {googlePlaceId.Length}) for user {userId}");

            // Step 1: Check if GooglePlaceData already exists
            var googleData = await _context.GooglePlaceData
                .Include(g => g.Photos)
                .FirstOrDefaultAsync(g => g.GooglePlaceId == googlePlaceId);

            if (googleData == null)
            {
                // Fetch from Google API
                _logger.LogInformation($"GooglePlaceData not found, fetching from Google API");
                var placeDetails = await _googleMapsService.GetPlaceDetails(googlePlaceId);

                if (placeDetails == null)
                {
                    throw new InvalidOperationException($"Could not fetch place details for Google Place ID: {googlePlaceId}");
                }

                // Log field lengths for debugging
                _logger.LogInformation($"GooglePlaceData field lengths - GooglePlaceId: {googlePlaceId.Length}, Name: {placeDetails.Name?.Length ?? 0}, " +
                    $"FormattedAddress: {placeDetails.FormattedAddress?.Length ?? 0}, Website: {placeDetails.Website?.Length ?? 0}");

                // Create GooglePlaceData
                googleData = new GooglePlaceData
                {
                    GooglePlaceId = googlePlaceId,
                    Name = placeDetails.Name,
                    FormattedAddress = placeDetails.FormattedAddress,
                    Location = _geometryFactory.CreatePoint(new Coordinate(placeDetails.Longitude, placeDetails.Latitude)),
                    Types = JsonSerializer.Serialize(placeDetails.Types),
                    Rating = placeDetails.Rating,
                    UserRatingsTotal = placeDetails.UserRatingsTotal,
                    PriceLevel = placeDetails.PriceLevel,
                    Website = placeDetails.Website,
                    PhoneNumber = placeDetails.PhoneNumber,
                    OpeningHours = placeDetails.OpeningHours,
                    LastSyncedAt = DateTime.UtcNow,
                    SyncVersion = 1
                };

                _context.GooglePlaceData.Add(googleData);

                // Add photos
                if (placeDetails.Photos.Any())
                {
                    _logger.LogInformation($"Adding {placeDetails.Photos.Count} photos for place {googlePlaceId}");
                    foreach (var photoDto in placeDetails.Photos)
                    {
                        if (string.IsNullOrEmpty(photoDto.PhotoUrl))
                        {
                            _logger.LogWarning($"Photo DTO has empty PhotoUrl! PhotoReference: {photoDto.PhotoReference}, Width: {photoDto.Width}");
                        }

                        // Log photo field lengths
                        _logger.LogDebug($"Photo field lengths - PhotoReference: {photoDto.PhotoReference?.Length ?? 0}, PhotoUrl: {photoDto.PhotoUrl?.Length ?? 0}");

                        var photo = new PlacePhoto
                        {
                            GooglePlaceId = googlePlaceId,
                            PhotoReference = photoDto.PhotoReference,
                            PhotoUrl = string.Empty, // Don't store URL - generate dynamically from PhotoReference
                            Width = photoDto.Width,
                            Height = photoDto.Height,
                            IsPrimary = googleData.Photos.Count == 0, // First photo is primary
                            Source = "google",
                            OrderIndex = googleData.Photos.Count
                        };
                        googleData.Photos.Add(photo);
                        _logger.LogDebug($"Added photo - Reference: {photoDto.PhotoReference}, URL: {(photoDto.PhotoUrl?.Length > 50 ? photoDto.PhotoUrl.Substring(0, 50) + "..." : photoDto.PhotoUrl)}");
                    }
                }
                else
                {
                    _logger.LogInformation($"No photos available for place {googlePlaceId}");
                }

                await _context.SaveChangesAsync();
                _logger.LogInformation($"Created GooglePlaceData and {googleData.Photos.Count} photos");
            }

            // Step 2: Create user's Place record
            var place = new Place
            {
                UserId = userId,
                Name = googleData.Name,
                Location = googleData.Location,
                GooglePlaceId = googlePlaceId,
                Notes = notes,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            _context.Places.Add(place);
            await _context.SaveChangesAsync();

            _logger.LogInformation($"Created place ID {place.Id} for user {userId}");

            // Load navigation properties
            await _context.Entry(place)
                .Reference(p => p.GoogleData)
                .LoadAsync();

            return place;
        }

        public async Task<DuplicateCheckResponse> CheckDuplicate(string googlePlaceId, int userId)
        {
            var existingPlace = await _context.Places
                .Include(p => p.GoogleData)
                .FirstOrDefaultAsync(p => p.UserId == userId && p.GooglePlaceId == googlePlaceId);

            if (existingPlace == null)
            {
                return new DuplicateCheckResponse
                {
                    IsDuplicate = false,
                    Message = "No duplicate found"
                };
            }

            // Check if coordinates differ significantly
            var googleData = await _context.GooglePlaceData
                .FirstOrDefaultAsync(g => g.GooglePlaceId == googlePlaceId);

            bool coordinatesDiffer = false;
            if (googleData != null)
            {
                var latDiff = Math.Abs(existingPlace.Location.Y - googleData.Location.Y);
                var lngDiff = Math.Abs(existingPlace.Location.X - googleData.Location.X);
                coordinatesDiffer = latDiff > 0.0001 || lngDiff > 0.0001; // ~11 meters
            }

            return new DuplicateCheckResponse
            {
                IsDuplicate = true,
                ExistingPlace = MapToPlaceDto(existingPlace),
                CoordinatesDiffer = coordinatesDiffer,
                Message = coordinatesDiffer
                    ? "You already have this place saved, but coordinates differ slightly"
                    : "You already have this place saved"
            };
        }

        public async Task<RefreshGoogleDataResponse> RefreshGoogleData(int placeId)
        {
            _logger.LogInformation($"Refreshing Google data for place {placeId}");

            var place = await _context.Places
                .Include(p => p.GoogleData)
                .ThenInclude(g => g!.Photos)
                .FirstOrDefaultAsync(p => p.Id == placeId);

            if (place == null)
            {
                return new RefreshGoogleDataResponse
                {
                    Success = false,
                    Message = "Place not found"
                };
            }

            if (place.GoogleData == null)
            {
                return new RefreshGoogleDataResponse
                {
                    Success = false,
                    Message = "Place does not have Google data to refresh"
                };
            }

            // Fetch fresh data from Google
            var freshData = await _googleMapsService.GetPlaceDetails(place.GoogleData.GooglePlaceId);

            if (freshData == null)
            {
                return new RefreshGoogleDataResponse
                {
                    Success = false,
                    Message = "Could not fetch fresh data from Google"
                };
            }

            var updatedFields = new List<string>();

            // Update fields that can change
            if (place.GoogleData.Rating != freshData.Rating)
            {
                place.GoogleData.Rating = freshData.Rating;
                updatedFields.Add("Rating");
            }

            if (place.GoogleData.UserRatingsTotal != freshData.UserRatingsTotal)
            {
                place.GoogleData.UserRatingsTotal = freshData.UserRatingsTotal;
                updatedFields.Add("UserRatingsTotal");
            }

            if (place.GoogleData.Website != freshData.Website)
            {
                place.GoogleData.Website = freshData.Website;
                updatedFields.Add("Website");
            }

            if (place.GoogleData.PhoneNumber != freshData.PhoneNumber)
            {
                place.GoogleData.PhoneNumber = freshData.PhoneNumber;
                updatedFields.Add("PhoneNumber");
            }

            if (place.GoogleData.OpeningHours != freshData.OpeningHours)
            {
                place.GoogleData.OpeningHours = freshData.OpeningHours;
                updatedFields.Add("OpeningHours");
            }

            // Check for new photos
            var existingPhotoRefs = place.GoogleData.Photos.Select(p => p.PhotoReference).ToHashSet();
            var newPhotos = freshData.Photos
                .Where(p => !string.IsNullOrEmpty(p.PhotoReference) && !existingPhotoRefs.Contains(p.PhotoReference))
                .ToList();

            int newPhotosAdded = 0;
            foreach (var photoDto in newPhotos)
            {
                var photo = new PlacePhoto
                {
                    GooglePlaceId = place.GoogleData.GooglePlaceId,
                    PhotoReference = photoDto.PhotoReference,
                    PhotoUrl = string.Empty, // Don't store URL - generate dynamically from PhotoReference
                    Width = photoDto.Width,
                    Height = photoDto.Height,
                    IsPrimary = false,
                    Source = "google",
                    OrderIndex = place.GoogleData.Photos.Count + newPhotosAdded
                };
                place.GoogleData.Photos.Add(photo);
                newPhotosAdded++;
            }

            if (newPhotosAdded > 0)
            {
                updatedFields.Add($"{newPhotosAdded} new photos");
            }

            // Update sync info
            place.GoogleData.LastSyncedAt = DateTime.UtcNow;
            place.GoogleData.SyncVersion++;
            place.GoogleData.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();

            _logger.LogInformation($"Refreshed place {placeId}: {updatedFields.Count} fields updated, {newPhotosAdded} photos added");

            return new RefreshGoogleDataResponse
            {
                Success = true,
                UpdatedFields = updatedFields,
                NewPhotosAdded = newPhotosAdded,
                LastSyncedAt = place.GoogleData.LastSyncedAt,
                Message = updatedFields.Any() || newPhotosAdded > 0
                    ? $"Updated: {string.Join(", ", updatedFields)}"
                    : "No changes detected"
            };
        }

        public async Task<EnrichedPlaceDto?> GetEnrichedPlace(int placeId, int userId)
        {
            var place = await _context.Places
                .Include(p => p.GoogleData)
                .ThenInclude(g => g!.Photos.OrderBy(ph => ph.OrderIndex))
                .Include(p => p.PlaceCategories)
                .ThenInclude(pc => pc.Category)
                .Include(p => p.PlaceCountries)
                .ThenInclude(pc => pc.Country)
                .FirstOrDefaultAsync(p => p.Id == placeId && p.UserId == userId);

            if (place == null)
            {
                return null;
            }

            return MapToEnrichedPlaceDto(place);
        }

        public async Task<Place> AddManualPlace(string name, double lat, double lng, int userId, string? notes = null)
        {
            _logger.LogInformation($"Creating manual place '{name}' at ({lat}, {lng}) for user {userId}");

            var place = new Place
            {
                UserId = userId,
                Name = name,
                Location = _geometryFactory.CreatePoint(new Coordinate(lng, lat)),
                GooglePlaceId = null, // No Google data
                Notes = notes,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            _context.Places.Add(place);
            await _context.SaveChangesAsync();

            _logger.LogInformation($"Created manual place ID {place.Id}");

            return place;
        }

        public async Task<int> ReverseGeocodeExistingPlaces(int userId)
        {
            _logger.LogInformation($"Reverse geocoding existing places for user {userId}");

            var placesWithoutGoogle = await _context.Places
                .Where(p => p.UserId == userId && p.GooglePlaceId == null)
                .ToListAsync();

            _logger.LogInformation($"Found {placesWithoutGoogle.Count} places without Google data");

            int linkedCount = 0;

            foreach (var place in placesWithoutGoogle)
            {
                try
                {
                    var reverseResult = await _googleMapsService.ReverseGeocode(place.Location.Y, place.Location.X);

                    if (reverseResult != null)
                    {
                        // Check if GooglePlaceData already exists
                        var googleData = await _context.GooglePlaceData
                            .FirstOrDefaultAsync(g => g.GooglePlaceId == reverseResult.PlaceId);

                        if (googleData == null)
                        {
                            // Create it
                            googleData = new GooglePlaceData
                            {
                                GooglePlaceId = reverseResult.PlaceId,
                                Name = reverseResult.Name,
                                FormattedAddress = reverseResult.FormattedAddress,
                                Location = _geometryFactory.CreatePoint(new Coordinate(reverseResult.Longitude, reverseResult.Latitude)),
                                Types = JsonSerializer.Serialize(reverseResult.Types),
                                Rating = reverseResult.Rating,
                                UserRatingsTotal = reverseResult.UserRatingsTotal,
                                PriceLevel = reverseResult.PriceLevel,
                                Website = reverseResult.Website,
                                PhoneNumber = reverseResult.PhoneNumber,
                                OpeningHours = reverseResult.OpeningHours,
                                LastSyncedAt = DateTime.UtcNow,
                                SyncVersion = 1
                            };

                            _context.GooglePlaceData.Add(googleData);

                            // Add photos
                            foreach (var photoDto in reverseResult.Photos)
                            {
                                var photo = new PlacePhoto
                                {
                                    GooglePlaceId = reverseResult.PlaceId,
                                    PhotoReference = photoDto.PhotoReference,
                                    PhotoUrl = string.Empty, // Don't store URL - generate dynamically from PhotoReference
                                    Width = photoDto.Width,
                                    Height = photoDto.Height,
                                    IsPrimary = googleData.Photos.Count == 0,
                                    Source = "google",
                                    OrderIndex = googleData.Photos.Count
                                };
                                googleData.Photos.Add(photo);
                            }
                        }

                        // Link place to Google data
                        place.GooglePlaceId = reverseResult.PlaceId;
                        place.UpdatedAt = DateTime.UtcNow;

                        linkedCount++;
                        _logger.LogInformation($"Linked place {place.Id} to Google Place {reverseResult.PlaceId}");
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning($"Failed to reverse geocode place {place.Id}: {ex.Message}");
                }
            }

            await _context.SaveChangesAsync();

            _logger.LogInformation($"Successfully linked {linkedCount} out of {placesWithoutGoogle.Count} places");

            return linkedCount;
        }

        public async Task<bool> UpdateNotes(int placeId, int userId, string? notes)
        {
            var place = await _context.Places
                .FirstOrDefaultAsync(p => p.Id == placeId && p.UserId == userId);

            if (place == null)
            {
                return false;
            }

            place.Notes = notes;
            place.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();

            return true;
        }

        // ===== Helper Methods =====

        private PlaceDto MapToPlaceDto(Place place)
        {
            return new PlaceDto
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
                Categories = place.PlaceCategories?.Select(pc => new CategoryDto
                {
                    Id = pc.Category.Id,
                    Name = pc.Category.Name,
                    Icon = pc.Category.Icon,
                    Description = pc.Category.Description
                }).ToList() ?? new List<CategoryDto>(),
                Countries = place.PlaceCountries?.Select(pc => new CountryDto
                {
                    Id = pc.Country.Id,
                    Name = pc.Country.Name,
                    Code = pc.Country.Code,
                    Icon = pc.Country.Icon,
                    Description = pc.Country.Description
                }).ToList() ?? new List<CountryDto>()
            };
        }

        private EnrichedPlaceDto MapToEnrichedPlaceDto(Place place)
        {
            var dto = new EnrichedPlaceDto
            {
                Id = place.Id,
                UserId = place.UserId,
                Name = place.Name,
                Latitude = place.Location.Y,
                Longitude = place.Location.X,
                Notes = place.Notes,
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

            // Add Google data if present
            if (place.GoogleData != null)
            {
                dto.GoogleData = new GooglePlaceDataDto
                {
                    GooglePlaceId = place.GoogleData.GooglePlaceId,
                    FormattedAddress = place.GoogleData.FormattedAddress ?? string.Empty,
                    Types = string.IsNullOrEmpty(place.GoogleData.Types)
                        ? new List<string>()
                        : JsonSerializer.Deserialize<List<string>>(place.GoogleData.Types) ?? new List<string>(),
                    Rating = place.GoogleData.Rating,
                    UserRatingsTotal = place.GoogleData.UserRatingsTotal,
                    PriceLevel = place.GoogleData.PriceLevel,
                    Website = place.GoogleData.Website,
                    PhoneNumber = place.GoogleData.PhoneNumber,
                    BusinessStatus = place.GoogleData.BusinessStatus,
                    OpeningHours = place.GoogleData.OpeningHours,
                    LastSyncedAt = place.GoogleData.LastSyncedAt,
                    SyncVersion = place.GoogleData.SyncVersion,
                    Photos = place.GoogleData.Photos.Select(p => new PlacePhotoDto
                    {
                        PhotoReference = p.PhotoReference ?? string.Empty,
                        PhotoUrl = !string.IsNullOrEmpty(p.PhotoReference)
                            ? _googleMapsService.GeneratePhotoUrl(p.PhotoReference, p.Width ?? 400)
                            : null,
                        Width = p.Width ?? 0,
                        Height = p.Height ?? 0
                    }).ToList()
                };
            }

            return dto;
        }
    }
}
