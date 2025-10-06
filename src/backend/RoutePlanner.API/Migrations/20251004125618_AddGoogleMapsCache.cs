using System;
using Microsoft.EntityFrameworkCore.Migrations;
using NetTopologySuite.Geometries;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace RoutePlanner.API.Migrations
{
    /// <inheritdoc />
    public partial class AddGoogleMapsCache : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "GoogleMapsCache",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    SearchQuery = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    GooglePlaceId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    FormattedAddress = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Location = table.Column<Point>(type: "geometry (point, 4326)", nullable: false),
                    Types = table.Column<string>(type: "text", nullable: true),
                    AdditionalData = table.Column<string>(type: "text", nullable: true),
                    CachedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    HitCount = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    ApiType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GoogleMapsCache", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_GoogleMapsCache_ExpiresAt",
                table: "GoogleMapsCache",
                column: "ExpiresAt");

            migrationBuilder.CreateIndex(
                name: "IX_GoogleMapsCache_GooglePlaceId",
                table: "GoogleMapsCache",
                column: "GooglePlaceId");

            migrationBuilder.CreateIndex(
                name: "IX_GoogleMapsCache_Location",
                table: "GoogleMapsCache",
                column: "Location")
                .Annotation("Npgsql:IndexMethod", "gist");

            migrationBuilder.CreateIndex(
                name: "IX_GoogleMapsCache_Name",
                table: "GoogleMapsCache",
                column: "Name");

            migrationBuilder.CreateIndex(
                name: "IX_GoogleMapsCache_SearchQuery",
                table: "GoogleMapsCache",
                column: "SearchQuery");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GoogleMapsCache");
        }
    }
}
