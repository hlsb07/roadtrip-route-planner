using Microsoft.EntityFrameworkCore;
using RoutePlanner.API.Data;
using RoutePlanner.API.Services;

var builder = WebApplication.CreateBuilder(args);

// Services hinzufügen
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// HttpClient for Google Maps API
builder.Services.AddHttpClient<GoogleMapsService>();

// Google Maps Service
builder.Services.AddScoped<GoogleMapsService>();

// Place Service
builder.Services.AddScoped<IPlaceService, PlaceService>();

// Schedule and Leg Services
builder.Services.AddScoped<IRouteScheduleService, RouteScheduleService>();
builder.Services.AddScoped<IRouteLegService, RouteLegService>();

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
//app.UseHttpsRedirection();
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