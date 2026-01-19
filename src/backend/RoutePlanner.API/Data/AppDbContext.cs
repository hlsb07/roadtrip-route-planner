using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using RoutePlanner.API.Models;
using NetTopologySuite.Geometries;

namespace RoutePlanner.API.Data
{
    public class AppDbContext : IdentityDbContext<ApplicationUser, IdentityRole<int>, int>
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

        // Core Entities
        public DbSet<RefreshToken> RefreshTokens { get; set; }
        public DbSet<Place> Places { get; set; }
        public DbSet<Models.Route> Routes { get; set; }
        public DbSet<RoutePlace> RoutePlaces { get; set; }
        public DbSet<RouteLeg> RouteLegs { get; set; }

        // Google Maps Integration
        public DbSet<GooglePlaceData> GooglePlaceData { get; set; }
        public DbSet<PlacePhoto> PlacePhotos { get; set; }
        public DbSet<GoogleMapsCache> GoogleMapsCache { get; set; }

        // Other Entities
        public DbSet<Campsite> Campsites { get; set; }
        public DbSet<Category> Categories { get; set; }
        public DbSet<PlaceCategory> PlaceCategories { get; set; }
        public DbSet<Country> Countries { get; set; }
        public DbSet<PlaceCountry> PlaceCountries { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder); // CRITICAL: Call Identity's OnModelCreating first

            // ===== ApplicationUser Configuration =====
            modelBuilder.Entity<ApplicationUser>(entity =>
            {
                entity.ToTable("Users"); // Use existing table name
                entity.Property(e => e.Username).HasMaxLength(100);
                entity.Property(e => e.CreatedAt).IsRequired();
                entity.Property(e => e.UpdatedAt).IsRequired();
            });

            // ===== RefreshToken Configuration =====
            modelBuilder.Entity<RefreshToken>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Token).HasMaxLength(200).IsRequired();
                entity.Property(e => e.JwtId).HasMaxLength(200).IsRequired();
                entity.Property(e => e.CreatedAt).IsRequired();
                entity.Property(e => e.ExpiresAt).IsRequired();

                // Unique index on Token for security
                entity.HasIndex(e => e.Token).IsUnique();
                entity.HasIndex(e => e.JwtId);
                entity.HasIndex(e => e.UserId);
                entity.HasIndex(e => e.ExpiresAt);

                // Relationship to ApplicationUser
                entity.HasOne(e => e.User)
                      .WithMany(u => u.RefreshTokens)
                      .HasForeignKey(e => e.UserId)
                      .OnDelete(DeleteBehavior.Cascade);
            });

            // ===== GooglePlaceData Configuration =====
            modelBuilder.Entity<GooglePlaceData>(entity =>
            {
                // GooglePlaceId is the primary key (string from Google)
                entity.HasKey(e => e.GooglePlaceId);
                entity.Property(e => e.GooglePlaceId).HasMaxLength(1000).IsRequired(); // Increased from 500 to handle long IDs

                entity.Property(e => e.Name).HasMaxLength(1000).IsRequired(); // Increased from 500 for long place names
                entity.Property(e => e.FormattedAddress).HasMaxLength(1000);
                entity.Property(e => e.Types).HasColumnType("text"); // JSON
                entity.Property(e => e.OpeningHours).HasColumnType("text"); // JSON
                entity.Property(e => e.BusinessStatus).HasMaxLength(50);
                entity.Property(e => e.Website).HasMaxLength(1000); // Increased from 500 for long URLs
                entity.Property(e => e.PhoneNumber).HasMaxLength(50);

                // PostGIS Point for location
                entity.Property(e => e.Location)
                      .HasColumnType("geometry (point, 4326)")
                      .IsRequired();

                // Indexes for performance
                entity.HasIndex(e => e.Name);
                entity.HasIndex(e => e.Location).HasMethod("gist");
                entity.HasIndex(e => e.LastSyncedAt);
            });

            // ===== PlacePhoto Configuration =====
            modelBuilder.Entity<PlacePhoto>(entity =>
            {
                entity.HasKey(e => e.Id);

                // Relationship to GooglePlaceData (shared photos)
                entity.HasOne(e => e.GooglePlace)
                      .WithMany(g => g.Photos)
                      .HasForeignKey(e => e.GooglePlaceId)
                      .OnDelete(DeleteBehavior.Cascade);

                entity.Property(e => e.PhotoReference).HasMaxLength(1000); // Increased from 500 for long references
                entity.Property(e => e.PhotoUrl).HasMaxLength(2000).IsRequired(); // Increased from 1000 for long URLs
                entity.Property(e => e.Source).HasMaxLength(50).IsRequired().HasDefaultValue("google");

                // Indexes
                entity.HasIndex(e => e.GooglePlaceId);
                entity.HasIndex(e => new { e.GooglePlaceId, e.IsPrimary })
                      .HasFilter("\"IsPrimary\" = true"); // Only one primary photo per place
            });

            // ===== Place Configuration =====
            modelBuilder.Entity<Place>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Name).HasMaxLength(200).IsRequired();
                entity.Property(e => e.Notes).HasMaxLength(5000); // User notes can be longer
                entity.Property(e => e.GooglePlaceId).HasMaxLength(1000); // Increased from 500 to match GooglePlaceData

                // GEOMETRY statt geography für einfachere Koordinaten-Zugriffe
                entity.Property(e => e.Location)
                      .HasColumnType("geometry (point, 4326)")
                      .IsRequired();

                // Relationship to User
                entity.HasOne(e => e.User)
                      .WithMany(u => u.Places)
                      .HasForeignKey(e => e.UserId)
                      .OnDelete(DeleteBehavior.Cascade);

                // Relationship to GooglePlaceData (optional)
                entity.HasOne(e => e.GoogleData)
                      .WithMany(g => g.Places)
                      .HasForeignKey(e => e.GooglePlaceId)
                      .OnDelete(DeleteBehavior.SetNull); // If Google data deleted, just remove link

                // Räumlicher Index für Performance
                entity.HasIndex(e => e.Location).HasMethod("gist");
                entity.HasIndex(e => e.UserId);
                entity.HasIndex(e => e.GooglePlaceId);
                entity.HasIndex(e => new { e.UserId, e.GooglePlaceId }); // Prevent user duplicates
            });

            // ===== Route Configuration =====
            modelBuilder.Entity<Models.Route>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Name).HasMaxLength(200).IsRequired();
                entity.Property(e => e.Description).HasMaxLength(1000);

                // Schedule Settings
                entity.Property(e => e.TimeZoneId).HasMaxLength(100).IsRequired();
                entity.Property(e => e.StartDateTime).HasColumnType("timestamptz");
                entity.Property(e => e.EndDateTime).HasColumnType("timestamptz");
                entity.Property(e => e.DefaultArrivalTime).HasColumnType("time without time zone");
                entity.Property(e => e.DefaultDepartureTime).HasColumnType("time without time zone");

                entity.Property(e => e.CreatedAt).IsRequired();
                entity.Property(e => e.UpdatedAt).IsRequired();

                // Relationship to User
                entity.HasOne(e => e.User)
                      .WithMany(u => u.Routes)
                      .HasForeignKey(e => e.UserId)
                      .OnDelete(DeleteBehavior.Cascade);

                // Index for user queries
                entity.HasIndex(e => e.UserId);
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

                // Schedule Properties
                entity.Property(rp => rp.StopType).IsRequired().HasDefaultValue(StopType.Overnight);
                entity.Property(rp => rp.TimeZoneId).HasMaxLength(100);
                entity.Property(rp => rp.PlannedStart).HasColumnType("timestamptz");
                entity.Property(rp => rp.PlannedEnd).HasColumnType("timestamptz");
                entity.Property(rp => rp.IsStartLocked).HasDefaultValue(false);
                entity.Property(rp => rp.IsEndLocked).HasDefaultValue(false);

                // Index für Performance
                entity.HasIndex(rp => new { rp.RouteId, rp.OrderIndex })
                      .IsUnique(); // Ein Ort kann nur einmal pro Position in einer Route sein

                // Indexes for schedule queries
                entity.HasIndex(rp => rp.PlannedStart);
                entity.HasIndex(rp => rp.PlannedEnd);

                entity.Property(rp => rp.OrderIndex).IsRequired();
            });

            // ===== RouteLeg Configuration =====
            modelBuilder.Entity<RouteLeg>(entity =>
            {
                entity.HasKey(e => e.Id);

                entity.Property(e => e.Provider).HasMaxLength(50).IsRequired();

                // Configure Geometry column for OSRM road-following route
                entity.Property(e => e.Geometry)
                      .HasColumnType("geometry (linestring, 4326)");

                // Spatial index on Geometry for performance
                entity.HasIndex(e => e.Geometry).HasMethod("gist");

                // Unique index on (RouteId, OrderIndex)
                entity.HasIndex(e => new { e.RouteId, e.OrderIndex }).IsUnique();

                // Relationship to Route (cascade delete)
                entity.HasOne(e => e.Route)
                      .WithMany(r => r.Legs)
                      .HasForeignKey(e => e.RouteId)
                      .OnDelete(DeleteBehavior.Cascade);

                // Relationships to RoutePlace (restrict - manual cleanup on reorder)
                entity.HasOne(e => e.FromRoutePlace)
                      .WithMany()
                      .HasForeignKey(e => e.FromRoutePlaceId)
                      .OnDelete(DeleteBehavior.Restrict);

                entity.HasOne(e => e.ToRoutePlace)
                      .WithMany()
                      .HasForeignKey(e => e.ToRoutePlaceId)
                      .OnDelete(DeleteBehavior.Restrict);
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

                // Source enum - stored as integer
                entity.Property(e => e.Source)
                      .HasConversion<int>()
                      .HasDefaultValue(CampsiteSource.Park4Night);

                // Park4NightId is now nullable (only set for Park4Night sources)
                entity.Property(e => e.Park4NightId).HasMaxLength(50);

                // CamperMateId for CamperMate sources
                entity.Property(e => e.CamperMateId).HasMaxLength(50);

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
                // Filtered unique index for Park4NightId (only where not null)
                entity.HasIndex(e => e.Park4NightId)
                      .IsUnique()
                      .HasFilter("\"Park4NightId\" IS NOT NULL");

                // Filtered unique index for CamperMateId (only where not null)
                entity.HasIndex(e => e.CamperMateId)
                      .IsUnique()
                      .HasFilter("\"CamperMateId\" IS NOT NULL");

                entity.HasIndex(e => e.SourceUrl).IsUnique();
                entity.HasIndex(e => e.Source); // Index for filtering by source
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

            // Seed Default User (for existing data and testing)
            // Note: This will be migrated to ApplicationUser with Identity fields
            modelBuilder.Entity<ApplicationUser>().HasData(
                new ApplicationUser
                {
                    Id = 1,
                    Username = "default",
                    UserName = "default",
                    NormalizedUserName = "DEFAULT",
                    Email = "default@roadtrip.local",
                    NormalizedEmail = "DEFAULT@ROADTRIP.LOCAL",
                    EmailConfirmed = true, // Pre-confirmed for backward compatibility
                    PasswordHash = "AQAAAAIAAYagAAAAEGZvb3RvdXJpc3RzZWVkZGF0YQ==", // Placeholder - will need proper password
                    SecurityStamp = "8f8c6a62-5b4d-4f8e-9c3a-1d7e4b2f9a8c", // Static GUID for seed data
                    ConcurrencyStamp = "7a9b5c81-4e3f-2d1a-8c6b-9e4f3a2d1c8b", // Static GUID for seed data
                    CreatedAt = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc),
                    UpdatedAt = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc)
                }
            );

            // Seed Places mit PostGIS Points (with UserId)
            modelBuilder.Entity<Place>().HasData(
                new
                {
                    Id = 1,
                    UserId = 1,
                    Name = "Christchurch",
                    Location = geometryFactory.CreatePoint(new Coordinate(172.6362, -43.5321)),
                    CreatedAt = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc),
                    UpdatedAt = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc)
                },
                new
                {
                    Id = 2,
                    UserId = 1,
                    Name = "Wellington",
                    Location = geometryFactory.CreatePoint(new Coordinate(174.7762, -41.2865)),
                    CreatedAt = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc),
                    UpdatedAt = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc)
                },
                new
                {
                    Id = 3,
                    UserId = 1,
                    Name = "Auckland",
                    Location = geometryFactory.CreatePoint(new Coordinate(174.7633, -36.8485)),
                    CreatedAt = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc),
                    UpdatedAt = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc)
                }
            );

            // Seed Route (with UserId)
            modelBuilder.Entity<Models.Route>().HasData(
                new Models.Route
                {
                    Id = 1,
                    UserId = 1,
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