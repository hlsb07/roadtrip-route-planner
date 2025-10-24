using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace RoutePlanner.API.Migrations
{
    /// <inheritdoc />
    public partial class AddCategorySystem : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Categories",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Icon = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Description = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Categories", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PlaceCategories",
                columns: table => new
                {
                    PlaceId = table.Column<int>(type: "integer", nullable: false),
                    CategoryId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlaceCategories", x => new { x.PlaceId, x.CategoryId });
                    table.ForeignKey(
                        name: "FK_PlaceCategories_Categories_CategoryId",
                        column: x => x.CategoryId,
                        principalTable: "Categories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PlaceCategories_Places_PlaceId",
                        column: x => x.PlaceId,
                        principalTable: "Places",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.InsertData(
                table: "Categories",
                columns: new[] { "Id", "Description", "Icon", "Name" },
                values: new object[,]
                {
                    { 1, "Beautiful beaches and coastal areas", "🏖️", "Beach" },
                    { 2, "Mountain ranges and hiking areas", "🏔️", "Mountain" },
                    { 3, "Restaurants and dining locations", "🍴", "Restaurant" },
                    { 4, "Museums and cultural sites", "🏛️", "Museum" },
                    { 5, "Parks and natural areas", "🌳", "Park" },
                    { 6, "Shopping centers and markets", "🛍️", "Shopping" },
                    { 7, "Adventure and outdoor activities", "🎢", "Adventure" },
                    { 8, "Historic sites and landmarks", "🏰", "Historic" }
                });

            migrationBuilder.CreateIndex(
                name: "IX_Categories_Name",
                table: "Categories",
                column: "Name");

            migrationBuilder.CreateIndex(
                name: "IX_PlaceCategories_CategoryId",
                table: "PlaceCategories",
                column: "CategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_PlaceCategories_PlaceId",
                table: "PlaceCategories",
                column: "PlaceId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PlaceCategories");

            migrationBuilder.DropTable(
                name: "Categories");
        }
    }
}
