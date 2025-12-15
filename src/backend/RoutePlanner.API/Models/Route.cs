using System.ComponentModel.DataAnnotations;

namespace RoutePlanner.API.Models
{
    /// <summary>
    /// Stop type classification for RoutePlace
    /// </summary>
    public enum StopType
    {
        Overnight = 0,
        DayStop = 1,
        Waypoint = 2
    }

    /// <summary>
    /// User-owned route entity
    /// Contains an ordered list of places for a trip/journey
    /// </summary>
    public class Route
    {
        public int Id { get; set; }

        // User Ownership (for multi-user support)
        public int UserId { get; set; } = 1; // Default to user 1 for now

        public required string Name { get; set; }
        public string? Description { get; set; }

        // Schedule Settings
        [MaxLength(100)]
        public string TimeZoneId { get; set; } = "Europe/Berlin"; // IANA timezone

        public DateTimeOffset? StartDateTime { get; set; }
        public DateTimeOffset? EndDateTime { get; set; }

        // Optional defaults for UI/auto-fill
        public TimeOnly? DefaultArrivalTime { get; set; }
        public TimeOnly? DefaultDepartureTime { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        // Navigation Properties
        public User User { get; set; } = null!;
        public List<RoutePlace> Places { get; set; } = new();
        public List<RouteLeg> Legs { get; set; } = new();
    }

    public class RoutePlace
    {
        public int Id { get; set; }
        public int RouteId { get; set; }
        public int PlaceId { get; set; }
        public int OrderIndex { get; set; }

        // Stop Type
        public StopType StopType { get; set; } = StopType.Overnight;

        // Timezone override (nullable - if set, overrides Route.TimeZoneId)
        [MaxLength(100)]
        public string? TimeZoneId { get; set; }

        // Planned Times (timestamptz)
        public DateTimeOffset? PlannedStart { get; set; }
        public DateTimeOffset? PlannedEnd { get; set; }

        // Stay Duration
        public int? StayNights { get; set; }
        public int? StayDurationMinutes { get; set; }

        // Lock Flags (prevent auto-rescheduling)
        public bool IsStartLocked { get; set; } = false;
        public bool IsEndLocked { get; set; } = false;

        public Route? Route { get; set; }
        public Place? Place { get; set; }
    }
}