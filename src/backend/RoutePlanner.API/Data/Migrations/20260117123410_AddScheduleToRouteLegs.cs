using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RoutePlanner.API.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddScheduleToRouteLegs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "PlannedEnd",
                table: "RouteLegs",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "PlannedStart",
                table: "RouteLegs",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PlannedEnd",
                table: "RouteLegs");

            migrationBuilder.DropColumn(
                name: "PlannedStart",
                table: "RouteLegs");
        }
    }
}
