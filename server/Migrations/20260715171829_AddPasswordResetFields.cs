using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Server.Migrations
{
    /// <inheritdoc />
    public partial class AddPasswordResetFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_PriceData_StockId_RecordedAt",
                table: "PriceData");

            migrationBuilder.DropIndex(
                name: "IX_Alerts_IsActive_StockId",
                table: "Alerts");

            migrationBuilder.DropIndex(
                name: "IX_AlertEvents_UserId_CreatedAt",
                table: "AlertEvents");

            migrationBuilder.AddColumn<string>(
                name: "PasswordResetToken",
                table: "Users",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTime>(
                name: "PasswordResetTokenExpiry",
                table: "Users",
                type: "datetime2",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PasswordResetToken",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "PasswordResetTokenExpiry",
                table: "Users");

            migrationBuilder.CreateIndex(
                name: "IX_PriceData_StockId_RecordedAt",
                table: "PriceData",
                columns: new[] { "StockId", "RecordedAt" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Alerts_IsActive_StockId",
                table: "Alerts",
                columns: new[] { "IsActive", "StockId" });

            migrationBuilder.CreateIndex(
                name: "IX_AlertEvents_UserId_CreatedAt",
                table: "AlertEvents",
                columns: new[] { "UserId", "CreatedAt" });
        }
    }
}
