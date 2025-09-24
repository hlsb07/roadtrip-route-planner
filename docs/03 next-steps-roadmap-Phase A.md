# 🛤️ Phase A: Routes Controller - Schritt für Schritt

## 🎯 **Was wir bauen:**
- Mehrere Routen erstellen ("Deutschland Tour", "Island Trip")
- Orte zu Routen hinzufügen/entfernen
- Routen umbenennen und löschen
- Frontend kann echte Routen verwalten

---

## 📋 **Schritt 1: Route DTOs erweitern (5 min)**

### **DTOs/RouteDto.cs erstellen/erweitern:**

```csharp
namespace RoutePlanner.API.DTOs
{
    // Für API Responses
    public class RouteDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? Description { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        public List<PlaceDto> Places { get; set; } = new();
        public int PlaceCount { get; set; }
        public double EstimatedDistance { get; set; } // km
    }

    // Für Route erstellen
    public class CreateRouteDto
    {
        public string Name { get; set; } = string.Empty;
        public string? Description { get; set; }
    }

    // Für Route aktualisieren
    public class UpdateRouteDto
    {
        public string Name { get; set; } = string.Empty;
        public string? Description { get; set; }
    }

    // Für Ort zu Route hinzufügen
    public class AddPlaceToRouteDto
    {
        public int PlaceId { get; set; }
        public int? OrderIndex { get; set; }
    }

    // Simple Route Info für Listen
    public class RouteListDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public int PlaceCount { get; set; }
        public DateTime CreatedAt { get; set; }
    }
}
```

---

## 🗂️ **Schritt 2: Routes Controller erstellen (15 min)**

### **Controllers/RoutesController.cs:**

```csharp
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RoutePlanner.API.Data;
using RoutePlanner.API.DTOs;
using RoutePlanner.API.Models;

namespace RoutePlanner.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class RoutesController : ControllerBase
    {
        private readonly AppDbContext _context;

        public RoutesController(AppDbContext context)
        {
            _context = context;
        }

        // GET: api/routes - Alle Routen anzeigen
        [HttpGet]
        public async Task<ActionResult<List<RouteListDto>>> GetRoutes()
        {
            var routes = await _context.Routes
                .Include(r => r.RoutePlaces)
                .Select(r => new RouteListDto
                {
                    Id = r.Id,
                    Name = r.Name,
                    PlaceCount = r.RoutePlaces.Count,
                    CreatedAt = r.CreatedAt
                })
                .OrderByDescending(r => r.CreatedAt)
                .ToListAsync();

            return Ok(routes);
        }

        // GET: api/routes/{id} - Spezifische Route mit allen Orten
        [HttpGet("{id}")]
        public async Task<ActionResult<RouteDto>> GetRoute(int id)
        {
            var route = await _context.Routes
                .Include(r => r.RoutePlaces)
                    .ThenInclude(rp => rp.Place)
                .FirstOrDefaultAsync(r => r.Id == id);

            if (route == null)
                return NotFound($"Route with ID {id} not found");

            var routeDto = new RouteDto
            {
                Id = route.Id,
                Name = route.Name,
                Description = route.Description,
                CreatedAt = route.CreatedAt,
                UpdatedAt = route.UpdatedAt,
                PlaceCount = route.RoutePlaces.Count,
                Places = route.RoutePlaces
                    .OrderBy(rp => rp.OrderIndex)
                    .Select(rp => new PlaceDto
                    {
                        Id = rp.Place.Id,
                        Name = rp.Place.Name,
                        Latitude = rp.Place.Latitude,
                        Longitude = rp.Place.Longitude
                    })
                    .ToList()
            };

            return Ok(routeDto);
        }

        // POST: api/routes - Neue Route erstellen
        [HttpPost]
        public async Task<ActionResult<RouteDto>> CreateRoute(CreateRouteDto createDto)
        {
            var route = new Models.Route
            {
                Name = createDto.Name,
                Description = createDto.Description,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            _context.Routes.Add(route);
            await _context.SaveChangesAsync();

            var routeDto = new RouteDto
            {
                Id = route.Id,
                Name = route.Name,
                Description = route.Description,
                CreatedAt = route.CreatedAt,
                UpdatedAt = route.UpdatedAt,
                Places = new List<PlaceDto>(),
                PlaceCount = 0
            };

            return CreatedAtAction(nameof(GetRoute), new { id = route.Id }, routeDto);
        }

        // PUT: api/routes/{id} - Route aktualisieren
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateRoute(int id, UpdateRouteDto updateDto)
        {
            var route = await _context.Routes.FindAsync(id);
            if (route == null)
                return NotFound();

            route.Name = updateDto.Name;
            route.Description = updateDto.Description;
            route.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();

            return NoContent();
        }

        // DELETE: api/routes/{id} - Route löschen
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteRoute(int id)
        {
            var route = await _context.Routes
                .Include(r => r.RoutePlaces)
                .FirstOrDefaultAsync(r => r.Id == id);

            if (route == null)
                return NotFound();

            _context.Routes.Remove(route);
            await _context.SaveChangesAsync();

            return NoContent();
        }

        // POST: api/routes/{id}/places - Ort zu Route hinzufügen
        [HttpPost("{id}/places")]
        public async Task<IActionResult> AddPlaceToRoute(int id, AddPlaceToRouteDto addDto)
        {
            var route = await _context.Routes
                .Include(r => r.RoutePlaces)
                .FirstOrDefaultAsync(r => r.Id == id);

            if (route == null)
                return NotFound("Route not found");

            var place = await _context.Places.FindAsync(addDto.PlaceId);
            if (place == null)
                return NotFound("Place not found");

            // Prüfen ob Ort bereits in Route
            if (route.RoutePlaces.Any(rp => rp.PlaceId == addDto.PlaceId))
                return BadRequest("Place already in route");

            // OrderIndex bestimmen
            var orderIndex = addDto.OrderIndex ?? route.RoutePlaces.Count;

            var routePlace = new RoutePlace
            {
                RouteId = id,
                PlaceId = addDto.PlaceId,
                OrderIndex = orderIndex
            };

            _context.RoutePlaces.Add(routePlace);
            route.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            return Ok(new { message = "Place added to route successfully" });
        }

        // DELETE: api/routes/{id}/places/{placeId} - Ort aus Route entfernen
        [HttpDelete("{id}/places/{placeId}")]
        public async Task<IActionResult> RemovePlaceFromRoute(int id, int placeId)
        {
            var routePlace = await _context.RoutePlaces
                .FirstOrDefaultAsync(rp => rp.RouteId == id && rp.PlaceId == placeId);

            if (routePlace == null)
                return NotFound("Place not found in route");

            _context.RoutePlaces.Remove(routePlace);

            // UpdatedAt der Route aktualisieren
            var route = await _context.Routes.FindAsync(id);
            if (route != null)
            {
                route.UpdatedAt = DateTime.UtcNow;
            }

            await _context.SaveChangesAsync();

            return NoContent();
        }

        // PUT: api/routes/{id}/places/reorder - Reihenfolge der Orte ändern
        [HttpPut("{id}/places/reorder")]
        public async Task<IActionResult> ReorderPlaces(int id, List<int> placeIds)
        {
            var route = await _context.Routes
                .Include(r => r.RoutePlaces)
                .FirstOrDefaultAsync(r => r.Id == id);

            if (route == null)
                return NotFound();

            // Neue Reihenfolge setzen
            for (int i = 0; i < placeIds.Count; i++)
            {
                var routePlace = route.RoutePlaces.FirstOrDefault(rp => rp.PlaceId == placeIds[i]);
                if (routePlace != null)
                {
                    routePlace.OrderIndex = i;
                }
            }

            route.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            return NoContent();
        }
    }
}
```

---

## 🔧 **Schritt 3: AppDbContext erweitern (2 min)**

### **Data/AppDbContext.cs - RoutePlaces Beziehung konfigurieren:**

```csharp
protected override void OnModelCreating(ModelBuilder modelBuilder)
{
    // RoutePlace Konfiguration
    modelBuilder.Entity<RoutePlace>()
        .HasKey(rp => rp.Id);

    modelBuilder.Entity<RoutePlace>()
        .HasOne(rp => rp.Route)
        .WithMany(r => r.RoutePlaces)  // ⚠️ Wichtig: RoutePlaces statt Places
        .HasForeignKey(rp => rp.RouteId)
        .OnDelete(DeleteBehavior.Cascade);

    modelBuilder.Entity<RoutePlace>()
        .HasOne(rp => rp.Place)
        .WithMany()
        .HasForeignKey(rp => rp.PlaceId);

    // Index für bessere Performance
    modelBuilder.Entity<RoutePlace>()
        .HasIndex(rp => new { rp.RouteId, rp.OrderIndex });

    // Seed Data erweitern
    modelBuilder.Entity<Place>().HasData(
        new Place { Id = 1, Name = "Christchurch", Latitude = -43.5321, Longitude = 172.6362 },
        new Place { Id = 2, Name = "Wellington", Latitude = -41.2865, Longitude = 174.7762 },
        new Place { Id = 3, Name = "Auckland", Latitude = -36.8485, Longitude = 174.7633 }
    );

    // Beispiel-Route hinzufügen
    modelBuilder.Entity<Models.Route>().HasData(
        new Models.Route { Id = 1, Name = "New Zealand Highlights", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow }
    );

    modelBuilder.Entity<RoutePlace>().HasData(
        new RoutePlace { Id = 1, RouteId = 1, PlaceId = 1, OrderIndex = 0 },
        new RoutePlace { Id = 2, RouteId = 1, PlaceId = 2, OrderIndex = 1 },
        new RoutePlace { Id = 3, RouteId = 1, PlaceId = 3, OrderIndex = 2 }
    );
}
```

---

## ✅ **Schritt 4: Testen (5 min)**

### **API starten:**
```bash
dotnet run
```

### **Swagger UI testen:**
Gehe zu `http://localhost:5166/swagger` und teste:

1. **GET /api/routes** → Sollte eine Route anzeigen
2. **POST /api/routes** → Neue Route erstellen
3. **GET /api/routes/1** → Route mit Orten anzeigen
4. **POST /api/routes/1/places** → Ort zu Route hinzufügen

---

## 🎯 **Was du jetzt hast:**

✅ **Mehrere Routen** erstellen und verwalten  
✅ **Orte zu Routen** hinzufügen/entfernen  
✅ **Reihenfolge** der Orte ändern  
✅ **Entity Framework Relations** in Aktion  
✅ **Professionelle API-Struktur**  

## 🚀 **Nächster Schritt:**

Soll ich dir zeigen, wie du das **Frontend** anpasst, um mit den neuen Routes zu arbeiten?

Oder willst du erstmal die **API in Swagger testen**?
