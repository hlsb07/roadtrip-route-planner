using NetTopologySuite.Geometries;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json;

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
        /// JSON array of available services with icons (stored as JSON)
        /// </summary>
        public string? Services { get; set; }

        /// <summary>
        /// Helper property to work with services as a list of objects
        /// </summary>
        [NotMapped]
        public List<CampsiteService>? ServicesList
        {
            get => string.IsNullOrEmpty(Services)
                ? null
                : JsonSerializer.Deserialize<List<CampsiteService>>(Services);
            set => Services = value == null
                ? null
                : JsonSerializer.Serialize(value);
        }

        /// <summary>
        /// JSON array of available activities with icons (stored as JSON)
        /// </summary>
        public string? Activities { get; set; }

        /// <summary>
        /// Helper property to work with activities as a list of objects
        /// </summary>
        [NotMapped]
        public List<CampsiteActivity>? ActivitiesList
        {
            get => string.IsNullOrEmpty(Activities)
                ? null
                : JsonSerializer.Deserialize<List<CampsiteActivity>>(Activities);
            set => Activities = value == null
                ? null
                : JsonSerializer.Serialize(value);
        }

        [MaxLength(200)]
        public string? Price { get; set; }

        public int? NumberOfSpots { get; set; }

        /// <summary>
        /// Multi-language descriptions stored as JSONB (e.g., {"en": "Description in English", "de": "Beschreibung auf Deutsch"})
        /// </summary>
        [Column(TypeName = "jsonb")]
        public string? Descriptions { get; set; }

        /// <summary>
        /// Helper property to work with descriptions as a dictionary
        /// </summary>
        [NotMapped]
        public Dictionary<string, string>? DescriptionsDict
        {
            get => string.IsNullOrEmpty(Descriptions)
                ? null
                : JsonSerializer.Deserialize<Dictionary<string, string>>(Descriptions);
            set => Descriptions = value == null
                ? null
                : JsonSerializer.Serialize(value);
        }

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
