using RoutePlanner.API.DTOs;

namespace RoutePlanner.API.Services
{
    /// <summary>
    /// Authentication service interface
    /// Handles login, token refresh, password reset
    /// </summary>
    public interface IAuthService
    {
        /// <summary>
        /// Authenticate user and generate JWT tokens
        /// </summary>
        Task<AuthResponseDto> LoginAsync(LoginDto loginDto);

        /// <summary>
        /// Refresh access token using refresh token (token rotation)
        /// </summary>
        Task<AuthResponseDto> RefreshTokenAsync(RefreshTokenDto refreshDto);

        /// <summary>
        /// Revoke refresh token (logout)
        /// </summary>
        Task<bool> RevokeTokenAsync(string refreshToken);

        /// <summary>
        /// Send password reset email
        /// </summary>
        Task<bool> SendPasswordResetEmailAsync(string email, string resetUrl);

        /// <summary>
        /// Reset password using token
        /// </summary>
        Task<bool> ResetPasswordAsync(ResetPasswordDto resetDto);
    }
}
