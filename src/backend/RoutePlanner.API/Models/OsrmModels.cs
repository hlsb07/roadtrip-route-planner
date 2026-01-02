namespace RoutePlanner.API.Models.Osrm
{
    /// <summary>
    /// OSRM API response models
    /// Documentation: http://project-osrm.org/docs/v5.24.0/api/#route-service
    /// </summary>

    public class OsrmRouteResponse
    {
        public string Code { get; set; } = string.Empty; // "Ok" or error code
        public List<OsrmRoute> Routes { get; set; } = new();
        public List<OsrmWaypoint> Waypoints { get; set; } = new();
        public string? Message { get; set; } // Error message if code != "Ok"
    }

    public class OsrmRoute
    {
        public OsrmGeometry Geometry { get; set; } = new();
        public List<OsrmLeg> Legs { get; set; } = new();
        public double Distance { get; set; } // meters
        public double Duration { get; set; } // seconds
        public string? WeightName { get; set; }
        public double Weight { get; set; }
    }

    public class OsrmLeg
    {
        public List<OsrmStep> Steps { get; set; } = new();
        public double Distance { get; set; } // meters
        public double Duration { get; set; } // seconds
        public string Summary { get; set; } = string.Empty;
        public double Weight { get; set; }
    }

    public class OsrmStep
    {
        public OsrmGeometry Geometry { get; set; } = new();
        public OsrmManeuver Maneuver { get; set; } = new(); // Single object, not a list
        public string Mode { get; set; } = string.Empty;
        public string DrivingSide { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public double Distance { get; set; }
        public double Duration { get; set; }
        public double Weight { get; set; }
    }

    public class OsrmGeometry
    {
        /// <summary>
        /// GeoJSON format coordinates: [[lon, lat], [lon, lat], ...]
        /// </summary>
        public List<List<double>> Coordinates { get; set; } = new();
        public string Type { get; set; } = "LineString";
    }

    public class OsrmWaypoint
    {
        public string Hint { get; set; } = string.Empty;
        public double Distance { get; set; }
        public string Name { get; set; } = string.Empty;
        public List<double> Location { get; set; } = new(); // [lon, lat]
    }

    public class OsrmManeuver
    {
        public List<double> Location { get; set; } = new();
        public int BearingBefore { get; set; }
        public int BearingAfter { get; set; }
        public string Type { get; set; } = string.Empty;
        public string? Modifier { get; set; }
    }
}
