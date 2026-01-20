using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RoutePlanner.API.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCamperMateSupport : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Campsites_Park4NightId",
                table: "Campsites");

            migrationBuilder.AlterColumn<string>(
                name: "Park4NightId",
                table: "Campsites",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(50)",
                oldMaxLength: 50);

            migrationBuilder.AddColumn<string>(
                name: "CamperMateId",
                table: "Campsites",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Source",
                table: "Campsites",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateIndex(
                name: "IX_Campsites_CamperMateId",
                table: "Campsites",
                column: "CamperMateId",
                unique: true,
                filter: "\"CamperMateId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Campsites_Park4NightId",
                table: "Campsites",
                column: "Park4NightId",
                unique: true,
                filter: "\"Park4NightId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Campsites_Source",
                table: "Campsites",
                column: "Source");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Campsites_CamperMateId",
                table: "Campsites");

            migrationBuilder.DropIndex(
                name: "IX_Campsites_Park4NightId",
                table: "Campsites");

            migrationBuilder.DropIndex(
                name: "IX_Campsites_Source",
                table: "Campsites");

            migrationBuilder.DropColumn(
                name: "CamperMateId",
                table: "Campsites");

            migrationBuilder.DropColumn(
                name: "Source",
                table: "Campsites");

            migrationBuilder.AlterColumn<string>(
                name: "Park4NightId",
                table: "Campsites",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "character varying(50)",
                oldMaxLength: 50,
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Campsites_Park4NightId",
                table: "Campsites",
                column: "Park4NightId",
                unique: true);
        }
    }
}
