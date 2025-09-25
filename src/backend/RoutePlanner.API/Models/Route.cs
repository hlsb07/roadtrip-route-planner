namespace RoutePlanner.API.Models
{
    public class Route
    {
        public int Id { get; set; }
        public string Name { get; set; } = "My NZ Route";
        
        public string Description { get; set; } = "My Route";
        public List<RoutePlace> Places { get; set; } = new();
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }

    public class RoutePlace
    {
        public int Id { get; set; }
        public int RouteId { get; set; }
        public int PlaceId { get; set; }
        public int OrderIndex { get; set; }
        
        // Navigation Properties
        public Route Route { get; set; } = null!;
        public Place Place { get; set; } = null!;
    }
}