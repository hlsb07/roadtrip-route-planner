using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using RoutePlanner.API.Data;
using RoutePlanner.API.DTOs;
using RoutePlanner.API.Models;

namespace RoutePlanner.API.Services
{
    /// <summary>
    /// Authentication service implementation
    /// Handles JWT token generation, refresh token rotation, password reset
    /// </summary>
    public class AuthService : IAuthService
    {
        private readonly UserManager<ApplicationUser> _userManager;
        private readonly AppDbContext _context;
        private readonly JwtSettings _jwtSettings;
        private readonly IEmailService _emailService;
        private readonly ILogger<AuthService> _logger;

        public AuthService(
            UserManager<ApplicationUser> userManager,
            AppDbContext context,
            JwtSettings jwtSettings,
            IEmailService emailService,
            ILogger<AuthService> logger)
        {
            _userManager = userManager;
            _context = context;
            _jwtSettings = jwtSettings;
            _emailService = emailService;
            _logger = logger;
        }

        public async Task<AuthResponseDto> LoginAsync(LoginDto loginDto)
        {
            var user = await _userManager.FindByEmailAsync(loginDto.Email);
            if (user == null)
            {
                _logger.LogWarning("Login attempt for non-existent email: {Email}", loginDto.Email);
                throw new UnauthorizedAccessException("Invalid email or password");
            }

            // Check email confirmation
            if (!await _userManager.IsEmailConfirmedAsync(user))
            {
                _logger.LogWarning("Login attempt for unconfirmed email: {Email}", loginDto.Email);
                throw new UnauthorizedAccessException("Email not confirmed. Please check your inbox.");
            }

            // Verify password
            if (!await _userManager.CheckPasswordAsync(user, loginDto.Password))
            {
                await _userManager.AccessFailedAsync(user); // Increment failed login count
                _logger.LogWarning("Failed login attempt for {Email}", loginDto.Email);
                throw new UnauthorizedAccessException("Invalid email or password");
            }

            // Check if account is locked out
            if (await _userManager.IsLockedOutAsync(user))
            {
                _logger.LogWarning("Login attempt for locked out account: {Email}", loginDto.Email);
                throw new UnauthorizedAccessException("Account is locked due to multiple failed login attempts. Please try again later.");
            }

            // Reset failed login count on successful login
            await _userManager.ResetAccessFailedCountAsync(user);

            // Generate tokens
            var (accessToken, jwtId) = GenerateAccessToken(user);
            var refreshToken = await GenerateRefreshTokenAsync(user.Id, jwtId);

            _logger.LogInformation("User {UserId} logged in successfully", user.Id);

            return new AuthResponseDto
            {
                AccessToken = accessToken,
                RefreshToken = refreshToken.Token,
                ExpiresAt = DateTime.UtcNow.AddMinutes(_jwtSettings.AccessTokenExpirationMinutes),
                UserId = user.Id,
                Email = user.Email!,
                Username = user.UserName!
            };
        }

        public async Task<AuthResponseDto> RefreshTokenAsync(RefreshTokenDto refreshDto)
        {
            // Validate JWT structure (without validating expiration)
            var principal = GetPrincipalFromExpiredToken(refreshDto.AccessToken);
            if (principal == null)
            {
                _logger.LogWarning("Invalid access token structure during refresh");
                throw new UnauthorizedAccessException("Invalid access token");
            }

            var jwtIdClaim = principal.Claims.FirstOrDefault(c => c.Type == JwtRegisteredClaimNames.Jti);
            if (jwtIdClaim == null)
            {
                _logger.LogWarning("Missing JTI claim in access token during refresh");
                throw new UnauthorizedAccessException("Invalid token structure");
            }

            // Find refresh token
            var storedToken = await _context.RefreshTokens
                .Include(rt => rt.User)
                .FirstOrDefaultAsync(rt => rt.Token == refreshDto.RefreshToken);

            if (storedToken == null)
            {
                _logger.LogWarning("Refresh token not found");
                throw new UnauthorizedAccessException("Invalid refresh token");
            }

            // Validate refresh token
            if (storedToken.IsUsed)
            {
                // Possible token reuse attack - revoke all user tokens
                _logger.LogWarning("Token reuse detected for user {UserId}. Revoking all sessions.", storedToken.UserId);
                await RevokeAllUserTokensAsync(storedToken.UserId);
                throw new UnauthorizedAccessException("Token already used. All sessions revoked for security.");
            }

            if (storedToken.IsRevoked)
            {
                _logger.LogWarning("Attempted use of revoked refresh token for user {UserId}", storedToken.UserId);
                throw new UnauthorizedAccessException("Token has been revoked");
            }

            if (storedToken.ExpiresAt < DateTime.UtcNow)
            {
                _logger.LogWarning("Expired refresh token used for user {UserId}", storedToken.UserId);
                throw new UnauthorizedAccessException("Refresh token expired");
            }

            if (storedToken.JwtId != jwtIdClaim.Value)
            {
                _logger.LogWarning("JWT ID mismatch for user {UserId}", storedToken.UserId);
                throw new UnauthorizedAccessException("Token mismatch");
            }

            // Mark old token as used (token rotation)
            storedToken.IsUsed = true;
            await _context.SaveChangesAsync();

            // Generate new tokens
            var user = storedToken.User;
            var (newAccessToken, newJwtId) = GenerateAccessToken(user);
            var newRefreshToken = await GenerateRefreshTokenAsync(user.Id, newJwtId);

            _logger.LogInformation("Token refreshed for user {UserId}", user.Id);

            return new AuthResponseDto
            {
                AccessToken = newAccessToken,
                RefreshToken = newRefreshToken.Token,
                ExpiresAt = DateTime.UtcNow.AddMinutes(_jwtSettings.AccessTokenExpirationMinutes),
                UserId = user.Id,
                Email = user.Email!,
                Username = user.UserName!
            };
        }

        public async Task<bool> RevokeTokenAsync(string refreshToken)
        {
            var token = await _context.RefreshTokens
                .FirstOrDefaultAsync(rt => rt.Token == refreshToken);

            if (token == null)
            {
                return false;
            }

            token.IsRevoked = true;
            await _context.SaveChangesAsync();

            _logger.LogInformation("Refresh token revoked for user {UserId}", token.UserId);
            return true;
        }

        public async Task<bool> SendPasswordResetEmailAsync(string email, string resetUrl)
        {
            var user = await _userManager.FindByEmailAsync(email);
            if (user == null)
            {
                // Don't reveal that user doesn't exist (prevent email enumeration)
                _logger.LogWarning("Password reset requested for non-existent email: {Email}", email);
                return true; // Return true to prevent email enumeration
            }

            var resetToken = await _userManager.GeneratePasswordResetTokenAsync(user);
            var encodedToken = Uri.EscapeDataString(resetToken);
            var resetLink = $"{resetUrl}?token={encodedToken}&email={Uri.EscapeDataString(email)}";

            await _emailService.SendPasswordResetAsync(email, resetLink);

            _logger.LogInformation("Password reset email sent to {Email}", email);
            return true;
        }

        public async Task<bool> ResetPasswordAsync(ResetPasswordDto resetDto)
        {
            var user = await _userManager.FindByEmailAsync(resetDto.Email);
            if (user == null)
            {
                _logger.LogWarning("Password reset attempted for non-existent email: {Email}", resetDto.Email);
                throw new InvalidOperationException("Invalid request");
            }

            var result = await _userManager.ResetPasswordAsync(user, resetDto.Token, resetDto.NewPassword);
            if (!result.Succeeded)
            {
                var errors = string.Join(", ", result.Errors.Select(e => e.Description));
                _logger.LogWarning("Password reset failed for {Email}: {Errors}", resetDto.Email, errors);
                throw new InvalidOperationException(errors);
            }

            // Revoke all refresh tokens for security
            await RevokeAllUserTokensAsync(user.Id);

            _logger.LogInformation("Password reset successfully for user {UserId}", user.Id);
            return true;
        }

        // Private Helper Methods

        private (string accessToken, string jwtId) GenerateAccessToken(ApplicationUser user)
        {
            var jwtId = Guid.NewGuid().ToString();
            var tokenHandler = new JwtSecurityTokenHandler();
            var key = Encoding.ASCII.GetBytes(_jwtSettings.Secret);

            var claims = new List<Claim>
            {
                new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
                new Claim(JwtRegisteredClaimNames.Email, user.Email!),
                new Claim(JwtRegisteredClaimNames.Jti, jwtId),
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Name, user.UserName!)
            };

            var tokenDescriptor = new SecurityTokenDescriptor
            {
                Subject = new ClaimsIdentity(claims),
                Expires = DateTime.UtcNow.AddMinutes(_jwtSettings.AccessTokenExpirationMinutes),
                Issuer = _jwtSettings.Issuer,
                Audience = _jwtSettings.Audience,
                SigningCredentials = new SigningCredentials(
                    new SymmetricSecurityKey(key),
                    SecurityAlgorithms.HmacSha256Signature)
            };

            var token = tokenHandler.CreateToken(tokenDescriptor);
            var accessToken = tokenHandler.WriteToken(token);

            return (accessToken, jwtId);
        }

        private async Task<RefreshToken> GenerateRefreshTokenAsync(int userId, string jwtId)
        {
            var refreshToken = new RefreshToken
            {
                UserId = userId,
                Token = GenerateSecureRandomToken(),
                JwtId = jwtId,
                CreatedAt = DateTime.UtcNow,
                ExpiresAt = DateTime.UtcNow.AddDays(_jwtSettings.RefreshTokenExpirationDays)
            };

            _context.RefreshTokens.Add(refreshToken);
            await _context.SaveChangesAsync();

            return refreshToken;
        }

        private string GenerateSecureRandomToken()
        {
            var randomBytes = new byte[64];
            using var rng = RandomNumberGenerator.Create();
            rng.GetBytes(randomBytes);
            return Convert.ToBase64String(randomBytes);
        }

        private ClaimsPrincipal? GetPrincipalFromExpiredToken(string token)
        {
            var tokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.ASCII.GetBytes(_jwtSettings.Secret)),
                ValidateIssuer = true,
                ValidIssuer = _jwtSettings.Issuer,
                ValidateAudience = true,
                ValidAudience = _jwtSettings.Audience,
                ValidateLifetime = false, // Don't validate expiration for refresh
                ClockSkew = TimeSpan.Zero
            };

            var tokenHandler = new JwtSecurityTokenHandler();
            try
            {
                var principal = tokenHandler.ValidateToken(token, tokenValidationParameters, out var securityToken);

                if (securityToken is not JwtSecurityToken jwtSecurityToken ||
                    !jwtSecurityToken.Header.Alg.Equals(SecurityAlgorithms.HmacSha256, StringComparison.InvariantCultureIgnoreCase))
                {
                    return null;
                }

                return principal;
            }
            catch
            {
                return null;
            }
        }

        private async Task RevokeAllUserTokensAsync(int userId)
        {
            var tokens = await _context.RefreshTokens
                .Where(rt => rt.UserId == userId && !rt.IsRevoked)
                .ToListAsync();

            foreach (var token in tokens)
            {
                token.IsRevoked = true;
            }

            await _context.SaveChangesAsync();
            _logger.LogWarning("Revoked all tokens for user {UserId}", userId);
        }
    }
}
