using System.ComponentModel.DataAnnotations;

namespace RoutePlanner.API.DTOs
{
    /// <summary>
    /// Login request DTO
    /// </summary>
    public class LoginDto
    {
        [Required]
        [EmailAddress]
        public required string Email { get; set; }

        [Required]
        public required string Password { get; set; }
    }

    /// <summary>
    /// Refresh token request DTO
    /// </summary>
    public class RefreshTokenDto
    {
        [Required]
        public required string AccessToken { get; set; }

        [Required]
        public required string RefreshToken { get; set; }
    }

    /// <summary>
    /// Authentication response DTO
    /// Returned after successful login or token refresh
    /// </summary>
    public class AuthResponseDto
    {
        public required string AccessToken { get; set; }
        public required string RefreshToken { get; set; }
        public DateTime ExpiresAt { get; set; }
        public int UserId { get; set; }
        public required string Email { get; set; }
        public required string Username { get; set; }
    }

    /// <summary>
    /// Forgot password request DTO
    /// </summary>
    public class ForgotPasswordDto
    {
        [Required]
        [EmailAddress]
        public required string Email { get; set; }
    }

    /// <summary>
    /// Reset password request DTO
    /// </summary>
    public class ResetPasswordDto
    {
        [Required]
        [EmailAddress]
        public required string Email { get; set; }

        [Required]
        public required string Token { get; set; }

        [Required]
        [MinLength(8)]
        public required string NewPassword { get; set; }
    }

    /// <summary>
    /// Email confirmation request DTO
    /// </summary>
    public class ConfirmEmailDto
    {
        [Required]
        [EmailAddress]
        public required string Email { get; set; }

        [Required]
        public required string Token { get; set; }
    }

    /// <summary>
    /// Demo user creation response
    /// </summary>
    public class DemoUserResponseDto
    {
        public required AuthResponseDto AuthData { get; set; }
        public required DemoRouteInfoDto DemoRoute { get; set; }
    }

    /// <summary>
    /// Demo route information
    /// </summary>
    public class DemoRouteInfoDto
    {
        public int RouteId { get; set; }
        public required string RouteName { get; set; }
        public int PlaceCount { get; set; }
        public List<string> PlaceNames { get; set; } = new();
    }
}
