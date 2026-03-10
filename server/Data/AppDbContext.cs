using Microsoft.EntityFrameworkCore;
using Server.Models; 

namespace Server.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
        {
        }

        public DbSet<User> Users { get; set; }
        public DbSet<Stock> Stocks { get; set; }
        public DbSet<PriceData> PriceData { get; set; }
        public DbSet<SentimentAnalysis> SentimentAnalyses { get; set; }
        public DbSet<ConfidenceScore> ConfidenceScores { get; set; }
        public DbSet<Alert> Alerts { get; set; }
        public DbSet<Watchlist> Watchlists { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            // Define Watchlist Pk
            modelBuilder.Entity<Watchlist>()
                .HasKey(w => new { w.UserId, w.StockId });

            // Define SentimentAnalysis Pk
            modelBuilder.Entity<SentimentAnalysis>()
                .HasKey(s => new { s.StockId, s.AnalyzedAt });

            modelBuilder.Entity<SentimentAnalysis>()
                .Property(s => s.SentimentScore)
                .HasColumnType("decimal(18,4)");  //4 digits

            modelBuilder.Entity<PriceData>()
                .Property(p => p.Price)
                .HasColumnType("decimal(18,2)"); //2 digits

            modelBuilder.Entity<Alert>()
                .Property(a => a.ThresholdValue)
                .HasColumnType("decimal(18,2)");

            // Ensure Symbol is unique in the Stocks table
            modelBuilder.Entity<Stock>()
                .HasIndex(s => s.Symbol)
                .IsUnique();

        }
    }
}