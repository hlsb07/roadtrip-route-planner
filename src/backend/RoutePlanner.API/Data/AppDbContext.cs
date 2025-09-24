using Microsoft.EntityFrameworkCore;
using RoutePlanner.API.Models;

namespace RoutePlanner.API.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

        public DbSet<Place> Places { get; set; }
        public DbSet<Models.Route> Routes { get; set; }
        public DbSet<RoutePlace> RoutePlaces { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            // RoutePlace Konfiguration
            modelBuilder.Entity<RoutePlace>()
                .HasKey(rp => rp.Id);

            modelBuilder.Entity<RoutePlace>()
                .HasOne(rp => rp.Route)
                .WithMany(r => r.Places)
                .HasForeignKey(rp => rp.RouteId);

            modelBuilder.Entity<RoutePlace>()
                .HasOne(rp => rp.Place)
                .WithMany()
                .HasForeignKey(rp => rp.PlaceId);

            // Seed Data (zum Testen)
            modelBuilder.Entity<Place>().HasData(
                new Place { Id = 1, Name = "Christchurch", Latitude = -43.5321, Longitude = 172.6362 },
                new Place { Id = 2, Name = "Wellington", Latitude = -41.2865, Longitude = 174.7762 },
                new Place { Id = 3, Name = "Auckland", Latitude = -36.8485, Longitude = 174.7633 }
            );
        }
    }
}