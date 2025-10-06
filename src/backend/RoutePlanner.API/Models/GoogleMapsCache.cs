using NetTopologySuite.Geometries;

namespace RoutePlanner.API.Models
{
    public class GoogleMapsCache
    {
        public int Id { get; set; }

        // Search metadata
        public string SearchQuery { get; set; } = string.Empty;
        public string GooglePlaceId { get; set; } = string.Empty;

        // Place details
        public string Name { get; set; } = string.Empty;
        public string FormattedAddress { get; set; } = string.Empty;
        public Point Location { get; set; } = null!; // PostGIS point

        // Additional data (JSON)
        public string? Types { get; set; } // Store as JSON array
        public string? AdditionalData { get; set; } // Extra metadata as JSON

        // Cache management
        public DateTime CachedAt { get; set; }
        public DateTime ExpiresAt { get; set; }
        public int HitCount { get; set; } = 0; // Track usage

        // API tracking
        public string ApiType { get; set; } = string.Empty; // "autocomplete", "geocode", "place_details"
    }
}
