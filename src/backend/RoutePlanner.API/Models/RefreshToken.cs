namespace RoutePlanner.API.Models
{
    /// <summary>
    /// Refresh token entity for JWT token rotation
    /// Implements secure refresh token pattern with one-time use
    /// </summary>
    public class RefreshToken
    {
        public int Id { get; set; }
        public int UserId { get; set; }

        /// <summary>
        /// Cryptographically secure random string
        /// </summary>
        public required string Token { get; set; }

        /// <summary>
        /// Links to JWT access token (jti claim)
        /// Prevents token reuse attacks
        /// </summary>
        public required string JwtId { get; set; }

        /// <summary>
        /// Marks token as used (one-time use pattern)
        /// Token rotation: each refresh invalidates old token
        /// </summary>
        public bool IsUsed { get; set; } = false;

        /// <summary>
        /// Allows explicit revocation (logout, security incidents)
        /// </summary>
        public bool IsRevoked { get; set; } = false;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime ExpiresAt { get; set; }

        // Navigation
        public ApplicationUser User { get; set; } = null!;
    }
}
