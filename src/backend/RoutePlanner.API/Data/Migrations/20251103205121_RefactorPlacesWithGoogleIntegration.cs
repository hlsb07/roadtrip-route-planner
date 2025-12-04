using System;
using Microsoft.EntityFrameworkCore.Migrations;
using NetTopologySuite.Geometries;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace RoutePlanner.API.Data.Migrations
{
    /// <inheritdoc />
    public partial class RefactorPlacesWithGoogleIntegration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Step 1: Create Users table FIRST
            migrationBuilder.CreateTable(
                name: "Users",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Username = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Email = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    PasswordHash = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Users", x => x.Id);
                });

            // Step 2: Insert default user BEFORE adding UserId columns
            migrationBuilder.InsertData(
                table: "Users",
                columns: new[] { "Id", "CreatedAt", "Email", "PasswordHash", "UpdatedAt", "Username" },
                values: new object[] { 1, new DateTime(2025, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "default@roadtrip.local", "placeholder", new DateTime(2025, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "default" });

            // Step 3: Add UserId to Routes with default value 1 (not 0)
            migrationBuilder.AddColumn<int>(
                name: "UserId",
                table: "Routes",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            // Step 4: Add new columns to Places
            migrationBuilder.AddColumn<DateTime>(
                name: "CreatedAt",
                table: "Places",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<string>(
                name: "GooglePlaceId",
                table: "Places",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastViewedAt",
                table: "Places",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Notes",
                table: "Places",
                type: "character varying(5000)",
                maxLength: 5000,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedAt",
                table: "Places",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            // Step 5: Add UserId to Places with default value 1 (not 0!)
            migrationBuilder.AddColumn<int>(
                name: "UserId",
                table: "Places",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            // Step 6: Create GooglePlaceData table
            migrationBuilder.CreateTable(
                name: "GooglePlaceData",
                columns: table => new
                {
                    GooglePlaceId = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Name = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    FormattedAddress = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    Location = table.Column<Point>(type: "geometry (point, 4326)", nullable: false),
                    Types = table.Column<string>(type: "text", nullable: true),
                    Rating = table.Column<double>(type: "double precision", nullable: true),
                    UserRatingsTotal = table.Column<int>(type: "integer", nullable: true),
                    PriceLevel = table.Column<int>(type: "integer", nullable: true),
                    Website = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    PhoneNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    BusinessStatus = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    OpeningHours = table.Column<string>(type: "text", nullable: true),
                    LastSyncedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    SyncVersion = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GooglePlaceData", x => x.GooglePlaceId);
                });

            migrationBuilder.CreateTable(
                name: "PlacePhotos",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    GooglePlaceId = table.Column<string>(type: "character varying(500)", nullable: false),
                    PhotoReference = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    PhotoUrl = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    Width = table.Column<int>(type: "integer", nullable: true),
                    Height = table.Column<int>(type: "integer", nullable: true),
                    IsPrimary = table.Column<bool>(type: "boolean", nullable: false),
                    Source = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false, defaultValue: "google"),
                    OrderIndex = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlacePhotos", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PlacePhotos_GooglePlaceData_GooglePlaceId",
                        column: x => x.GooglePlaceId,
                        principalTable: "GooglePlaceData",
                        principalColumn: "GooglePlaceId",
                        onDelete: ReferentialAction.Cascade);
                });

            // Step 7: Update seed data timestamps (UserId already set to 1 by default)
            migrationBuilder.UpdateData(
                table: "Places",
                keyColumn: "Id",
                keyValue: 1,
                columns: new[] { "CreatedAt", "UpdatedAt" },
                values: new object[] { new DateTime(2025, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new DateTime(2025, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc) });

            migrationBuilder.UpdateData(
                table: "Places",
                keyColumn: "Id",
                keyValue: 2,
                columns: new[] { "CreatedAt", "UpdatedAt" },
                values: new object[] { new DateTime(2025, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new DateTime(2025, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc) });

            migrationBuilder.UpdateData(
                table: "Places",
                keyColumn: "Id",
                keyValue: 3,
                columns: new[] { "CreatedAt", "UpdatedAt" },
                values: new object[] { new DateTime(2025, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new DateTime(2025, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc) });

            // Step 8: Create all indexes
            migrationBuilder.CreateIndex(
                name: "IX_Routes_UserId",
                table: "Routes",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_Places_GooglePlaceId",
                table: "Places",
                column: "GooglePlaceId");

            migrationBuilder.CreateIndex(
                name: "IX_Places_UserId",
                table: "Places",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_Places_UserId_GooglePlaceId",
                table: "Places",
                columns: new[] { "UserId", "GooglePlaceId" });

            migrationBuilder.CreateIndex(
                name: "IX_GooglePlaceData_LastSyncedAt",
                table: "GooglePlaceData",
                column: "LastSyncedAt");

            migrationBuilder.CreateIndex(
                name: "IX_GooglePlaceData_Location",
                table: "GooglePlaceData",
                column: "Location")
                .Annotation("Npgsql:IndexMethod", "gist");

            migrationBuilder.CreateIndex(
                name: "IX_GooglePlaceData_Name",
                table: "GooglePlaceData",
                column: "Name");

            migrationBuilder.CreateIndex(
                name: "IX_PlacePhotos_GooglePlaceId",
                table: "PlacePhotos",
                column: "GooglePlaceId");

            migrationBuilder.CreateIndex(
                name: "IX_PlacePhotos_GooglePlaceId_IsPrimary",
                table: "PlacePhotos",
                columns: new[] { "GooglePlaceId", "IsPrimary" },
                filter: "\"IsPrimary\" = true");

            migrationBuilder.CreateIndex(
                name: "IX_Users_Email",
                table: "Users",
                column: "Email",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Users_Username",
                table: "Users",
                column: "Username",
                unique: true);

            // Step 9: Add foreign key constraints (Users already exists, so this will work)
            migrationBuilder.AddForeignKey(
                name: "FK_Places_GooglePlaceData_GooglePlaceId",
                table: "Places",
                column: "GooglePlaceId",
                principalTable: "GooglePlaceData",
                principalColumn: "GooglePlaceId",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_Places_Users_UserId",
                table: "Places",
                column: "UserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_Routes_Users_UserId",
                table: "Routes",
                column: "UserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Places_GooglePlaceData_GooglePlaceId",
                table: "Places");

            migrationBuilder.DropForeignKey(
                name: "FK_Places_Users_UserId",
                table: "Places");

            migrationBuilder.DropForeignKey(
                name: "FK_Routes_Users_UserId",
                table: "Routes");

            migrationBuilder.DropTable(
                name: "PlacePhotos");

            migrationBuilder.DropTable(
                name: "Users");

            migrationBuilder.DropTable(
                name: "GooglePlaceData");

            migrationBuilder.DropIndex(
                name: "IX_Routes_UserId",
                table: "Routes");

            migrationBuilder.DropIndex(
                name: "IX_Places_GooglePlaceId",
                table: "Places");

            migrationBuilder.DropIndex(
                name: "IX_Places_UserId",
                table: "Places");

            migrationBuilder.DropIndex(
                name: "IX_Places_UserId_GooglePlaceId",
                table: "Places");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "Routes");

            migrationBuilder.DropColumn(
                name: "CreatedAt",
                table: "Places");

            migrationBuilder.DropColumn(
                name: "GooglePlaceId",
                table: "Places");

            migrationBuilder.DropColumn(
                name: "LastViewedAt",
                table: "Places");

            migrationBuilder.DropColumn(
                name: "Notes",
                table: "Places");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                table: "Places");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "Places");
        }
    }
}
