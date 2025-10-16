using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RoutePlanner.API.Migrations
{
    /// <inheritdoc />
    public partial class AddMultiLanguageDescriptions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Description",
                table: "Campsites");

            migrationBuilder.AddColumn<string>(
                name: "Descriptions",
                table: "Campsites",
                type: "jsonb",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Descriptions",
                table: "Campsites");

            migrationBuilder.AddColumn<string>(
                name: "Description",
                table: "Campsites",
                type: "text",
                nullable: true);
        }
    }
}
