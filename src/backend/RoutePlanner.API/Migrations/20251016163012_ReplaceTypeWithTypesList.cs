using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RoutePlanner.API.Migrations
{
    /// <inheritdoc />
    public partial class ReplaceTypeWithTypesList : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Type",
                table: "Campsites");

            migrationBuilder.DropColumn(
                name: "TypeIconPath",
                table: "Campsites");

            migrationBuilder.AddColumn<string>(
                name: "Types",
                table: "Campsites",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Types",
                table: "Campsites");

            migrationBuilder.AddColumn<string>(
                name: "Type",
                table: "Campsites",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TypeIconPath",
                table: "Campsites",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);
        }
    }
}
