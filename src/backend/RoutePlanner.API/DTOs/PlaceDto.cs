namespace RoutePlanner.API.DTOs
{
    public class PlaceDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public double Latitude { get; set; }
        public double Longitude { get; set; }
        public List<CategoryDto> Categories { get; set; } = new();
        public List<CountryDto> Countries { get; set; } = new();
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

    // Category DTOs
    public class CategoryDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? Icon { get; set; }
        public string? Description { get; set; }
    }

    public class CreateCategoryDto
    {
        public string Name { get; set; } = string.Empty;
        public string? Icon { get; set; }
        public string? Description { get; set; }
    }

    public class UpdateCategoryDto
    {
        public string Name { get; set; } = string.Empty;
        public string? Icon { get; set; }
        public string? Description { get; set; }
    }

    public class AssignCategoryDto
    {
        public int CategoryId { get; set; }
    }

    // Country DTOs
    public class CountryDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? Code { get; set; }
        public string? Icon { get; set; }
        public string? Description { get; set; }
    }

    public class CreateCountryDto
    {
        public string Name { get; set; } = string.Empty;
        public string? Code { get; set; }
        public string? Icon { get; set; }
        public string? Description { get; set; }
    }

    public class UpdateCountryDto
    {
        public string Name { get; set; } = string.Empty;
        public string? Code { get; set; }
        public string? Icon { get; set; }
        public string? Description { get; set; }
    }

    public class AssignCountryDto
    {
        public int CountryId { get; set; }
    }
}
