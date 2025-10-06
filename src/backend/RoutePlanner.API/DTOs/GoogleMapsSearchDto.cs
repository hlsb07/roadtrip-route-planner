namespace RoutePlanner.API.DTOs
{
    public class GoogleMapsSearchRequest
    {
        public string Query { get; set; } = string.Empty;
        public string Type { get; set; } = "autocomplete"; // autocomplete, geocode, place_details
    }

    public class GoogleMapsSearchResponse
    {
        public List<PlaceSearchResult> Results { get; set; } = new();
        public bool FromCache { get; set; }
        public CacheStatistics? Statistics { get; set; }
    }

    public class PlaceSearchResult
    {
        public string PlaceId { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string FormattedAddress { get; set; } = string.Empty;
        public double Latitude { get; set; }
        public double Longitude { get; set; }
        public List<string> Types { get; set; } = new();
        public bool FromCache { get; set; }
    }

    public class CacheStatistics
    {
        public int TotalCachedPlaces { get; set; }
        public int CacheHits { get; set; }
        public int ApiCalls { get; set; }
        public double CacheHitRate { get; set; }
        public decimal EstimatedCostSavings { get; set; }
    }

    public class PlaceDetailRequest
    {
        public string PlaceId { get; set; } = string.Empty;
    }
}
