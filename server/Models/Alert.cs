using System.ComponentModel.DataAnnotations;

namespace Server.Models
{
    public class Alert
    {
        [Key]
        public int AlertId { get; set; } // PK
        public int UserId { get; set; } // FK
        public int StockId { get; set; } // FK
        public string AlertType { get; set; } = string.Empty; // למשל: "Price Drop", "High Sentiment"
        public decimal ThresholdValue { get; set; } // ערך הסף להפעלת ההתראה
        public string Message { get; set; } = string.Empty;
        public bool IsActive { get; set; } = true;
        public DateTime CreatedAt { get; set; } = DateTime.Now;
    }
}