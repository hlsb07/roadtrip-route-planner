using System.ComponentModel.DataAnnotations;

namespace RoutePlanner.API.Models
{
    public class Category
    {
        public int Id { get; set; }

        [Required]
        [MaxLength(200)]
        public string Name { get; set; } = string.Empty;

        /// <summary>
        /// Icon/Emoji identifier for the category (e.g., "🏖️", "🏔️", "🍴")
        /// </summary>
        [MaxLength(50)]
        public string? Icon { get; set; }

        [MaxLength(1000)]
        public string? Description { get; set; }

        // Navigation property for many-to-many relationship
        public List<PlaceCategory> PlaceCategories { get; set; } = new();
    }
}
