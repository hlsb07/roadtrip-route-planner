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
        public string? Description { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        public List<PlaceDto> Places { get; set; } = new();
        public int PlaceCount { get; set; }
        public double EstimatedDistance { get; set; } // km
    }
    public class CreateRouteDto
    {
        public string Name { get; set; } = string.Empty;
        public string? Description { get; set; }
    }
    public class UpdateRouteDto
    {
        public string Name { get; set; } = string.Empty;
        public string? Description { get; set; }
    }
    public class AddPlaceToRouteDto
    {
        public int PlaceId { get; set; }
        public int? OrderIndex { get; set; }
    }
    public class RouteListDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public int PlaceCount { get; set; }
        public DateTime CreatedAt { get; set; }
    }
}
