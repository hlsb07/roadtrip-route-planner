namespace RoutePlanner.API.DTOs
{
    /// <summary>
    /// Overall conflict status for a route
    /// </summary>
    public class RouteOrderConflictDto
    {
        public bool HasConflict { get; set; }
        public List<ConflictingStopDto> ConflictingStops { get; set; } = new();
        public List<int> OrderIndexSequence { get; set; } = new();
        public List<int> TimeSequence { get; set; } = new();
    }

    /// <summary>
    /// Details about a specific conflicting stop
    /// </summary>
    public class ConflictingStopDto
    {
        public int RoutePlaceId { get; set; }
        public string PlaceName { get; set; } = string.Empty;
        public int OrderIndexPosition { get; set; }
        public int TimeSequencePosition { get; set; }
        public DateTimeOffset? PlannedStart { get; set; }
    }

    /// <summary>
    /// Result of checking if a schedule change would create conflicts
    /// </summary>
    public class ScheduleChangeConflictDto
    {
        public bool WouldCreateConflict { get; set; }
        public int RoutePlaceId { get; set; }
        public string PlaceName { get; set; } = string.Empty;
        public int CurrentOrderIndex { get; set; }
        public int NewTimePosition { get; set; }
        public bool SuggestedReorder { get; set; }
        public List<int> AffectedStops { get; set; } = new();
        public string? Message { get; set; }
    }

    /// <summary>
    /// Enhanced itinerary DTO with conflict information
    /// </summary>
    public class RouteItineraryWithConflictsDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? Description { get; set; }
        public RouteScheduleSettingsDto? ScheduleSettings { get; set; }
        public List<RoutePlaceWithScheduleDto> Places { get; set; } = new();
        public List<RouteLegDto> Legs { get; set; } = new();
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        public RouteOrderConflictDto? ConflictInfo { get; set; }
    }

    /// <summary>
    /// Result of schedule recalculation
    /// </summary>
    public class RecalculateScheduleResultDto
    {
        public int UpdatedStops { get; set; }
        public List<ScheduleChangeDetail> Changes { get; set; } = new();
        public bool PreservedLockedDays { get; set; }
    }

    /// <summary>
    /// Detail of a single schedule change
    /// </summary>
    public class ScheduleChangeDetail
    {
        public int RoutePlaceId { get; set; }
        public string PlaceName { get; set; } = string.Empty;
        public DateTimeOffset? OldStart { get; set; }
        public DateTimeOffset? OldEnd { get; set; }
        public DateTimeOffset? NewStart { get; set; }
        public DateTimeOffset? NewEnd { get; set; }
        public bool WasLocked { get; set; }
    }

    /// <summary>
    /// Request to resolve conflicts by reordering
    /// </summary>
    public class ResolveConflictByReorderDto
    {
        public bool RecalculateScheduleAfter { get; set; } = false;
    }

    /// <summary>
    /// Request to check if a schedule change would create conflicts
    /// </summary>
    public class CheckScheduleChangeRequest
    {
        public int RoutePlaceId { get; set; }
        public DateTimeOffset NewPlannedStart { get; set; }
        public DateTimeOffset NewPlannedEnd { get; set; }
    }

    /// <summary>
    /// Enhanced request for reordering places with schedule recalculation options
    /// </summary>
    public class ReorderPlacesRequest
    {
        public List<int> PlaceIds { get; set; } = new();
        public bool RecalculateSchedule { get; set; } = true;
        public bool PreserveLockedDays { get; set; } = true;
    }
}
