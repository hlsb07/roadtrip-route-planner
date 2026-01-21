using Microsoft.AspNetCore.Identity;

namespace RoutePlanner.API.Models
{
    /// <summary>
    /// Extended IdentityUser for route planner application
    /// Migrated from existing User model
    /// </summary>
    public class ApplicationUser : IdentityUser<int>
    {
        // Legacy field from old User model (for backward compatibility)
        // Maps to UserName from IdentityUser
        public string? Username { get; set; }

        // Timestamps
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        // Navigation Properties (preserve existing relationships)
        public List<Place> Places { get; set; } = new();
        public List<Route> Routes { get; set; } = new();
        public List<UserCampsite> UserCampsites { get; set; } = new();

        // Refresh Tokens
        public List<RefreshToken> RefreshTokens { get; set; } = new();
    }
}
