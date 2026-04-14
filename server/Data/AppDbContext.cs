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
        public DbSet<AlertEvent> AlertEvents { get; set; }
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
                .Property(a => a.ConditionType)
                .HasConversion<string>();

            modelBuilder.Entity<Alert>()
                .Property(a => a.Direction)
                .HasConversion<string>();

            modelBuilder.Entity<Alert>()
                .Property(a => a.TargetPrice)
                .HasColumnType("decimal(18,2)");

            modelBuilder.Entity<Alert>()
                .Property(a => a.PercentageThreshold)
                .HasColumnType("decimal(18,2)");

            modelBuilder.Entity<Alert>()
                .Property(a => a.ReferencePrice)
                .HasColumnType("decimal(18,2)");

            // Ensure Symbol is unique in the Stocks table
            modelBuilder.Entity<Stock>()
                .HasIndex(s => s.Symbol)
                .IsUnique();

            modelBuilder.Entity<PriceData>()
                .HasIndex(p => new { p.StockId, p.RecordedAt })
                .IsUnique();

            modelBuilder.Entity<Alert>()
                .HasIndex(a => new { a.IsActive, a.StockId });

            modelBuilder.Entity<AlertEvent>()
                .Property(ae => ae.ConditionType)
                .HasConversion<string>();

            modelBuilder.Entity<AlertEvent>()
                .Property(ae => ae.TriggerValue)
                .HasColumnType("decimal(18,2)");

            modelBuilder.Entity<AlertEvent>()
                .HasIndex(ae => new { ae.UserId, ae.CreatedAt });

        }
    }
}