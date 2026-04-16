namespace Server.Models
{
    public class SentimentAnalysis
    {
        public int SentimentId { get; set; }
        public int StockId { get; set; } // קישור למניה
        public decimal SentimentScore { get; set; } // ציון בין 1- ל-1
        public string SentimentLabel { get; set; } = string.Empty; // "Positive", "Negative", "Neutral"
        public string Source { get; set; } = string.Empty; // למשל: Twitter, Reddit
        public DateTime AnalyzedAt { get; set; } = DateTime.Now;
    }
}
