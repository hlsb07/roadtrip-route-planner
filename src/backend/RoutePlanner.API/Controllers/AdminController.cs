using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using RoutePlanner.API.Models;
using System.ComponentModel.DataAnnotations;

namespace RoutePlanner.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AdminController : ControllerBase
    {
        private readonly UserManager<ApplicationUser> _userManager;
        private readonly IWebHostEnvironment _env;
        private readonly ILogger<AdminController> _logger;

        public AdminController(
            UserManager<ApplicationUser> userManager,
            IWebHostEnvironment env,
            ILogger<AdminController> logger)
        {
            _userManager = userManager;
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
}
