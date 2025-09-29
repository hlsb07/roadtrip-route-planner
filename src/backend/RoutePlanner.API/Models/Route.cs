namespace RoutePlanner.API.Models
{

    public class Route
    {
        public int Id { get; set; }
        public required string Name { get; set; }
        public string? Description { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        
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