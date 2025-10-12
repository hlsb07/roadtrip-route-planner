using System;
using Microsoft.EntityFrameworkCore.Migrations;
using NetTopologySuite.Geometries;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace RoutePlanner.API.Migrations
{
    /// <inheritdoc />
    public partial class AddCampsiteTable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Campsites",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Park4NightId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Name = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    Location = table.Column<Point>(type: "geometry (point, 4326)", nullable: false),
                    Latitude = table.Column<double>(type: "double precision", nullable: false),
                    Longitude = table.Column<double>(type: "double precision", nullable: false),
                    Rating = table.Column<decimal>(type: "numeric", nullable: true),
                    Type = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Services = table.Column<string>(type: "text", nullable: true),
                    Activities = table.Column<string>(type: "text", nullable: true),
                    Price = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    NumberOfSpots = table.Column<int>(type: "integer", nullable: true),
                    Description = table.Column<string>(type: "text", nullable: true),
                    ImagePaths = table.Column<string>(type: "text", nullable: true),
                    SourceUrl = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP"),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Campsites", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Campsites_CreatedAt",
                table: "Campsites",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_Campsites_Location",
                table: "Campsites",
                column: "Location")
                .Annotation("Npgsql:IndexMethod", "gist");

            migrationBuilder.CreateIndex(
                name: "IX_Campsites_Name",
                table: "Campsites",
                column: "Name");

            migrationBuilder.CreateIndex(
                name: "IX_Campsites_Park4NightId",
                table: "Campsites",
                column: "Park4NightId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Campsites_Rating",
                table: "Campsites",
                column: "Rating");

            migrationBuilder.CreateIndex(
                name: "IX_Campsites_SourceUrl",
                table: "Campsites",
                column: "SourceUrl",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Campsites");
        }
    }
}
