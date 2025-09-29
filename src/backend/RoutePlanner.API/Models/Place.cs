using NetTopologySuite.Geometries;

namespace RoutePlanner.API.Models
{
    public class Place
    {
        public int Id { get; set; }
        public required string Name { get; set; }
        public required Point Location { get; set; }
        
        public List<RoutePlace> RoutePlaces { get; set; } = new();
    }

}