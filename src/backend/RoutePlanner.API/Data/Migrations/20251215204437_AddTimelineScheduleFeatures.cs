using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace RoutePlanner.API.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddTimelineScheduleFeatures : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<TimeOnly>(
                name: "DefaultArrivalTime",
                table: "Routes",
                type: "time without time zone",
                nullable: true);

            migrationBuilder.AddColumn<TimeOnly>(
                name: "DefaultDepartureTime",
                table: "Routes",
                type: "time without time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "EndDateTime",
                table: "Routes",
                type: "timestamptz",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "StartDateTime",
                table: "Routes",
                type: "timestamptz",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TimeZoneId",
                table: "Routes",
                type: "character varying(100)",
                maxLength: 100,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<bool>(
                name: "IsEndLocked",
                table: "RoutePlaces",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsStartLocked",
                table: "RoutePlaces",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "PlannedEnd",
                table: "RoutePlaces",
                type: "timestamptz",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "PlannedStart",
                table: "RoutePlaces",
                type: "timestamptz",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "StayDurationMinutes",
                table: "RoutePlaces",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "StayNights",
                table: "RoutePlaces",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "StopType",
                table: "RoutePlaces",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "TimeZoneId",
                table: "RoutePlaces",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "RouteLegs",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    RouteId = table.Column<int>(type: "integer", nullable: false),
                    FromRoutePlaceId = table.Column<int>(type: "integer", nullable: false),
                    ToRoutePlaceId = table.Column<int>(type: "integer", nullable: false),
                    OrderIndex = table.Column<int>(type: "integer", nullable: false),
                    DistanceMeters = table.Column<int>(type: "integer", nullable: false),
                    DurationSeconds = table.Column<int>(type: "integer", nullable: false),
                    Provider = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    CalculatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RouteLegs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RouteLegs_RoutePlaces_FromRoutePlaceId",
                        column: x => x.FromRoutePlaceId,
                        principalTable: "RoutePlaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_RouteLegs_RoutePlaces_ToRoutePlaceId",
                        column: x => x.ToRoutePlaceId,
                        principalTable: "RoutePlaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_RouteLegs_Routes_RouteId",
                        column: x => x.RouteId,
                        principalTable: "Routes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.UpdateData(
                table: "RoutePlaces",
                keyColumn: "Id",
                keyValue: 1,
                columns: new[] { "PlannedEnd", "PlannedStart", "StayDurationMinutes", "StayNights", "TimeZoneId" },
                values: new object[] { null, null, null, null, null });

            migrationBuilder.UpdateData(
                table: "RoutePlaces",
                keyColumn: "Id",
                keyValue: 2,
                columns: new[] { "PlannedEnd", "PlannedStart", "StayDurationMinutes", "StayNights", "TimeZoneId" },
                values: new object[] { null, null, null, null, null });

            migrationBuilder.UpdateData(
                table: "RoutePlaces",
                keyColumn: "Id",
                keyValue: 3,
                columns: new[] { "PlannedEnd", "PlannedStart", "StayDurationMinutes", "StayNights", "TimeZoneId" },
                values: new object[] { null, null, null, null, null });

            migrationBuilder.UpdateData(
                table: "Routes",
                keyColumn: "Id",
                keyValue: 1,
                columns: new[] { "DefaultArrivalTime", "DefaultDepartureTime", "EndDateTime", "StartDateTime", "TimeZoneId" },
                values: new object[] { null, null, null, null, "Europe/Berlin" });

            migrationBuilder.CreateIndex(
                name: "IX_RoutePlaces_PlannedEnd",
                table: "RoutePlaces",
                column: "PlannedEnd");

            migrationBuilder.CreateIndex(
                name: "IX_RoutePlaces_PlannedStart",
                table: "RoutePlaces",
                column: "PlannedStart");

            migrationBuilder.CreateIndex(
                name: "IX_RouteLegs_FromRoutePlaceId",
                table: "RouteLegs",
                column: "FromRoutePlaceId");

            migrationBuilder.CreateIndex(
                name: "IX_RouteLegs_RouteId_OrderIndex",
                table: "RouteLegs",
                columns: new[] { "RouteId", "OrderIndex" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RouteLegs_ToRoutePlaceId",
                table: "RouteLegs",
                column: "ToRoutePlaceId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "RouteLegs");

            migrationBuilder.DropIndex(
                name: "IX_RoutePlaces_PlannedEnd",
                table: "RoutePlaces");

            migrationBuilder.DropIndex(
                name: "IX_RoutePlaces_PlannedStart",
                table: "RoutePlaces");

            migrationBuilder.DropColumn(
                name: "DefaultArrivalTime",
                table: "Routes");

            migrationBuilder.DropColumn(
                name: "DefaultDepartureTime",
                table: "Routes");

            migrationBuilder.DropColumn(
                name: "EndDateTime",
                table: "Routes");

            migrationBuilder.DropColumn(
                name: "StartDateTime",
                table: "Routes");

            migrationBuilder.DropColumn(
                name: "TimeZoneId",
                table: "Routes");

            migrationBuilder.DropColumn(
                name: "IsEndLocked",
                table: "RoutePlaces");

            migrationBuilder.DropColumn(
                name: "IsStartLocked",
                table: "RoutePlaces");

            migrationBuilder.DropColumn(
                name: "PlannedEnd",
                table: "RoutePlaces");

            migrationBuilder.DropColumn(
                name: "PlannedStart",
                table: "RoutePlaces");

            migrationBuilder.DropColumn(
                name: "StayDurationMinutes",
                table: "RoutePlaces");

            migrationBuilder.DropColumn(
                name: "StayNights",
                table: "RoutePlaces");

            migrationBuilder.DropColumn(
                name: "StopType",
                table: "RoutePlaces");

            migrationBuilder.DropColumn(
                name: "TimeZoneId",
                table: "RoutePlaces");
        }
    }
}
