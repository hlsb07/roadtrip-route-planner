namespace RoutePlanner.API.DTOs
{
    public class PlaceDto
    {
        public int Id { get; set; }
        public int UserId { get; set; } // User ownership (read-only from API)
        public string Name { get; set; } = string.Empty;
        public double Latitude { get; set; }
        public double Longitude { get; set; }

        // User-added content
        public string? Notes { get; set; }

        // Google integration
        public string? GooglePlaceId { get; set; }
        public bool HasGoogleData => !string.IsNullOrEmpty(GooglePlaceId);

        // Timestamps
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        public DateTime? LastViewedAt { get; set; }

        // Relationships
        public List<CategoryDto> Categories { get; set; } = new();
        public List<CountryDto> Countries { get; set; } = new();
    }

    public class MinimalPlaceDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public int OrderIndex { get; set; }
    }

    public class CreatePlaceDto
    {
        public string Name { get; set; } = string.Empty;
        public double Latitude { get; set; }
        public double Longitude { get; set; }
        public string? Notes { get; set; }
    }

    public class UpdatePlaceDto
    {
        public string? Name { get; set; }
        public double? Latitude { get; set; }
        public double? Longitude { get; set; }
        public string? Notes { get; set; }
    }

    public class UpdateNotesDto
    {
        public string? Notes { get; set; }
    }

    public class RouteDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? Description { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        public List<MinimalPlaceDto> Places { get; set; } = new();
        public int PlaceCount { get; set; }
        public double EstimatedDistance { get; set; } // km
    }
    public class CreateRouteDto
    {
        public string Name { get; set; } = string.Empty;
        public string? Description { get; set; }
    }
    public class UpdateRouteDto
    {
        public string Name { get; set; } = string.Empty;
        public string? Description { get; set; }
    }
    public class AddPlaceToRouteDto
    {
        public int PlaceId { get; set; }
        public int? OrderIndex { get; set; }
    }
    public class RouteListDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public int PlaceCount { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    // Category DTOs
    public class CategoryDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? Icon { get; set; }
        public string? Description { get; set; }
    }

    public class CreateCategoryDto
    {
        public string Name { get; set; } = string.Empty;
        public string? Icon { get; set; }
        public string? Description { get; set; }
    }

    public class UpdateCategoryDto
    {
        public string Name { get; set; } = string.Empty;
        public string? Icon { get; set; }
        public string? Description { get; set; }
    }

    public class AssignCategoryDto
    {
        public int CategoryId { get; set; }
    }

    // Country DTOs
    public class CountryDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? Code { get; set; }
        public string? Icon { get; set; }
        public string? Description { get; set; }
    }

    public class CreateCountryDto
    {
        public string Name { get; set; } = string.Empty;
        public string? Code { get; set; }
        public string? Icon { get; set; }
        public string? Description { get; set; }
    }

    public class UpdateCountryDto
    {
        public string Name { get; set; } = string.Empty;
        public string? Code { get; set; }
        public string? Icon { get; set; }
        public string? Description { get; set; }
    }

    public class AssignCountryDto
    {
        public int CountryId { get; set; }
    }

    // ===== Google Places Integration DTOs =====

    /// <summary>
    /// Complete place data with all Google information embedded
    /// Used for detailed place views
    /// </summary>
    public class EnrichedPlaceDto
    {
        // Basic place info
        public int Id { get; set; }
        public int UserId { get; set; }
        public string Name { get; set; } = string.Empty;
        public double Latitude { get; set; }
        public double Longitude { get; set; }
        public string? Notes { get; set; }

        // Timestamps
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        public DateTime? LastViewedAt { get; set; }

        // User's custom organization
        public List<CategoryDto> Categories { get; set; } = new();
        public List<CountryDto> Countries { get; set; } = new();

        // Google Places data (optional - null if manual place)
        public GooglePlaceDataDto? GoogleData { get; set; }
    }

    public class GooglePlaceDataDto
    {
        public string GooglePlaceId { get; set; } = string.Empty;
        public string FormattedAddress { get; set; } = string.Empty;
        public List<string> Types { get; set; } = new();

        // Rich information
        public double? Rating { get; set; }
        public int? UserRatingsTotal { get; set; }
        public int? PriceLevel { get; set; }
        public string? Website { get; set; }
        public string? PhoneNumber { get; set; }
        public string? BusinessStatus { get; set; }
        public string? OpeningHours { get; set; } // JSON string

        // Photos
        public List<PlacePhotoDto> Photos { get; set; } = new();

        // Sync info
        public DateTime LastSyncedAt { get; set; }
        public int SyncVersion { get; set; }
    }

    /// <summary>
    /// Request to create a place from Google search result
    /// </summary>
    public class CreatePlaceFromGoogleDto
    {
        public string GooglePlaceId { get; set; } = string.Empty;
        public string? Notes { get; set; }
    }

    /// <summary>
    /// Request to check if a Google Place is already saved
    /// </summary>
    public class DuplicateCheckRequest
    {
        public string GooglePlaceId { get; set; } = string.Empty;
    }

    /// <summary>
    /// Response indicating if duplicate exists
    /// </summary>
    public class DuplicateCheckResponse
    {
        public bool IsDuplicate { get; set; }
        public PlaceDto? ExistingPlace { get; set; }
        public bool CoordinatesDiffer { get; set; }
        public string? Message { get; set; }
    }

    /// <summary>
    /// Response from refreshing Google data
    /// </summary>
    public class RefreshGoogleDataResponse
    {
        public bool Success { get; set; }
        public List<string> UpdatedFields { get; set; } = new();
        public int NewPhotosAdded { get; set; }
        public DateTime LastSyncedAt { get; set; }
        public string? Message { get; set; }
    }

    /// <summary>
    /// Request to reverse geocode coordinates
    /// </summary>
    public class ReverseGeocodeRequest
    {
        public double Latitude { get; set; }
        public double Longitude { get; set; }
        public string? PlaceTypes { get; set; } // Optional filter: "restaurant,cafe"
    }

    /// <summary>
    /// Response from reverse geocoding
    /// </summary>
    public class ReverseGeocodeResponse
    {
        public bool Found { get; set; }
        public string? GooglePlaceId { get; set; }
        public string? Name { get; set; }
        public string? FormattedAddress { get; set; }
        public List<string> Types { get; set; } = new();
    }
}
