using Microsoft.EntityFrameworkCore;
using Server.Data;
using Server.Services;

namespace Server.BackgroundJobs;

/// <summary>
/// Fetches live Yahoo quotes every few minutes for symbols that appear in any user's watchlist.
/// Provides the "real-time" tier (Level 3) of the tiered ingestion architecture:
///   Level 2 — 30 configured symbols, every 15 min (StockQuoteIngestionJob)
///   Level 3 — watchlist symbols, every 3 min (this job)
/// </summary>
public class WatchlistRealtimeQuoteJob : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(3);
    private static readonly TimeSpan StartupDelay = TimeSpan.FromSeconds(30);

    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<WatchlistRealtimeQuoteJob> _logger;

    public WatchlistRealtimeQuoteJob(
        IServiceProvider serviceProvider,
        ILogger<WatchlistRealtimeQuoteJob> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(StartupDelay, stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RefreshWatchlistQuotesAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Watchlist real-time quote job failed.");
            }

            try
            {
                await Task.Delay(Interval, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
        }
    }

    private async Task RefreshWatchlistQuotesAsync(CancellationToken ct)
    {
        using var scope = _serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var marketData = scope.ServiceProvider.GetRequiredService<IStockMarketDataService>();

        // Get all distinct stocks currently in any user's watchlist
        var watchlistStocks = await db.Watchlists
            .Include(w => w.Stock)
            .Where(w => w.Stock != null && !string.IsNullOrWhiteSpace(w.Stock.Symbol))
            .Select(w => w.Stock!)
            .Distinct()
            .ToListAsync(ct);

        if (watchlistStocks.Count == 0)
            return;

        _logger.LogInformation(
            "Watchlist real-time job: refreshing {Count} symbols: {Symbols}",
            watchlistStocks.Count,
            string.Join(", ", watchlistStocks.Select(s => s.Symbol)));

        foreach (var stock in watchlistStocks)
        {
            if (ct.IsCancellationRequested) break;
            await marketData.RefreshQuoteIfStaleAsync(db, stock, ct);
        }
    }
}
