using RoutePlanner.API.DTOs;
using RoutePlanner.API.Models;

namespace RoutePlanner.API.Services
{
    /// <summary>
    /// Service for managing places with Google Maps integration
    /// Orchestrates between Places, GooglePlaceData, and user data
    /// </summary>
    public interface IPlaceService
    {
        /// <summary>
        /// Create a new place from a Google Place ID
        /// Fetches Google data, creates GooglePlaceData if needed, creates user's Place
        /// </summary>
        /// <param name="googlePlaceId">Google Place ID from search results</param>
        /// <param name="userId">User who owns this place</param>
        /// <param name="notes">Optional user notes</param>
        /// <returns>Created place with all navigation properties loaded</returns>
        Task<Place> CreatePlaceFromGoogle(string googlePlaceId, int userId, string? notes = null);

        /// <summary>
        /// Check if user already has a place with this Google Place ID
        /// </summary>
        /// <param name="googlePlaceId">Google Place ID to check</param>
        /// <param name="userId">User to check for</param>
        /// <returns>Duplicate check result with existing place if found</returns>
        Task<DuplicateCheckResponse> CheckDuplicate(string googlePlaceId, int userId);

        /// <summary>
        /// Refresh Google data for an existing place (ratings, hours, etc.)
        /// </summary>
        /// <param name="placeId">Place ID to refresh</param>
        /// <returns>Response indicating what was updated</returns>
        Task<RefreshGoogleDataResponse> RefreshGoogleData(int placeId);

        /// <summary>
        /// Get complete place information with all Google data embedded
        /// </summary>
        /// <param name="placeId">Place ID</param>
        /// <param name="userId">User requesting (for authorization)</param>
        /// <returns>Enriched place DTO or null if not found/not authorized</returns>
        Task<EnrichedPlaceDto?> GetEnrichedPlace(int placeId, int userId);

        /// <summary>
        /// Create a manual place without Google data (fallback)
        /// </summary>
        /// <param name="name">Place name</param>
        /// <param name="lat">Latitude</param>
        /// <param name="lng">Longitude</param>
        /// <param name="userId">User who owns this place</param>
        /// <param name="notes">Optional user notes</param>
        /// <returns>Created place</returns>
        Task<Place> AddManualPlace(string name, double lat, double lng, int userId, string? notes = null);

        /// <summary>
        /// Attempt to link existing places to Google Places via reverse geocoding
        /// Migration/admin function
        /// </summary>
        /// <param name="userId">User whose places to process</param>
        /// <returns>Number of places successfully linked</returns>
        Task<int> ReverseGeocodeExistingPlaces(int userId);

        /// <summary>
        /// Update only the notes field for a place
        /// </summary>
        /// <param name="placeId">Place ID</param>
        /// <param name="userId">User requesting (for authorization)</param>
        /// <param name="notes">New notes content</param>
        /// <returns>True if updated successfully</returns>
        Task<bool> UpdateNotes(int placeId, int userId, string? notes);
    }
}
