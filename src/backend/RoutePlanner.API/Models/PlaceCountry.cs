namespace RoutePlanner.API.Models
{
    /// <summary>
    /// Junction table for many-to-many relationship between Places and Countries
    /// </summary>
    public class PlaceCountry
    {
        public int PlaceId { get; set; }
        public Place Place { get; set; } = null!;

        public int CountryId { get; set; }
        public Country Country { get; set; } = null!;
    }
}
