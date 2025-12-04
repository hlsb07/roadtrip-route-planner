Final Database Architecture
┌─────────────────────────────────────────────────────────────────┐
│                     MULTI-USER SYSTEM                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐                                               │
│  │    Users     │ (Future - Phase 2)                           │
│  ├──────────────┤                                               │
│  │ Id           │                                               │
│  │ Username     │                                               │
│  │ Email        │                                               │
│  │ PasswordHash │                                               │
│  └──────┬───────┘                                               │
│         │                                                        │
│         │ 1:N                                                   │
│         │                                                        │
│  ┌──────▼───────────┐         ┌──────────────────────┐         │
│  │     Places       │◄────────│  GooglePlaceData     │         │
│  ├──────────────────┤  0..1   ├──────────────────────┤         │
│  │ Id               │         │ Id                   │         │
│  │ UserId (FK)      │         │ GooglePlaceId (PK)   │ SHARED  │
│  │ Name             │         │ Name                 │ ACROSS  │
│  │ Location (Point) │         │ FormattedAddress     │ USERS   │
│  │ Notes            │ USER    │ Rating               │         │
│  │ GooglePlaceId(FK)│ OWNED   │ UserRatingsTotal     │         │
│  │ CreatedAt        │         │ PriceLevel           │         │
│  │ UpdatedAt        │         │ Website              │         │
│  │ LastViewedAt     │         │ PhoneNumber          │         │
│  └──────┬───────────┘         │ Types (JSON)         │         │
│         │                      │ OpeningHours (JSON)  │         │
│         │                      │ LastSyncedAt         │         │
│         │                      │ BusinessStatus       │         │
│         │                      └──────┬───────────────┘         │
│         │                             │                         │
│         │                             │ 1:N                    │
│         │                      ┌──────▼───────────┐            │
│         │                      │  PlacePhotos     │  SHARED    │
│         │                      ├──────────────────┤  ACROSS    │
│         │                      │ Id               │  USERS     │
│         │                      │ GooglePlaceId(FK)│            │
│         │                      │ PhotoReference   │            │
│         ├──────────────────────┤ PhotoUrl         │            │
│         │                      │ Width/Height     │            │
│         │                      │ IsPrimary        │            │
│  ┌──────▼─────────┐           │ Source           │            │
│  │ PlaceCategories│           │ OrderIndex       │            │
│  ├────────────────┤           └──────────────────┘            │
│  │ PlaceId (FK)   │  USER                                      │
│  │ CategoryId(FK) │  OWNED                                     │
│  └────────────────┘                                            │
│         │                                                       │
│  ┌──────▼─────────┐                                            │
│  │ PlaceCountries │                                            │
│  ├────────────────┤                                            │
│  │ PlaceId (FK)   │  USER                                      │
│  │ CountryId (FK) │  OWNED                                     │
│  └────────────────┘                                            │
│                                                                 │
│  ┌────────────────────────────────────────────┐               │
│  │      GoogleMapsCache (UNCHANGED)            │  SHARED      │
│  │  Temporary search results cache             │  CACHE       │
│  └────────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────────┘
Key Architectural Principles:
User Ownership: Each Place belongs to a User (via UserId)
Shared Google Data: GooglePlaceData is shared across all users (keyed by GooglePlaceId)
If User A and User B both save "Eiffel Tower", they get:
2 separate Place records (with their own notes/categories)
1 shared GooglePlaceData record (rating, hours, photos)
Shared Photos: Photos from Google are shared (saves storage)
Personal Data: Notes, categories, countries are per-user
📋 Complete Refactoring Plan
Claude’s Plan
Phase 1: Database Schema (Day 1-2)
1.1 Create GooglePlaceData Table
CREATE TABLE GooglePlaceData (
    GooglePlaceId VARCHAR(500) PRIMARY KEY,
    Name VARCHAR(500) NOT NULL,
    FormattedAddress TEXT,
    Types JSONB,
    Latitude DOUBLE PRECISION NOT NULL,
    Longitude DOUBLE PRECISION NOT NULL,
    Rating DECIMAL(2,1),
    UserRatingsTotal INTEGER,
    PriceLevel INTEGER,
    Website VARCHAR(500),
    PhoneNumber VARCHAR(50),
    OpeningHours JSONB,
    BusinessStatus VARCHAR(50),
    LastSyncedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CreatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_google_place_data_location ON GooglePlaceData USING GIST(Location);
1.2 Create PlacePhotos Table
CREATE TABLE PlacePhotos (
    Id SERIAL PRIMARY KEY,
    GooglePlaceId VARCHAR(500) NOT NULL REFERENCES GooglePlaceData(GooglePlaceId) ON DELETE CASCADE,
    PhotoReference VARCHAR(500),
    PhotoUrl TEXT NOT NULL,
    Width INTEGER,
    Height INTEGER,
    IsPrimary BOOLEAN DEFAULT FALSE,
    Source VARCHAR(50) NOT NULL DEFAULT 'google',
    OrderIndex INTEGER DEFAULT 0,
    CreatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_place_photos_google_place ON PlacePhotos(GooglePlaceId);
1.3 Update Places Table
-- Add new columns to existing Places table
ALTER TABLE Places 
ADD COLUMN UserId INTEGER DEFAULT 1, -- Default to user 1 for now
ADD COLUMN Notes TEXT,
ADD COLUMN GooglePlaceId VARCHAR(500) REFERENCES GooglePlaceData(GooglePlaceId),
ADD COLUMN CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN LastViewedAt TIMESTAMP;

-- Add index
CREATE INDEX idx_places_user_id ON Places(UserId);
CREATE INDEX idx_places_google_place_id ON Places(GooglePlaceId);
1.4 Create Users Table (Placeholder for Phase 2)
CREATE TABLE Users (
    Id SERIAL PRIMARY KEY,
    Username VARCHAR(100) UNIQUE NOT NULL,
    Email VARCHAR(255) UNIQUE NOT NULL,
    PasswordHash VARCHAR(500) NOT NULL,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default user for existing places
INSERT INTO Users (Id, Username, Email, PasswordHash) 
VALUES (1, 'default', 'default@local', 'placeholder');

-- Add foreign key constraint
ALTER TABLE Places ADD CONSTRAINT fk_places_user 
FOREIGN KEY (UserId) REFERENCES Users(Id) ON DELETE CASCADE;
Phase 2: Backend Models (Day 3-4)
2.1 Create GooglePlaceData.cs
New model with GooglePlaceId as primary key, stores shared Google data
2.2 Create PlacePhoto.cs
Links to GooglePlaceId (not PlaceId), shared across users
2.3 Update Place.cs
Add UserId, Notes, GooglePlaceId, timestamps
Navigation property to GooglePlaceData (optional)
2.4 Create User.cs
Simple user model for future authentication
2.5 Update AppDbContext.cs
Configure relationships, indexes, and constraints
Phase 3: Data Migration (Day 5)
3.1 Reverse Geocode Existing Places
For each existing Place:
Call Google Places API with coordinates (reverse geocoding)
If match found → create GooglePlaceData, link to Place
If no match → leave GooglePlaceId as null (manual place)
3.2 Migration Service
Create PlaceMigrationService.cs to handle:
Reverse geocoding batch processing
Duplicate detection
Error handling and logging
Progress tracking
Phase 4: Service Layer (Day 6-7)
4.1 Create PlaceService.cs
Key Methods:
CreatePlaceFromGoogle(googlePlaceId, userId, notes) - Main creation method
CheckDuplicateGooglePlace(googlePlaceId, userId) - Returns warning if exists
RefreshGoogleData(placeId) - Manual sync from Google
GetEnrichedPlace(placeId, userId) - Get full place with Google data
AddManualPlace(lat, lng, name, userId, notes) - Fallback for missing Google places
4.2 Update GoogleMapsService.cs
ReverseGeocode(lat, lng) - Find Google Place from coordinates
NearbySearch(lat, lng, radius, types) - For future nearby search feature
Separate Google data extraction into reusable methods
4.3 Duplicate Prevention Logic
public async Task<DuplicateCheckResult> CheckDuplicate(string googlePlaceId, int userId)
{
    var existing = await _context.Places
        .Include(p => p.GoogleData)
        .FirstOrDefaultAsync(p => p.UserId == userId && p.GooglePlaceId == googlePlaceId);
    
    if (existing != null)
    {
        // Different coordinates for same GooglePlaceId?
        var googleData = await _context.GooglePlaceData
            .FirstOrDefaultAsync(g => g.GooglePlaceId == googlePlaceId);
            
        return new DuplicateCheckResult
        {
            IsDuplicate = true,
            ExistingPlace = existing,
            CoordinatesDiffer = googleData != null && 
                (Math.Abs(existing.Location.Y - googleData.Latitude) > 0.0001 ||
                 Math.Abs(existing.Location.X - googleData.Longitude) > 0.0001)
        };
    }
    return new DuplicateCheckResult { IsDuplicate = false };
}
Phase 5: API/Controllers (Day 8-9)
5.1 Update PlacesController
New/Updated Endpoints:
POST /api/places/from-google - Create place from Google search
POST /api/places/check-duplicate - Check before adding
POST /api/places/{id}/refresh-google - Refresh Google data
POST /api/places/manual - Add manual coordinate place
GET /api/places/{id}/enriched - Get with all Google data
5.2 New DTOs
CreatePlaceFromGoogleDto - googlePlaceId, notes
DuplicateCheckResponseDto - isDuplicate, existingPlace, warning message
EnrichedPlaceDto - complete place with Google data, photos, categories
RefreshGoogleDataResponseDto - success, updated fields
Phase 6: Frontend Updates (Day 10-12)
6.1 Update Search Flow
User searches → sees results with "Add" button
Click "Add" → Check duplicate endpoint
If duplicate → Show warning dialog with options:
"View Existing Place"
"Add Anyway" (if coordinates differ)
"Cancel"
If not duplicate → Create place
6.2 Add Notes Field
Text area in place edit modal
Auto-save on blur
Character limit (e.g., 2000 chars)
6.3 Add Refresh Button
"🔄 Refresh from Google" button in place modal
Shows last synced time
Loading indicator during refresh
Success notification with updated fields
6.4 Enhanced Place Display
Show if place has Google data vs manual
Display "Last synced: X days ago"
Visual indicator for manual places
Phase 7: Testing & Migration Execution (Day 13-14)
7.1 Test Migration Script
Run on copy of production database
Verify reverse geocoding results
Check data integrity
7.2 Manual Testing
Add place from Google search
Test duplicate detection
Refresh Google data
Add manual coordinate place
Check all existing places still work
7.3 Execute Migration
Backup database
Run migration script
Verify all existing places
Update frontend version
Phase 8: Future User Management (Future)
8.1 Authentication System
JWT-based authentication
Password hashing (bcrypt)
Login/logout endpoints
8.2 User Isolation
All queries filter by UserId
Cannot see other users' places
Own routes, categories, countries
8.3 Optional Sharing Features
Share places between users
Public/private routes
Export/import functionality
Migration Strategy Summary
Existing Places:
Attempt reverse geocoding for all
Create GooglePlaceData if match found
Link Place to GooglePlaceData
Keep Place without GooglePlaceId if no match
Future Additions:
Primary: Google search/nearby → always has GooglePlaceId
Fallback: Manual coordinates → no GooglePlaceId
Duplicate Handling:
Check GooglePlaceId before creating
Warn user if exists for their account
Allow if coordinates significantly differ
Data Ownership:
GooglePlaceData: Shared (one per Google Place)
PlacePhotos: Shared (linked to GooglePlaceId)
Place: User-owned (personal notes, categories)
Routes: User-owned (future multi-user ready)
Benefits: ✅ Multi-user ready from day 1 ✅ Efficient storage (shared Google data) ✅ Flexible (allows manual places) ✅ Future-proof (easy to add features) ✅ Clean separation (personal vs. public data)
Stayed in plan mode