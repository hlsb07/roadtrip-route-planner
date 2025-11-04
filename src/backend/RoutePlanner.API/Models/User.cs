namespace RoutePlanner.API.Models
{
    /// <summary>
    /// User entity for future multi-user support
    /// Currently uses a default user (Id = 1)
    /// Phase 2 will add authentication and proper user management
    /// </summary>
    public class User
    {
        public int Id { get; set; }
        public required string Username { get; set; }
        public required string Email { get; set; }
        public required string PasswordHash { get; set; } // BCrypt hash (future)

        // Timestamps
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        // Navigation Properties
        public List<Place> Places { get; set; } = new(); // User's personal places
        public List<Route> Routes { get; set; } = new(); // User's routes
    }
}
