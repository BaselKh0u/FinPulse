namespace Server.Models
{
    public class PriceData
    {
        public int PriceId { get; set; } // PK
        public int StockId { get; set; } // FK
        public decimal Price { get; set; }
        public long Volume { get; set; } // נפח מסחר
        public DateTime RecordedAt { get; set; } = DateTime.Now;
    }
}