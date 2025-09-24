# 🏗️ **C# ASP.NET Core Backend Konzept - NZ Route Planner**

## 📋 **1. Projekt-Architektur Überblick**

```
┌─────────────────────────────────────────────────────┐
│                  Frontend                           │
│              (HTML/CSS/JS)                          │
└─────────────────┬───────────────────────────────────┘
                  │ HTTP/REST API
┌─────────────────┴───────────────────────────────────┐
│              ASP.NET Core API                       │
│  ┌─────────────┬─────────────┬─────────────────────┐│
│  │Controllers  │Middleware   │Background Services  ││
│  └─────────────┴─────────────┴─────────────────────┘│
└─────────────────┬───────────────────────────────────┘
                  │
┌─────────────────┴───────────────────────────────────┐
│               Business Logic                        │
│  ┌─────────────┬─────────────┬─────────────────────┐│
│  │Services     │Repositories │DTOs/Models          ││
│  └─────────────┴─────────────┴─────────────────────┘│
└─────────────────┬───────────────────────────────────┘
                  │
┌─────────────────┴───────────────────────────────────┐
│            Data & External APIs                     │
│  ┌──────────────┬──────────────┬──────────────────┐ │
│  │PostgreSQL    │Google Maps   │File Storage      │ │
│  │+ PostGIS     │API           │(Routes Export)   │ │
│  └──────────────┴──────────────┴──────────────────┘ │
└─────────────────────────────────────────────────────┘
```

---

## 🗄️ **2. Datenbank Design**

### **Haupttabellen:**

**Users**
- Id, Email, PasswordHash, CreatedAt, LastLogin
- Name, Preferences (JSON für UI-Settings)

**Routes**
- Id, UserId, Name, Description, CreatedAt, UpdatedAt
- IsPublic, EstimatedDays, TotalDistance
- RouteData (JSON für Metadata)

**Places**
- Id, Name, Latitude, Longitude
- PlaceType (City, Attraction, Activity)
- Description, ExternalIds (Google Place ID, etc.)

**RoutePlaces** (Junction Table)
- RouteId, PlaceId, OrderIndex
- Notes, EstimatedStayDuration
- ArrivalDate, DepartureDate

**Activities** (Erweiterbar)
- Id, PlaceId, Name, Type
- ExternalUrl, Rating, Duration

---

## 🔧 **3. API-Struktur (REST Endpoints)**

### **Authentication:**
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `DELETE /api/auth/logout`

### **Routes Management:**
- `GET /api/routes` - Alle Routen des Users
- `GET /api/routes/{id}` - Spezifische Route
- `POST /api/routes` - Neue Route erstellen
- `PUT /api/routes/{id}` - Route aktualisieren
- `DELETE /api/routes/{id}` - Route löschen
- `POST /api/routes/{id}/duplicate` - Route kopieren

### **Places Management:**
- `GET /api/places` - Alle verfügbaren Orte
- `GET /api/places/search?query=christchurch` - Orte suchen
- `POST /api/places` - Neuen Ort hinzufügen
- `GET /api/places/{id}/activities` - Aktivitäten am Ort

### **Route Planning:**
- `POST /api/routes/{id}/places` - Ort zur Route hinzufügen
- `PUT /api/routes/{id}/places/{placeId}/order` - Reihenfolge ändern
- `DELETE /api/routes/{id}/places/{placeId}` - Ort entfernen
- `GET /api/routes/{id}/optimize` - Route optimieren

### **External Integrations:**
- `GET /api/external/geocode?address=christchurch` - Koordinaten finden
- `GET /api/external/directions?from=...&to=...` - Wegbeschreibung
- `GET /api/external/activities?location=...` - Aktivitäten finden

### **Import/Export:**
- `POST /api/routes/import` - Route aus JSON/GPX importieren
- `GET /api/routes/{id}/export?format=json` - Route exportieren

---

## 🔐 **4. Sicherheitskonzept**

### **Authentication & Authorization:**
- **JWT Tokens** für Authentifizierung
- **Refresh Tokens** für längere Sessions
- **Role-based Access** (User, Admin)
- **Rate Limiting** pro User/IP

### **Data Protection:**
- **Input Validation** auf allen Endpoints
- **SQL Injection** Schutz via Entity Framework
- **CORS** Konfiguration für Frontend
- **HTTPS** Only in Production

### **Privacy:**
- Routen standardmäßig **privat**
- Opt-in für **öffentliche** Routen
- **GDPR-konform** (Datenexport/-löschung)

---

## 🔄 **5. Service Layer Architektur**

### **Core Services:**

**IRouteService**
- Route CRUD Operations
- Route Optimization Logic
- Distance/Duration Calculations

**IPlaceService**
- Place Management
- Geocoding Integration
- Place Search & Filtering

**IGeoService**
- Koordinaten-Transformationen
- Distanz-Berechnungen
- Geo-Spatial Queries

**IExternalApiService**
- Google Maps Integration
- Komoot API Calls
- Rate Limiting & Caching

**IUserService**
- User Management
- Preferences Handling
- Authentication Logic

### **Background Services:**
- **Route Optimization** (lange Berechnungen)
- **External API Sync** (Orte aktualisieren)
- **Cleanup Service** (alte Sessions, temp files)

---

## 📦 **6. Datenaustausch (DTOs)**

### **Request DTOs:**
- CreateRouteRequest
- UpdateRouteRequest
- AddPlaceToRouteRequest
- ReorderPlacesRequest

### **Response DTOs:**
- RouteResponse (mit Places)
- PlaceResponse (mit Activities)
- UserRouteListResponse
- ExternalApiResponse

### **Mapping Strategy:**
- **AutoMapper** für DTO ↔ Entity Mapping
- **Validation Attributes** auf DTOs
- **Separate DTOs** für Create/Update/Response

---

## ⚡ **7. Performance & Skalierung**

### **Caching Strategy:**
- **Memory Cache** für häufige Geo-Abfragen
- **Distributed Cache** (Redis) für Sessions
- **HTTP Cache Headers** für statische Daten

### **Database Optimization:**
- **Spatial Indexes** auf Koordinaten
- **Composite Indexes** auf RouteId + OrderIndex
- **Query Optimization** mit EF Core

### **API Performance:**
- **Async/Await** für alle I/O Operations
- **Pagination** für große Datensätze
- **Bulk Operations** für mehrere Places

---

## 🔧 **8. Entwicklungsumgebung**

### **Project Structure:**
```
NZRoutePlanner.API/
├── Controllers/
├── Services/
├── Repositories/
├── Models/
├── DTOs/
├── Middleware/
├── Configuration/
└── Program.cs

NZRoutePlanner.Core/
├── Entities/
├── Interfaces/
└── Enums/

NZRoutePlanner.Infrastructure/
├── Data/
├── External/
└── Services/
```

### **Dependencies:**
- **Entity Framework Core** (PostgreSQL)
- **AutoMapper** (DTO Mapping)
- **FluentValidation** (Input Validation)
- **Serilog** (Logging)
- **Swagger/OpenAPI** (API Documentation)
- **NetTopologySuite** (Geo-Features)

---

## 🚀 **9. Deployment Strategy**

### **Environment Setup:**
- **Development**: Local PostgreSQL + In-Memory Cache
- **Staging**: Docker Container + PostgreSQL Cloud
- **Production**: Azure App Service + Azure Database

### **CI/CD Pipeline:**
- **GitHub Actions** für automatisches Deployment
- **Unit Tests** vor jedem Deployment
- **Database Migrations** automatisch ausführen

Dieses Konzept gibt dir eine solide, erweiterbare Basis für dein NZ Route Planner Projekt und bereitet dich optimal auf den C# Job vor! 🎯