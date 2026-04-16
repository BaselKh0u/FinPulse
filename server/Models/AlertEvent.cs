using System.ComponentModel.DataAnnotations;

namespace Server.Models
{
    public class AlertEvent
    {
        [Key]
        public int AlertEventId { get; set; }
        public int AlertId { get; set; }
        public int UserId { get; set; }
        public int StockId { get; set; }
        public AlertConditionType ConditionType { get; set; }
        public decimal? TriggerValue { get; set; }
        public string Details { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public bool IsRead { get; set; } = false;
    }
}
