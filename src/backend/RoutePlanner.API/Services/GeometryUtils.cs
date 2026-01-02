using NetTopologySuite.Geometries;
using RoutePlanner.API.Models.Osrm;

namespace RoutePlanner.API.Services
{
    public static class GeometryUtils
    {
        private static readonly GeometryFactory GeometryFactory = new(new PrecisionModel(), 4326);

        /// <summary>
        /// Merge step geometries from an OSRM leg into a single LineString
        /// OSRM coordinates are [lon, lat], NetTopologySuite uses Coordinate(x=lon, y=lat)
        /// </summary>
        /// <param name="leg">OSRM leg with step geometries</param>
        /// <returns>LineString combining all step geometries</returns>
        public static LineString MergeLegGeometry(OsrmLeg leg)
        {
            if (leg == null || leg.Steps == null || leg.Steps.Count == 0)
            {
                throw new ArgumentException("Leg must have at least one step", nameof(leg));
            }

            var allCoordinates = new List<Coordinate>();

            foreach (var step in leg.Steps)
            {
                if (step.Geometry?.Coordinates == null || step.Geometry.Coordinates.Count == 0)
                {
                    continue;
                }

                foreach (var coord in step.Geometry.Coordinates)
                {
                    if (coord.Count >= 2)
                    {
                        // OSRM: [lon, lat] -> NetTopologySuite: Coordinate(x=lon, y=lat)
                        var coordinate = new Coordinate(coord[0], coord[1]);

                        // Avoid duplicate consecutive coordinates
                        if (allCoordinates.Count == 0 ||
                            !coordinate.Equals2D(allCoordinates[allCoordinates.Count - 1]))
                        {
                            allCoordinates.Add(coordinate);
                        }
                    }
                }
            }

            if (allCoordinates.Count < 2)
            {
                throw new InvalidOperationException("Merged geometry must have at least 2 coordinates");
            }

            var lineString = GeometryFactory.CreateLineString(allCoordinates.ToArray());
            lineString.SRID = 4326;
            return lineString;
        }

        /// <summary>
        /// Convert LineString to GeoJSON coordinate array for frontend
        /// Returns [[lon, lat], [lon, lat], ...]
        /// </summary>
        /// <param name="lineString">NetTopologySuite LineString</param>
        /// <returns>List of coordinate pairs [lon, lat]</returns>
        public static List<List<double>> LineStringToCoordinateArray(LineString? lineString)
        {
            if (lineString == null)
            {
                return new List<List<double>>();
            }

            return lineString.Coordinates
                .Select(c => new List<double> { c.X, c.Y })
                .ToList();
        }
    }
}
