using RoutePlanner.API.Models;

namespace RoutePlanner.API.DTOs
{
    /// <summary>
    /// Data Transfer Object for Campsite response
    /// </summary>
    public class CampsiteDto
    {
        public int Id { get; set; }
        public string Park4NightId { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public double Latitude { get; set; }
        public double Longitude { get; set; }
        public decimal? Rating { get; set; }
        public string? Type { get; set; }
        public List<string>? Services { get; set; }
        public List<CampsiteActivity>? Activities { get; set; }
        public string? Price { get; set; }
        public int? NumberOfSpots { get; set; }

        /// <summary>
        /// Multi-language descriptions (e.g., {"en": "Description in English", "de": "Beschreibung auf Deutsch"})
        /// </summary>
        public Dictionary<string, string>? Descriptions { get; set; }

        public List<string>? ImagePaths { get; set; }
        public string SourceUrl { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }

    /// <summary>
    /// Request DTO for scraping a campsite
    /// </summary>
    public class ScrapeCampsiteRequest
    {
        public string Url { get; set; } = string.Empty;
    }

    /// <summary>
    /// Response DTO indicating scraping and save success
    /// </summary>
    public class ScrapeCampsiteResponse
    {
        public bool Success { get; set; }
        public string Message { get; set; } = string.Empty;
        public CampsiteDto? Campsite { get; set; }
    }
}
