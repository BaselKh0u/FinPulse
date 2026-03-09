namespace Server.Models
{
    public class Stock
    {
        public int StockId { get; set; } // PK
        public string Symbol { get; set; } = string.Empty; // (Unique)
        public string CompanyName { get; set; } = string.Empty;
        public string Sector { get; set; } = string.Empty;
    }
}
