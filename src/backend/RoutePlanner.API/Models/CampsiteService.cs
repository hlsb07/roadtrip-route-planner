namespace RoutePlanner.API.Models
{
    /// <summary>
    /// Represents a service available at a campsite
    /// </summary>
    public class CampsiteService
    {
        /// <summary>
        /// Service name (e.g., "Water", "Electricity", "WiFi")
        /// </summary>
        public string Name { get; set; } = string.Empty;

        /// <summary>
        /// Path to the service icon (e.g., "/images/campsites/activities/water.svg")
        /// </summary>
        public string? IconPath { get; set; }
    }
}
