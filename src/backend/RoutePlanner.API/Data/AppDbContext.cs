using Microsoft.EntityFrameworkCore;
using RoutePlanner.API.Models;
using NetTopologySuite.Geometries;

namespace RoutePlanner.API.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

        public DbSet<Place> Places { get; set; }
        public DbSet<Models.Route> Routes { get; set; }
        public DbSet<RoutePlace> RoutePlaces { get; set; }
        public DbSet<GoogleMapsCache> GoogleMapsCache { get; set; }
        public DbSet<Campsite> Campsites { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // Place Konfiguration für PostGIS
            modelBuilder.Entity<Place>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Name).HasMaxLength(200).IsRequired();
                
                // GEOMETRY statt geography für einfachere Koordinaten-Zugriffe
                entity.Property(e => e.Location)
                      .HasColumnType("geometry (point, 4326)")
                      .IsRequired();
                
                // Räumlicher Index für Performance
                entity.HasIndex(e => e.Location)
                      .HasMethod("gist");
                      
                // // Ignore für Convenience Properties (werden von Location berechnet)
                // entity.Ignore(e => e.Latitude);
                // entity.Ignore(e => e.Longitude);
            });

            // Route Konfiguration
            modelBuilder.Entity<Models.Route>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Name).HasMaxLength(200).IsRequired();
                entity.Property(e => e.Description).HasMaxLength(1000);
                entity.Property(e => e.CreatedAt).IsRequired();
                entity.Property(e => e.UpdatedAt).IsRequired();
            });

            // RoutePlace Konfiguration
            modelBuilder.Entity<RoutePlace>(entity =>
            {
                entity.HasKey(rp => rp.Id);

                entity.HasOne(rp => rp.Route)
                      .WithMany(r => r.Places)
                    .HasForeignKey(rp => rp.RouteId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(rp => rp.Place)
                      .WithMany(p => p.RoutePlaces)
                      .HasForeignKey(rp => rp.PlaceId)
                      .OnDelete(DeleteBehavior.Restrict); // Verhindert Löschen von Places, die in Routes verwendet werden

                // Index für Performance
                entity.HasIndex(rp => new { rp.RouteId, rp.OrderIndex })
                      .IsUnique(); // Ein Ort kann nur einmal pro Position in einer Route sein

                entity.Property(rp => rp.OrderIndex).IsRequired();
            });

            // GoogleMapsCache Konfiguration
            modelBuilder.Entity<GoogleMapsCache>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.SearchQuery).HasMaxLength(500);
                entity.Property(e => e.GooglePlaceId).HasMaxLength(200);
                entity.Property(e => e.Name).HasMaxLength(200).IsRequired();
                entity.Property(e => e.FormattedAddress).HasMaxLength(500);
                entity.Property(e => e.ApiType).HasMaxLength(50).IsRequired();

                // PostGIS Point for location
                entity.Property(e => e.Location)
                      .HasColumnType("geometry (point, 4326)")
                      .IsRequired();

                // Indexes for performance
                entity.HasIndex(e => e.SearchQuery);
                entity.HasIndex(e => e.GooglePlaceId);
                entity.HasIndex(e => e.Name);
                entity.HasIndex(e => e.Location).HasMethod("gist");
                entity.HasIndex(e => e.ExpiresAt);

                // Default values
                entity.Property(e => e.HitCount).HasDefaultValue(0);
            });

            // Campsite Konfiguration
            modelBuilder.Entity<Campsite>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Park4NightId).HasMaxLength(50).IsRequired();
                entity.Property(e => e.Name).HasMaxLength(300).IsRequired();
                entity.Property(e => e.Price).HasMaxLength(200);
                entity.Property(e => e.SourceUrl).HasMaxLength(500).IsRequired();

                // PostGIS Point for location
                entity.Property(e => e.Location)
                      .HasColumnType("geometry (point, 4326)")
                      .IsRequired();

                // JSON columns for arrays
                entity.Property(e => e.Types).HasColumnType("text");
                entity.Property(e => e.Services).HasColumnType("text");
                entity.Property(e => e.Activities).HasColumnType("text");
                entity.Property(e => e.ImagePaths).HasColumnType("text");

                // JSONB column for multi-language descriptions
                entity.Property(e => e.Descriptions).HasColumnType("jsonb");

                // Indexes for performance and uniqueness
                entity.HasIndex(e => e.Park4NightId).IsUnique();
                entity.HasIndex(e => e.SourceUrl).IsUnique();
                entity.HasIndex(e => e.Name);
                entity.HasIndex(e => e.Location).HasMethod("gist");
                entity.HasIndex(e => e.Rating);
                entity.HasIndex(e => e.CreatedAt);

                // Default values
                entity.Property(e => e.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
                entity.Property(e => e.UpdatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            });

            // Seed Data (wird später per Migration hinzugefügt)
            SeedData(modelBuilder);
        }

        private void SeedData(ModelBuilder modelBuilder)
        {
            var geometryFactory = new GeometryFactory(new PrecisionModel(), 4326);

            // Seed Places mit PostGIS Points
            modelBuilder.Entity<Place>().HasData(
                new 
                { 
                    Id = 1, 
                    Name = "Christchurch",
                    Location = geometryFactory.CreatePoint(new Coordinate(172.6362, -43.5321))
                },
                new 
                { 
                    Id = 2, 
                    Name = "Wellington",
                    Location = geometryFactory.CreatePoint(new Coordinate(174.7762, -41.2865))
                },
                new 
                { 
                    Id = 3, 
                    Name = "Auckland",
                    Location = geometryFactory.CreatePoint(new Coordinate(174.7633, -36.8485))
                }
            );

            // Seed Route
            modelBuilder.Entity<Models.Route>().HasData(
                new Models.Route 
                { 
                    Id = 1, 
                    Name = "New Zealand Highlights", 
                    Description = "The best of New Zealand",
                    CreatedAt = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc),
                    UpdatedAt = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc)
                }
            );

            // Seed RoutePlaces
            modelBuilder.Entity<RoutePlace>().HasData(
                new RoutePlace { Id = 1, RouteId = 1, PlaceId = 1, OrderIndex = 0 },
                new RoutePlace { Id = 2, RouteId = 1, PlaceId = 2, OrderIndex = 1 },
                new RoutePlace { Id = 3, RouteId = 1, PlaceId = 3, OrderIndex = 2 }
            );
        }
    }
}