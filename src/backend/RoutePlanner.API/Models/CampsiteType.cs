namespace RoutePlanner.API.Models
{
    /// <summary>
    /// Represents a type/category of campsite
    /// </summary>
    public class CampsiteType
    {
        /// <summary>
        /// Type name (e.g., "Womo-Platz ohne Dienstleistungen", "Private Parkplatz")
        /// </summary>
        public string Name { get; set; } = string.Empty;

        /// <summary>
        /// Path to the type icon (e.g., "/images/campsites/types/womo_platz.svg")
        /// </summary>
        public string? IconPath { get; set; }
    }
}
