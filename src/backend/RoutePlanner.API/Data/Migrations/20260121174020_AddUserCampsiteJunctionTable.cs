using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RoutePlanner.API.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddUserCampsiteJunctionTable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "UserCampsites",
                columns: table => new
                {
                    UserId = table.Column<int>(type: "integer", nullable: false),
                    CampsiteId = table.Column<int>(type: "integer", nullable: false),
                    AddedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserCampsites", x => new { x.UserId, x.CampsiteId });
                    table.ForeignKey(
                        name: "FK_UserCampsites_Campsites_CampsiteId",
                        column: x => x.CampsiteId,
                        principalTable: "Campsites",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_UserCampsites_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_UserCampsites_CampsiteId",
                table: "UserCampsites",
                column: "CampsiteId");

            migrationBuilder.CreateIndex(
                name: "IX_UserCampsites_UserId",
                table: "UserCampsites",
                column: "UserId");

            // Data migration: Link existing campsites to default user (ID: 1)
            migrationBuilder.Sql(@"
                INSERT INTO ""UserCampsites"" (""UserId"", ""CampsiteId"", ""AddedAt"")
                SELECT 1, ""Id"", CURRENT_TIMESTAMP
                FROM ""Campsites""
                WHERE NOT EXISTS (
                    SELECT 1 FROM ""UserCampsites""
                    WHERE ""UserCampsites"".""CampsiteId"" = ""Campsites"".""Id""
                );
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "UserCampsites");
        }
    }
}
