using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace RoutePlanner.API.Migrations
{
    /// <inheritdoc />
    public partial class AddCountrySystem : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Countries",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Code = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: true),
                    Icon = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    Description = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Countries", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PlaceCountries",
                columns: table => new
                {
                    PlaceId = table.Column<int>(type: "integer", nullable: false),
                    CountryId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlaceCountries", x => new { x.PlaceId, x.CountryId });
                    table.ForeignKey(
                        name: "FK_PlaceCountries_Countries_CountryId",
                        column: x => x.CountryId,
                        principalTable: "Countries",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PlaceCountries_Places_PlaceId",
                        column: x => x.PlaceId,
                        principalTable: "Places",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.InsertData(
                table: "Countries",
                columns: new[] { "Id", "Code", "Description", "Icon", "Name" },
                values: new object[,]
                {
                    { 1, "NZ", "Island country in the southwestern Pacific Ocean", "🇳🇿", "New Zealand" },
                    { 2, "AU", "Country and continent in Oceania", "🇦🇺", "Australia" },
                    { 3, "US", "Federal republic in North America", "🇺🇸", "United States" },
                    { 4, "DE", "Federal republic in Central Europe", "🇩🇪", "Germany" },
                    { 5, "FR", "Republic in Western Europe", "🇫🇷", "France" },
                    { 6, "IT", "Republic in Southern Europe", "🇮🇹", "Italy" },
                    { 7, "ES", "Kingdom in Southwestern Europe", "🇪🇸", "Spain" },
                    { 8, "GB", "Island nation in Northwestern Europe", "🇬🇧", "United Kingdom" },
                    { 9, "CA", "Country in North America", "🇨🇦", "Canada" },
                    { 10, "JP", "Island nation in East Asia", "🇯🇵", "Japan" }
                });

            migrationBuilder.CreateIndex(
                name: "IX_Countries_Code",
                table: "Countries",
                column: "Code");

            migrationBuilder.CreateIndex(
                name: "IX_Countries_Name",
                table: "Countries",
                column: "Name");

            migrationBuilder.CreateIndex(
                name: "IX_PlaceCountries_CountryId",
                table: "PlaceCountries",
                column: "CountryId");

            migrationBuilder.CreateIndex(
                name: "IX_PlaceCountries_PlaceId",
                table: "PlaceCountries",
                column: "PlaceId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PlaceCountries");

            migrationBuilder.DropTable(
                name: "Countries");
        }
    }
}
