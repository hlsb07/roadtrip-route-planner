using NetTopologySuite.Geometries;
using System.ComponentModel.DataAnnotations;

namespace RoutePlanner.API.Models
{
    public class Campsite
    {
        public int Id { get; set; }

        [Required]
        [MaxLength(50)]
        public string Park4NightId { get; set; } = string.Empty;

        [Required]
        [MaxLength(300)]
        public string Name { get; set; } = string.Empty;

        [Required]
        public Point Location { get; set; } = null!;

        // Convenience properties for Latitude/Longitude
        public double Latitude
        {
            get => Location?.Y ?? 0;
            set
            {
                if (Location == null)
                {
                    Location = new Point(Longitude, value) { SRID = 4326 };
                }
                else
                {
                    Location = new Point(Location.X, value) { SRID = 4326 };
                }
            }
        }

        public double Longitude
        {
            get => Location?.X ?? 0;
            set
            {
                if (Location == null)
                {
                    Location = new Point(value, Latitude) { SRID = 4326 };
                }
                else
                {
                    Location = new Point(value, Location.Y) { SRID = 4326 };
                }
            }
        }

        public decimal? Rating { get; set; }

        [MaxLength(200)]
        public string? Type { get; set; }

        /// <summary>
        /// JSON array of available services (e.g., ["Water", "Electricity", "WiFi"])
        /// </summary>
        public string? Services { get; set; }

        /// <summary>
        /// JSON array of available activities (e.g., ["Hiking", "Swimming", "Fishing"])
        /// </summary>
        public string? Activities { get; set; }

        [MaxLength(200)]
        public string? Price { get; set; }

        public int? NumberOfSpots { get; set; }

        public string? Description { get; set; }

        /// <summary>
        /// JSON array of image paths (e.g., ["/images/campsites/561613_1.jpg", "/images/campsites/561613_2.jpg"])
        /// </summary>
        public string? ImagePaths { get; set; }

        [Required]
        [MaxLength(500)]
        public string SourceUrl { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}
