using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Server.Migrations
{
    /// <inheritdoc />
    public partial class AddIngestionAndAlerting : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ThresholdValue",
                table: "Alerts");

            migrationBuilder.AddColumn<string>(
                name: "ConditionType",
                table: "Alerts",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Direction",
                table: "Alerts",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "Above");

            migrationBuilder.AddColumn<int>(
                name: "CooldownMinutes",
                table: "Alerts",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastTriggeredAt",
                table: "Alerts",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "PercentageThreshold",
                table: "Alerts",
                type: "decimal(18,2)",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ReferencePrice",
                table: "Alerts",
                type: "decimal(18,2)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReportKeyword",
                table: "Alerts",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "TargetPrice",
                table: "Alerts",
                type: "decimal(18,2)",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "VolatilityWindowMinutes",
                table: "Alerts",
                type: "int",
                nullable: true);

            migrationBuilder.DropColumn(
                name: "AlertType",
                table: "Alerts");

            migrationBuilder.CreateTable(
                name: "AlertEvents",
                columns: table => new
                {
                    AlertEventId = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    AlertId = table.Column<int>(type: "int", nullable: false),
                    UserId = table.Column<int>(type: "int", nullable: false),
                    StockId = table.Column<int>(type: "int", nullable: false),
                    ConditionType = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    TriggerValue = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    Details = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    IsRead = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AlertEvents", x => x.AlertEventId);
                });

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

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AlertEvents");

            migrationBuilder.DropIndex(
                name: "IX_PriceData_StockId_RecordedAt",
                table: "PriceData");

            migrationBuilder.DropIndex(
                name: "IX_Alerts_IsActive_StockId",
                table: "Alerts");

            migrationBuilder.DropColumn(
                name: "ConditionType",
                table: "Alerts");

            migrationBuilder.DropColumn(
                name: "CooldownMinutes",
                table: "Alerts");

            migrationBuilder.DropColumn(
                name: "LastTriggeredAt",
                table: "Alerts");

            migrationBuilder.DropColumn(
                name: "PercentageThreshold",
                table: "Alerts");

            migrationBuilder.DropColumn(
                name: "ReferencePrice",
                table: "Alerts");

            migrationBuilder.DropColumn(
                name: "ReportKeyword",
                table: "Alerts");

            migrationBuilder.DropColumn(
                name: "TargetPrice",
                table: "Alerts");

            migrationBuilder.DropColumn(
                name: "VolatilityWindowMinutes",
                table: "Alerts");

            migrationBuilder.AddColumn<decimal>(
                name: "ThresholdValue",
                table: "Alerts",
                type: "decimal(18,2)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "AlertType",
                table: "Alerts",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.DropColumn(
                name: "Direction",
                table: "Alerts");
        }
    }
}
