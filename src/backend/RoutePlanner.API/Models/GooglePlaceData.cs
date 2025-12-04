using NetTopologySuite.Geometries;

namespace RoutePlanner.API.Models
{
    /// <summary>
    /// Shared Google Maps place data - ONE record per Google Place ID
    /// Multiple users can have Places pointing to the same GooglePlaceData
    /// </summary>
    public class GooglePlaceData
    {
        // Google Place ID is the primary key (unique identifier from Google)
        public required string GooglePlaceId { get; set; }

        // Basic Information
        public required string Name { get; set; }
        public string? FormattedAddress { get; set; }
        public required Point Location { get; set; } // PostGIS point (SRID 4326)

        // Google Place Types (JSON array)
        public string? Types { get; set; } // e.g., ["restaurant", "food", "point_of_interest"]

        // Rich Information from Google
        public double? Rating { get; set; } // 1.0 to 5.0
        public int? UserRatingsTotal { get; set; }
        public int? PriceLevel { get; set; } // 0 to 4 ($, $$, $$$, $$$$)
        public string? Website { get; set; }
        public string? PhoneNumber { get; set; }
        public string? BusinessStatus { get; set; } // "OPERATIONAL", "CLOSED_TEMPORARILY", etc.

        // Structured Data (stored as JSON)
        public string? OpeningHours { get; set; } // Full opening hours object from Google

        // Sync Management
        public DateTime LastSyncedAt { get; set; } = DateTime.UtcNow;
        public int SyncVersion { get; set; } = 1; // Incremented on each sync

        // Timestamps
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        // Navigation Properties
        public List<Place> Places { get; set; } = new(); // Users' places that reference this Google place
        public List<PlacePhoto> Photos { get; set; } = new(); // Photos from Google (shared)
    }
}
