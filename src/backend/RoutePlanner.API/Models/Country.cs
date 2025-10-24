using System.ComponentModel.DataAnnotations;

namespace RoutePlanner.API.Models
{
    public class Country
    {
        public int Id { get; set; }

        [Required]
        [MaxLength(200)]
        public string Name { get; set; } = string.Empty;

        /// <summary>
        /// ISO 3166-1 alpha-2 country code (e.g., "US", "DE", "NZ")
        /// </summary>
        [MaxLength(2)]
        public string? Code { get; set; }

        /// <summary>
        /// Flag emoji for the country (e.g., "🇺🇸", "🇩🇪", "🇳🇿")
        /// </summary>
        [MaxLength(10)]
        public string? Icon { get; set; }

        [MaxLength(1000)]
        public string? Description { get; set; }

        // Navigation property for many-to-many relationship
        public List<PlaceCountry> PlaceCountries { get; set; } = new();
    }
}
