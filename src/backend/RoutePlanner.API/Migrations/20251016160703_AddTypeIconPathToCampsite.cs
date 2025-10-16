using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RoutePlanner.API.Migrations
{
    /// <inheritdoc />
    public partial class AddTypeIconPathToCampsite : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "TypeIconPath",
                table: "Campsites",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "TypeIconPath",
                table: "Campsites");
        }
    }
}
