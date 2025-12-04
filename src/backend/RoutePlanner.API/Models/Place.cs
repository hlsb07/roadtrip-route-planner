using NetTopologySuite.Geometries;

namespace RoutePlanner.API.Models
{
    /// <summary>
    /// User-owned place entity
    /// Can optionally link to shared GooglePlaceData for rich Google Maps information
    /// Each user has their own Place records with personal notes, categories, etc.
    /// </summary>
    public class Place
    {
        public int Id { get; set; }

        // User Ownership (for multi-user support)
        public int UserId { get; set; } = 1; // Default to user 1 for now

        // Basic Place Information (required)
        public required string Name { get; set; }
        public required Point Location { get; set; } // PostGIS point (SRID 4326)

        // User-Added Content (personal)
        public string? Notes { get; set; } // Personal notes about this place

        // Link to Google Place Data (optional - null for manual coordinate places)
        public string? GooglePlaceId { get; set; }

        // Timestamps
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? LastViewedAt { get; set; } // Track when user last viewed this place

        // Navigation Properties

        // User who owns this place
        public User User { get; set; } = null!;

        // Optional link to shared Google place data
        public GooglePlaceData? GoogleData { get; set; }

        // User's personal organization
        public List<RoutePlace> RoutePlaces { get; set; } = new();
        public List<PlaceCategory> PlaceCategories { get; set; } = new();
        public List<PlaceCountry> PlaceCountries { get; set; } = new();
    }

}