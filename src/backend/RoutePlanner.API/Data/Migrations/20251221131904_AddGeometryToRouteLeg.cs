using Microsoft.EntityFrameworkCore.Migrations;
using NetTopologySuite.Geometries;

#nullable disable

namespace RoutePlanner.API.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddGeometryToRouteLeg : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<LineString>(
                name: "Geometry",
                table: "RouteLegs",
                type: "geometry (linestring, 4326)",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_RouteLegs_Geometry",
                table: "RouteLegs",
                column: "Geometry")
                .Annotation("Npgsql:IndexMethod", "gist");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_RouteLegs_Geometry",
                table: "RouteLegs");

            migrationBuilder.DropColumn(
                name: "Geometry",
                table: "RouteLegs");
        }
    }
}
