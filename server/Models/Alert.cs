using System.ComponentModel.DataAnnotations;

namespace Server.Models
{
    public enum AlertConditionType
    {
        PriceTarget = 1,
        PercentVolatility = 2,
        ReportReleased = 3
    }

    public enum AlertDirection
    {
        Above = 1,
        Below = 2
    }

    public class Alert
    {
        [Key]
        public int AlertId { get; set; } // PK
        public int UserId { get; set; } // FK
        public int StockId { get; set; } // FK
        public AlertConditionType ConditionType { get; set; }
        public AlertDirection Direction { get; set; } = AlertDirection.Above;
        public decimal? TargetPrice { get; set; }
        public decimal? PercentageThreshold { get; set; }
        public int? VolatilityWindowMinutes { get; set; }
        public decimal? ReferencePrice { get; set; }
        public string? ReportKeyword { get; set; }
        public string Message { get; set; } = string.Empty;
        public bool IsActive { get; set; } = true;
        public int CooldownMinutes { get; set; } = 60;
        public DateTime? LastTriggeredAt { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.Now;
    }
}