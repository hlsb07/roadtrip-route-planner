namespace RoutePlanner.API.DTOs
{
    public class PlaceDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public double Latitude { get; set; }
        public double Longitude { get; set; }
    }

    public class CreatePlaceDto
    {
        public string Name { get; set; } = string.Empty;
        public double Latitude { get; set; }
        public double Longitude { get; set; }
    }

    public class RouteDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public List<PlaceDto> Places { get; set; } = new();
        public DateTime CreatedAt { get; set; }
    }
}