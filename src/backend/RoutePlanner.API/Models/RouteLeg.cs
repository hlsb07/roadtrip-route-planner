using System.ComponentModel.DataAnnotations;
using NetTopologySuite.Geometries;

namespace RoutePlanner.API.Models
{
    /// <summary>
    /// Stores OSRM routing data between consecutive stops
    /// Persists distance/time/geometry for offline access
    /// </summary>
    public class RouteLeg
    {
        public int Id { get; set; }

        public int RouteId { get; set; }
        public int FromRoutePlaceId { get; set; }
        public int ToRoutePlaceId { get; set; }

        public int OrderIndex { get; set; }

        // OSRM Data
        public int DistanceMeters { get; set; }
        public int DurationSeconds { get; set; }

        /// <summary>
        /// Road-following geometry from OSRM (LineString, SRID 4326)
        /// Nullable for backward compatibility with existing legs
        /// </summary>
        public LineString? Geometry { get; set; }

        [MaxLength(50)]
        public string Provider { get; set; } = "OSRM";

        public DateTime CalculatedAt { get; set; } = DateTime.UtcNow;

        /// <summary>
        /// Scheduled start time for this leg (when travel begins)
        /// Nullable for backward compatibility with existing legs
        /// </summary>
        public DateTimeOffset? PlannedStart { get; set; }

        /// <summary>
        /// Scheduled end time for this leg (when travel ends/arrival)
        /// Nullable for backward compatibility with existing legs
        /// </summary>
        public DateTimeOffset? PlannedEnd { get; set; }

        // Navigation Properties
        public Route Route { get; set; } = null!;
        public RoutePlace FromRoutePlace { get; set; } = null!;
        public RoutePlace ToRoutePlace { get; set; } = null!;
    }
}
