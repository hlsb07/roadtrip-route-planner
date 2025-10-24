namespace RoutePlanner.API.Models
{
    /// <summary>
    /// Junction table for many-to-many relationship between Places and Categories
    /// </summary>
    public class PlaceCategory
    {
        public int PlaceId { get; set; }
        public Place Place { get; set; } = null!;

        public int CategoryId { get; set; }
        public Category Category { get; set; } = null!;
    }
}
