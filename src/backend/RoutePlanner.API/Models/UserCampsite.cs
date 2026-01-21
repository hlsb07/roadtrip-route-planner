namespace RoutePlanner.API.Models
{
    /// <summary>
    /// Junction table for many-to-many relationship between Users and Campsites.
    /// Allows multiple users to reference the same campsite record while maintaining user-specific views.
    /// </summary>
    public class UserCampsite
    {
        public int UserId { get; set; }
        public ApplicationUser User { get; set; } = null!;

        public int CampsiteId { get; set; }
        public Campsite Campsite { get; set; } = null!;

        /// <summary>
        /// When this user added this campsite to their collection
        /// </summary>
        public DateTime AddedAt { get; set; } = DateTime.UtcNow;
    }
}
