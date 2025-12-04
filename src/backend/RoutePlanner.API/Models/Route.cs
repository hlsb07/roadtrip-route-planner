namespace RoutePlanner.API.Models
{
    /// <summary>
    /// User-owned route entity
    /// Contains an ordered list of places for a trip/journey
    /// </summary>
    public class Route
    {
        public int Id { get; set; }

        // User Ownership (for multi-user support)
        public int UserId { get; set; } = 1; // Default to user 1 for now

        public required string Name { get; set; }
        public string? Description { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        // Navigation Properties
        public User User { get; set; } = null!;
        public List<RoutePlace> Places { get; set; } = new();
    }

    public class RoutePlace
    {
        public int Id { get; set; }
        public int RouteId { get; set; }
        public int PlaceId { get; set; }
        public int OrderIndex { get; set; }
        
        public Route? Route { get; set; }
        public Place? Place { get; set; }
    }
}