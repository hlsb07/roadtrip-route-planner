namespace RoutePlanner.API.Models
{
    /// <summary>
    /// JWT configuration settings
    /// Loaded from appsettings.json and user secrets
    /// </summary>
    public class JwtSettings
    {
        /// <summary>
        /// Secret key for signing tokens (minimum 256 bits / 32 characters for HS256)
        /// Should be stored in user secrets or environment variables, NOT in source code
        /// </summary>
        public required string Secret { get; set; }

        /// <summary>
        /// Token issuer (identifies the server that issued the token)
        /// </summary>
        public required string Issuer { get; set; }

        /// <summary>
        /// Token audience (identifies the intended recipient)
        /// </summary>
        public required string Audience { get; set; }

        /// <summary>
        /// Access token expiration in minutes (recommended: 15-60 minutes)
        /// Short-lived for security
        /// </summary>
        public int AccessTokenExpirationMinutes { get; set; } = 15;

        /// <summary>
        /// Refresh token expiration in days (recommended: 7-30 days)
        /// Allows long sessions without long-lived access tokens
        /// </summary>
        public int RefreshTokenExpirationDays { get; set; } = 7;
    }
}
