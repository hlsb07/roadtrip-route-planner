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
        public DbSet<Category> Categories { get; set; }
        public DbSet<PlaceCategory> PlaceCategories { get; set; }
        public DbSet<Country> Countries { get; set; }
        public DbSet<PlaceCountry> PlaceCountries { get; set; }

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

            // Category Konfiguration
            modelBuilder.Entity<Category>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Name).HasMaxLength(200).IsRequired();
                entity.Property(e => e.Icon).HasMaxLength(50);
                entity.Property(e => e.Description).HasMaxLength(1000);

                // Index for performance
                entity.HasIndex(e => e.Name);
            });

            // PlaceCategory Konfiguration (Many-to-Many Junction Table)
            modelBuilder.Entity<PlaceCategory>(entity =>
            {
                // Composite primary key
                entity.HasKey(pc => new { pc.PlaceId, pc.CategoryId });

                // Relationship to Place
                entity.HasOne(pc => pc.Place)
                      .WithMany(p => p.PlaceCategories)
                      .HasForeignKey(pc => pc.PlaceId)
                      .OnDelete(DeleteBehavior.Cascade);

                // Relationship to Category
                entity.HasOne(pc => pc.Category)
                      .WithMany(c => c.PlaceCategories)
                      .HasForeignKey(pc => pc.CategoryId)
                      .OnDelete(DeleteBehavior.Cascade);

                // Indexes for performance
                entity.HasIndex(pc => pc.PlaceId);
                entity.HasIndex(pc => pc.CategoryId);
            });

            // Country Konfiguration
            modelBuilder.Entity<Country>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Name).HasMaxLength(200).IsRequired();
                entity.Property(e => e.Code).HasMaxLength(2);
                entity.Property(e => e.Icon).HasMaxLength(10);
                entity.Property(e => e.Description).HasMaxLength(1000);

                // Indexes for performance
                entity.HasIndex(e => e.Name);
                entity.HasIndex(e => e.Code);
            });

            // PlaceCountry Konfiguration (Many-to-Many Junction Table)
            modelBuilder.Entity<PlaceCountry>(entity =>
            {
                // Composite primary key
                entity.HasKey(pc => new { pc.PlaceId, pc.CountryId });

                // Relationship to Place
                entity.HasOne(pc => pc.Place)
                      .WithMany(p => p.PlaceCountries)
                      .HasForeignKey(pc => pc.PlaceId)
                      .OnDelete(DeleteBehavior.Cascade);

                // Relationship to Country
                entity.HasOne(pc => pc.Country)
                      .WithMany(c => c.PlaceCountries)
                      .HasForeignKey(pc => pc.CountryId)
                      .OnDelete(DeleteBehavior.Cascade);

                // Indexes for performance
                entity.HasIndex(pc => pc.PlaceId);
                entity.HasIndex(pc => pc.CountryId);
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

            // Seed Categories
            modelBuilder.Entity<Category>().HasData(
                new Category
                {
                    Id = 1,
                    Name = "Beach",
                    Icon = "🏖️",
                    Description = "Beautiful beaches and coastal areas"
                },
                new Category
                {
                    Id = 2,
                    Name = "Mountain",
                    Icon = "🏔️",
                    Description = "Mountain ranges and hiking areas"
                },
                new Category
                {
                    Id = 3,
                    Name = "Restaurant",
                    Icon = "🍴",
                    Description = "Restaurants and dining locations"
                },
                new Category
                {
                    Id = 4,
                    Name = "Museum",
                    Icon = "🏛️",
                    Description = "Museums and cultural sites"
                },
                new Category
                {
                    Id = 5,
                    Name = "Park",
                    Icon = "🌳",
                    Description = "Parks and natural areas"
                },
                new Category
                {
                    Id = 6,
                    Name = "Shopping",
                    Icon = "🛍️",
                    Description = "Shopping centers and markets"
                },
                new Category
                {
                    Id = 7,
                    Name = "Adventure",
                    Icon = "🎢",
                    Description = "Adventure and outdoor activities"
                },
                new Category
                {
                    Id = 8,
                    Name = "Historic",
                    Icon = "🏰",
                    Description = "Historic sites and landmarks"
                }
            );

            // Seed Countries
            modelBuilder.Entity<Country>().HasData(
                new Country
                {
                    Id = 1,
                    Name = "New Zealand",
                    Code = "NZ",
                    Icon = "🇳🇿",
                    Description = "Island country in the southwestern Pacific Ocean"
                },
                new Country
                {
                    Id = 2,
                    Name = "Australia",
                    Code = "AU",
                    Icon = "🇦🇺",
                    Description = "Country and continent in Oceania"
                },
                new Country
                {
                    Id = 3,
                    Name = "United States",
                    Code = "US",
                    Icon = "🇺🇸",
                    Description = "Federal republic in North America"
                },
                new Country
                {
                    Id = 4,
                    Name = "Germany",
                    Code = "DE",
                    Icon = "🇩🇪",
                    Description = "Federal republic in Central Europe"
                },
                new Country
                {
                    Id = 5,
                    Name = "France",
                    Code = "FR",
                    Icon = "🇫🇷",
                    Description = "Republic in Western Europe"
                },
                new Country
                {
                    Id = 6,
                    Name = "Italy",
                    Code = "IT",
                    Icon = "🇮🇹",
                    Description = "Republic in Southern Europe"
                },
                new Country
                {
                    Id = 7,
                    Name = "Spain",
                    Code = "ES",
                    Icon = "🇪🇸",
                    Description = "Kingdom in Southwestern Europe"
                },
                new Country
                {
                    Id = 8,
                    Name = "United Kingdom",
                    Code = "GB",
                    Icon = "🇬🇧",
                    Description = "Island nation in Northwestern Europe"
                },
                new Country
                {
                    Id = 9,
                    Name = "Canada",
                    Code = "CA",
                    Icon = "🇨🇦",
                    Description = "Country in North America"
                },
                new Country
                {
                    Id = 10,
                    Name = "Japan",
                    Code = "JP",
                    Icon = "🇯🇵",
                    Description = "Island nation in East Asia"
                }
            );
        }
    }
}