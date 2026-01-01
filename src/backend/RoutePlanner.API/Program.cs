using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using RoutePlanner.API.Data;
using RoutePlanner.API.Models;
using RoutePlanner.API.Services;

var builder = WebApplication.CreateBuilder(args);

// Services hinzufügen
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// JWT Settings
var jwtSettings = builder.Configuration.GetSection("JwtSettings").Get<JwtSettings>()
    ?? throw new InvalidOperationException("JwtSettings not configured");
builder.Services.AddSingleton(jwtSettings);

// SMTP Settings
var smtpSettings = builder.Configuration.GetSection("SmtpSettings").Get<SmtpSettings>()
    ?? throw new InvalidOperationException("SmtpSettings not configured");
builder.Services.AddSingleton(smtpSettings);

// HttpClient for Google Maps API
builder.Services.AddHttpClient<GoogleMapsService>();

// Google Maps Service
builder.Services.AddScoped<GoogleMapsService>();

// Place Service
builder.Services.AddScoped<IPlaceService, PlaceService>();

// Schedule, Leg, and Conflict Services
builder.Services.AddScoped<IRouteScheduleService, RouteScheduleService>();
builder.Services.AddScoped<IRouteLegService, RouteLegService>();
builder.Services.AddScoped<IRouteConflictService, RouteConflictService>();

// HttpClient and Service for Park4Night Scraper
builder.Services.AddHttpClient<Park4NightScraperService>();
builder.Services.AddScoped<Park4NightScraperService>();

// OSRM Routing Client
builder.Services.AddHttpClient<IOsrmClient, OsrmClient>();

// PostgreSQL Database mit PostGIS
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(
        builder.Configuration.GetConnectionString("DefaultConnection"),
        x => x.UseNetTopologySuite() // Für PostGIS Support
    ));

// Identity Configuration
builder.Services.AddIdentity<ApplicationUser, IdentityRole<int>>(options =>
{
    // Password settings
    options.Password.RequireDigit = true;
    options.Password.RequireLowercase = true;
    options.Password.RequireUppercase = true;
    options.Password.RequireNonAlphanumeric = true;
    options.Password.RequiredLength = 8;

    // Lockout settings
    options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
    options.Lockout.MaxFailedAccessAttempts = 5;
    options.Lockout.AllowedForNewUsers = true;

    // User settings
    options.User.RequireUniqueEmail = true;
    options.SignIn.RequireConfirmedEmail = true; // CRITICAL: Email confirmation required
})
.AddEntityFrameworkStores<AppDbContext>()
.AddDefaultTokenProviders();

// JWT Authentication
var key = Encoding.ASCII.GetBytes(jwtSettings.Secret);
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.RequireHttpsMetadata = false; // Set to true in production
    options.SaveToken = true;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(key),
        ValidateIssuer = true,
        ValidIssuer = jwtSettings.Issuer,
        ValidateAudience = true,
        ValidAudience = jwtSettings.Audience,
        ValidateLifetime = true,
        ClockSkew = TimeSpan.Zero // No tolerance for expiration
    };
});

// Email Service
builder.Services.AddScoped<IEmailService, SmtpEmailService>();

// Auth Service (JWT token generation)
builder.Services.AddScoped<IAuthService, AuthService>();

// CORS für Frontend
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

var app = builder.Build();

// Configure Pipeline
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();
app.UseStaticFiles(); // Serve static files from wwwroot (for campsite images)
//app.UseHttpsRedirection(); // Enable in production

app.UseAuthentication(); // CRITICAL: Must come before UseAuthorization
app.UseAuthorization();

app.MapControllers();

// Database automatisch migrieren (nur in Development)
if (app.Environment.IsDevelopment())
{
using (var scope = app.Services.CreateScope())
{
    var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        try
        {
            context.Database.Migrate(); // Führt automatisch alle Migrationen aus
        }
        catch (Exception ex)
        {
            var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
            logger.LogError(ex, "An error occurred while migrating the database.");
        }
    }
}

app.Run();