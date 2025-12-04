namespace RoutePlanner.API.Models
{
    /// <summary>
    /// Photos for Google places - shared across all users
    /// Linked to GooglePlaceId (not PlaceId) to avoid duplication
    /// </summary>
    public class PlacePhoto
    {
        public int Id { get; set; }

        // Link to shared Google place data
        public required string GooglePlaceId { get; set; }

        // Photo Data
        public string? PhotoReference { get; set; } // Google's photo reference (for regenerating URLs)
        public required string PhotoUrl { get; set; } // Full URL to the photo
        public int? Width { get; set; }
        public int? Height { get; set; }

        // Metadata
        public bool IsPrimary { get; set; } = false; // Main photo for the place
        public string Source { get; set; } = "google"; // "google", "user", "manual"
        public int OrderIndex { get; set; } = 0; // Display order

        // Timestamp
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        // Navigation Properties
        public GooglePlaceData GooglePlace { get; set; } = null!;
    }
}
