namespace Server.Models
{
    public class Watchlist
    {
        public int UserId { get; set; }
        public int StockId { get; set; }
        public DateTime AddedAt { get; set; } = DateTime.Now;

        public User User { get; set; } = null!;
        public Stock Stock { get; set; } = null!;
    }
}