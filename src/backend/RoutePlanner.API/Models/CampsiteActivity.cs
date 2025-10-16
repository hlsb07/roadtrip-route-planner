namespace RoutePlanner.API.Models
{
    /// <summary>
    /// Represents an activity available at a campsite
    /// </summary>
    public class CampsiteActivity
    {
        /// <summary>
        /// Activity name (e.g., "Swimming", "Hiking", "Fishing")
        /// </summary>
        public string Name { get; set; } = string.Empty;

        /// <summary>
        /// Path to the activity icon (e.g., "/images/campsites/activities/swimming.svg")
        /// </summary>
        public string? IconPath { get; set; }
    }
}
