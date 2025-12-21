using RoutePlanner.API.Models.Osrm;
using NetTopologySuite.Geometries;

namespace RoutePlanner.API.Services
{
    public interface IOsrmClient
    {
        /// <summary>
        /// Get route with full geometry and steps between waypoints
        /// </summary>
        /// <param name="waypoints">List of waypoints as NetTopologySuite Points (SRID 4326)</param>
        /// <param name="includeSteps">Include step-by-step geometry for each leg</param>
        /// <returns>OSRM route response with geometry and leg data</returns>
        Task<OsrmRouteResponse> GetRoute(List<Point> waypoints, bool includeSteps = true);

        /// <summary>
        /// Get route as raw OSRM response (for proxy endpoint)
        /// </summary>
        /// <param name="coordinates">Coordinate string in OSRM format: "lon,lat;lon,lat;..."</param>
        /// <returns>Raw JSON response from OSRM API</returns>
        Task<string> GetRouteRaw(string coordinates);
    }
}
