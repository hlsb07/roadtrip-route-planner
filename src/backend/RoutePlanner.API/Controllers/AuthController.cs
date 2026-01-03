using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using RoutePlanner.API.Data;
using RoutePlanner.API.DTOs;
using RoutePlanner.API.Models;
using RoutePlanner.API.Services;

namespace RoutePlanner.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly IAuthService _authService;
        private readonly UserManager<ApplicationUser> _userManager;
        private readonly IEmailService _emailService;
        private readonly IConfiguration _configuration;
        private readonly ILogger<AuthController> _logger;
        private readonly AppDbContext _context;
        private readonly IPlaceService _placeService;
        private readonly IRouteLegService _legService;

        public AuthController(
            IAuthService authService,
            UserManager<ApplicationUser> userManager,
            IEmailService emailService,
            IConfiguration configuration,
            ILogger<AuthController> logger,
            AppDbContext context,
            IPlaceService placeService,
            IRouteLegService legService)
        {
            _authService = authService;
            _userManager = userManager;
            _emailService = emailService;
            _configuration = configuration;
            _logger = logger;
            _context = context;
            _placeService = placeService;
            _legService = legService;
        }

        /// <summary>
        /// Login with email and password
        /// Returns JWT access token and refresh token
        /// </summary>
        [HttpPost("login")]
        [AllowAnonymous]
        public async Task<ActionResult<AuthResponseDto>> Login([FromBody] LoginDto loginDto)
        {
            try
            {
                var response = await _authService.LoginAsync(loginDto);
                return Ok(response);
            }
            catch (UnauthorizedAccessException ex)
            {
                return Unauthorized(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Login failed for {Email}", loginDto.Email);
                return BadRequest(new { message = "An error occurred during login" });
            }
        }

        /// <summary>
        /// Refresh access token using refresh token
        /// Implements token rotation for security
        /// </summary>
        [HttpPost("refresh")]
        [AllowAnonymous]
        public async Task<ActionResult<AuthResponseDto>> RefreshToken([FromBody] RefreshTokenDto refreshDto)
        {
            try
            {
                var response = await _authService.RefreshTokenAsync(refreshDto);
                return Ok(response);
            }
            catch (UnauthorizedAccessException ex)
            {
                return Unauthorized(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Token refresh failed");
                return BadRequest(new { message = "An error occurred during token refresh" });
            }
        }

        /// <summary>
        /// Logout - revoke refresh token
        /// </summary>
        [HttpPost("logout")]
        [Authorize]
        public async Task<IActionResult> Logout([FromBody] RefreshTokenDto refreshDto)
        {
            try
            {
                await _authService.RevokeTokenAsync(refreshDto.RefreshToken);
                return Ok(new { message = "Logged out successfully" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Logout failed");
                return BadRequest(new { message = "An error occurred during logout" });
            }
        }

        /// <summary>
        /// Send password reset email
        /// Always returns success to prevent email enumeration
        /// </summary>
        [HttpPost("forgot-password")]
        [AllowAnonymous]
        public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordDto forgotDto)
        {
            try
            {
                // Get frontend URL from config
                var frontendUrl = _configuration["FrontendUrl"] ?? "http://localhost:5166";
                var resetUrl = $"{frontendUrl}/reset-password.html";

                await _authService.SendPasswordResetEmailAsync(forgotDto.Email, resetUrl);

                // Always return success to prevent email enumeration
                return Ok(new { message = "If the email exists, a password reset link has been sent." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Forgot password failed");
                // Still return success to prevent email enumeration
                return Ok(new { message = "If the email exists, a password reset link has been sent." });
            }
        }

        /// <summary>
        /// Reset password using token from email
        /// </summary>
        [HttpPost("reset-password")]
        [AllowAnonymous]
        public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordDto resetDto)
        {
            try
            {
                await _authService.ResetPasswordAsync(resetDto);
                return Ok(new { message = "Password reset successfully" });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Password reset failed");
                return BadRequest(new { message = "An error occurred during password reset" });
            }
        }

        /// <summary>
        /// Confirm email using token from email
        /// </summary>
        [HttpPost("confirm-email")]
        [AllowAnonymous]
        public async Task<IActionResult> ConfirmEmail([FromBody] ConfirmEmailDto confirmDto)
        {
            try
            {
                var user = await _userManager.FindByEmailAsync(confirmDto.Email);
                if (user == null)
                {
                    return BadRequest(new { message = "Invalid confirmation request" });
                }

                var result = await _userManager.ConfirmEmailAsync(user, confirmDto.Token);
                if (!result.Succeeded)
                {
                    var errors = result.Errors.Select(e => e.Description);
                    return BadRequest(new { message = "Email confirmation failed", errors });
                }

                return Ok(new { message = "Email confirmed successfully. You can now log in." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Email confirmation failed");
                return BadRequest(new { message = "An error occurred during email confirmation" });
            }
        }

        /// <summary>
        /// Get current authenticated user information
        /// Test endpoint to verify authentication
        /// </summary>
        [HttpGet("me")]
        [Authorize]
        public async Task<ActionResult<object>> GetCurrentUser()
        {
            var userId = int.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? "0");
            var user = await _userManager.FindByIdAsync(userId.ToString());

            if (user == null)
            {
                return NotFound();
            }

            return Ok(new
            {
                id = user.Id,
                email = user.Email,
                username = user.UserName,
                emailConfirmed = user.EmailConfirmed
            });
        }

        /// <summary>
        /// Create demo user with pre-populated European road trip
        /// PUBLIC ENDPOINT - Creates unique demo user each time
        /// </summary>
        [HttpPost("demo")]
        [AllowAnonymous]
        public async Task<ActionResult<DemoUserResponseDto>> CreateDemoUser()
        {
            try
            {
                // 1. Generate unique demo credentials
                var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                var demoEmail = $"demo_{timestamp}@demo.com";
                var demoUsername = $"demo_user_{timestamp}";
                var demoPassword = "Demo123!@#"; // Meets complexity requirements

                _logger.LogInformation("Creating demo user: {Email}", demoEmail);

                // 2. Create demo user
                var user = new ApplicationUser
                {
                    UserName = demoUsername,
                    Email = demoEmail,
                    EmailConfirmed = true, // CRITICAL: Must be true to allow login
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };

                var result = await _userManager.CreateAsync(user, demoPassword);
                if (!result.Succeeded)
                {
                    var errors = result.Errors.Select(e => e.Description);
                    _logger.LogError("Demo user creation failed: {Errors}", string.Join(", ", errors));
                    return BadRequest(new { message = "Demo user creation failed", errors });
                }

                // 3. Create demo places (European road trip)
                var demoPlaces = await CreateDemoPlaces(user.Id);

                // 4. Create demo route and link places
                var demoRoute = await CreateDemoRoute(user.Id, demoPlaces);

                // 5. Generate JWT tokens
                var authResponse = await _authService.LoginAsync(new LoginDto
                {
                    Email = demoEmail,
                    Password = demoPassword
                });

                _logger.LogInformation("Demo user created successfully: {UserId}, Route: {RouteId}",
                    user.Id, demoRoute.RouteId);

                return Ok(new DemoUserResponseDto
                {
                    AuthData = authResponse,
                    DemoRoute = demoRoute
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating demo user");
                return StatusCode(500, new { message = "An error occurred creating demo user" });
            }
        }

        // Helper method to create demo places with Google Place IDs
        private async Task<List<Place>> CreateDemoPlaces(int userId)
        {
            // European landmarks with real Google Place IDs
            var demoPlaceData = new[]
            {
                new { GooglePlaceId = "ChIJG2LvQNAEdkgRY9wMq6RMBw8", Name = "Hamburg" },
                new { GooglePlaceId = "ChIJiQnyVcZRqEcRY0xnhE77uyY", Name = "Brandenburg Gate, Berlin" },
                new { GooglePlaceId = "ChIJ2V-Mo_l1nkcRfZixfUq4DAE", Name = "Munich" },
                new { GooglePlaceId = "ChIJGaK-SZcLkEcRA9wf5_GNbuY", Name = "Zurich" },
                new { GooglePlaceId = "ChIJD7fiBh9u5kcRYJSMaMOCCwQ", Name = "Paris" },
                new { GooglePlaceId = "ChIJdd4hrwug2EcRmSrV3Vo6llI", Name = "London" }
            };

            var places = new List<Place>();
            var failedPlaces = new List<string>();

            foreach (var placeData in demoPlaceData)
            {
                try
                {
                    var place = await _placeService.CreatePlaceFromGoogle(
                        placeData.GooglePlaceId,
                        userId,
                        "Demo location - part of European highlights tour");
                    places.Add(place);
                    _logger.LogInformation("Created demo place: {Name}", placeData.Name);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to create demo place from Google: {Name} ({PlaceId})", placeData.Name, placeData.GooglePlaceId);
                    failedPlaces.Add(placeData.Name);
                }
            }

            // Ensure we have at least some places created
            if (places.Count < 3)
            {
                var failedList = string.Join(", ", failedPlaces);
                throw new InvalidOperationException($"Failed to create enough demo places. Only {places.Count} of {demoPlaceData.Length} succeeded. Failed: {failedList}");
            }

            _logger.LogInformation("Successfully created {Count} demo places", places.Count);
            return places;
        }

        // Helper method to create demo route
        private async Task<DemoRouteInfoDto> CreateDemoRoute(int userId, List<Place> places)
        {
            var route = new Models.Route
            {
                UserId = userId,
                Name = "European Highlights Tour",
                Description = "A spectacular journey through Europe's most iconic landmarks - from the Eiffel Tower to the Colosseum, experience the best of European culture and history!",
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            _context.Routes.Add(route);
            await _context.SaveChangesAsync();

            // Add places to route in order
            for (int i = 0; i < places.Count; i++)
            {
                var routePlace = new RoutePlace
                {
                    RouteId = route.Id,
                    PlaceId = places[i].Id,
                    OrderIndex = i,
                    StopType = StopType.Overnight // All demo stops are overnight stays
                };
                _context.RoutePlaces.Add(routePlace);
            }

            await _context.SaveChangesAsync();

            // IMPORTANT: Recalculate route legs from OSRM to generate the timeline/distance/duration
            try
            {
                await _legService.RecalculateLegsFromOsrm(route.Id);
                _logger.LogInformation("Successfully calculated route legs for demo route {RouteId}", route.Id);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to calculate route legs for demo route {RouteId}", route.Id);
                // Don't fail the demo creation if leg calculation fails
            }

            return new DemoRouteInfoDto
            {
                RouteId = route.Id,
                RouteName = route.Name,
                PlaceCount = places.Count,
                PlaceNames = places.Select(p => p.Name).ToList()
            };
        }
    }
}
