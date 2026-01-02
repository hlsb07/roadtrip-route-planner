using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RoutePlanner.API.Data;
using RoutePlanner.API.Models;
using System.ComponentModel.DataAnnotations;

namespace RoutePlanner.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AdminController : ControllerBase
    {
        private readonly UserManager<ApplicationUser> _userManager;
        private readonly AppDbContext _context;
        private readonly IWebHostEnvironment _env;
        private readonly ILogger<AdminController> _logger;

        public AdminController(
            UserManager<ApplicationUser> userManager,
            AppDbContext context,
            IWebHostEnvironment env,
            ILogger<AdminController> logger)
        {
            _userManager = userManager;
            _context = context;
            _env = env;
            _logger = logger;
        }

        /// <summary>
        /// Create a new user (Development only!)
        /// CRITICAL: Only accessible in Development environment
        /// </summary>
        [HttpPost("create-user")]
        [AllowAnonymous]
        public async Task<IActionResult> CreateUser([FromBody] CreateAdminUserDto dto)
        {
            // CRITICAL: Only allow in development
            if (!_env.IsDevelopment())
            {
                _logger.LogWarning("Attempted to access admin create-user endpoint in non-development environment");
                return NotFound();
            }

            var existingUser = await _userManager.FindByEmailAsync(dto.Email);
            if (existingUser != null)
            {
                return BadRequest(new { message = "User already exists" });
            }

            var user = new ApplicationUser
            {
                UserName = dto.Username,
                Email = dto.Email,
                EmailConfirmed = true, // Pre-confirm email for admin-created users
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            var result = await _userManager.CreateAsync(user, dto.Password);

            if (!result.Succeeded)
            {
                var errors = result.Errors.Select(e => e.Description);
                return BadRequest(new { message = "User creation failed", errors });
            }

            _logger.LogInformation("Admin created user {UserId} with email {Email}", user.Id, user.Email);

            return Ok(new
            {
                message = "User created successfully",
                userId = user.Id,
                email = user.Email,
                username = user.UserName
            });
        }

        /// <summary>
        /// Get all users (Development only!)
        /// </summary>
        [HttpGet("users")]
        [AllowAnonymous]
        public async Task<IActionResult> GetAllUsers()
        {
            if (!_env.IsDevelopment())
            {
                _logger.LogWarning("Attempted to access admin users endpoint in non-development environment");
                return NotFound();
            }

            var users = await _userManager.Users
                .Select(u => new
                {
                    id = u.Id,
                    username = u.UserName,
                    email = u.Email,
                    emailConfirmed = u.EmailConfirmed,
                    createdAt = u.CreatedAt,
                    updatedAt = u.UpdatedAt
                })
                .ToListAsync();

            return Ok(users);
        }

        /// <summary>
        /// Get user by ID with statistics (Development only!)
        /// </summary>
        [HttpGet("users/{userId}")]
        [AllowAnonymous]
        public async Task<IActionResult> GetUserById(int userId)
        {
            if (!_env.IsDevelopment())
            {
                _logger.LogWarning("Attempted to access admin user details endpoint in non-development environment");
                return NotFound();
            }

            var user = await _userManager.FindByIdAsync(userId.ToString());
            if (user == null)
            {
                return NotFound(new { message = "User not found" });
            }

            // Get user statistics
            var routeCount = await _context.Routes.CountAsync(r => r.UserId == userId);
            var placeCount = await _context.Places.CountAsync(p => p.UserId == userId);

            return Ok(new
            {
                id = user.Id,
                username = user.UserName,
                email = user.Email,
                emailConfirmed = user.EmailConfirmed,
                createdAt = user.CreatedAt,
                updatedAt = user.UpdatedAt,
                statistics = new
                {
                    routeCount,
                    placeCount
                }
            });
        }

        /// <summary>
        /// Delete user (Development only!)
        /// WARNING: This will NOT delete associated routes/places
        /// </summary>
        [HttpDelete("users/{userId}")]
        [AllowAnonymous]
        public async Task<IActionResult> DeleteUser(int userId)
        {
            if (!_env.IsDevelopment())
            {
                _logger.LogWarning("Attempted to access admin delete user endpoint in non-development environment");
                return NotFound();
            }

            var user = await _userManager.FindByIdAsync(userId.ToString());
            if (user == null)
            {
                return NotFound(new { message = "User not found" });
            }

            // Check if user has routes or places
            var routeCount = await _context.Routes.CountAsync(r => r.UserId == userId);
            var placeCount = await _context.Places.CountAsync(p => p.UserId == userId);

            if (routeCount > 0 || placeCount > 0)
            {
                return BadRequest(new
                {
                    message = "Cannot delete user with existing data. Please reassign or delete their routes and places first.",
                    routeCount,
                    placeCount
                });
            }

            var result = await _userManager.DeleteAsync(user);
            if (!result.Succeeded)
            {
                return BadRequest(new { message = "Failed to delete user", errors = result.Errors });
            }

            _logger.LogInformation("Admin deleted user {UserId}", userId);
            return Ok(new { message = "User deleted successfully" });
        }

        /// <summary>
        /// Migrate all data from one user to another (Development only!)
        /// This reassigns all routes and places from sourceUserId to targetUserId
        /// </summary>
        [HttpPost("migrate-user-data")]
        [AllowAnonymous]
        public async Task<IActionResult> MigrateUserData([FromBody] MigrateUserDataDto dto)
        {
            if (!_env.IsDevelopment())
            {
                _logger.LogWarning("Attempted to access admin migrate data endpoint in non-development environment");
                return NotFound();
            }

            var sourceUser = await _userManager.FindByIdAsync(dto.SourceUserId.ToString());
            if (sourceUser == null)
            {
                return NotFound(new { message = "Source user not found" });
            }

            var targetUser = await _userManager.FindByIdAsync(dto.TargetUserId.ToString());
            if (targetUser == null)
            {
                return NotFound(new { message = "Target user not found" });
            }

            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                // Migrate routes
                var routes = await _context.Routes
                    .Where(r => r.UserId == dto.SourceUserId)
                    .ToListAsync();

                foreach (var route in routes)
                {
                    route.UserId = dto.TargetUserId;
                    route.UpdatedAt = DateTime.UtcNow;
                }

                // Migrate places
                var places = await _context.Places
                    .Where(p => p.UserId == dto.SourceUserId)
                    .ToListAsync();

                foreach (var place in places)
                {
                    place.UserId = dto.TargetUserId;
                }

                await _context.SaveChangesAsync();
                await transaction.CommitAsync();

                _logger.LogInformation(
                    "Admin migrated {RouteCount} routes and {PlaceCount} places from user {SourceUserId} to user {TargetUserId}",
                    routes.Count, places.Count, dto.SourceUserId, dto.TargetUserId);

                return Ok(new
                {
                    message = "Data migrated successfully",
                    routesMigrated = routes.Count,
                    placesMigrated = places.Count,
                    sourceUser = new { id = sourceUser.Id, email = sourceUser.Email },
                    targetUser = new { id = targetUser.Id, email = targetUser.Email }
                });
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                _logger.LogError(ex, "Failed to migrate user data from {SourceUserId} to {TargetUserId}",
                    dto.SourceUserId, dto.TargetUserId);
                return StatusCode(500, new { message = "Failed to migrate data", error = ex.Message });
            }
        }
    }

    /// <summary>
    /// DTO for creating admin users
    /// </summary>
    public class CreateAdminUserDto
    {
        [Required]
        [EmailAddress]
        public required string Email { get; set; }

        [Required]
        public required string Username { get; set; }

        [Required]
        [MinLength(8)]
        public required string Password { get; set; }
    }

    /// <summary>
    /// DTO for migrating user data
    /// </summary>
    public class MigrateUserDataDto
    {
        [Required]
        public int SourceUserId { get; set; }

        [Required]
        public int TargetUserId { get; set; }
    }
}
