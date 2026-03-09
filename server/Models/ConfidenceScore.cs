using System;

namespace Server.Models
{
    public class ConfidenceScore
    {
        public int ConfidenceId { get; set; } // PK
        public int StockId { get; set; } // FK
        public float ConfidenceValue { get; set; }  // algorithm score
        public DateTime CalculatedAt { get; set; } = DateTime.Now;
    }
}