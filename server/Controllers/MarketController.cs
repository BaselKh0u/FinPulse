using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Server.Data;

[Route("api/[controller]")]
[ApiController]
public class MarketController : ControllerBase
{
    private readonly AppDbContext _context;

    public MarketController(AppDbContext context)
    {
        _context = context;
    }

    // GET: api/Market/overview
    [HttpGet("overview")]
    public async Task<IActionResult> GetOverview()
    {
        var mood = await BuildMoodAsync();
        var trending = await BuildTrendingAsync();
        var movers = await BuildMoversAsync();

        return Ok(new
        {
            mood,
            trending,
            news = Array.Empty<object>(),
            movers
        });
    }

    // GET: api/Market/news?page=1
    [HttpGet("news")]
    public IActionResult GetNews([FromQuery] int page = 1)
    {
        // TODO: Populate when partner connects the news API
        return Ok(new { items = Array.Empty<object>(), totalCount = 0, page });
    }

    // --- private helpers ---

    private async Task<object> BuildMoodAsync()
    {
        // Get the latest SentimentAnalysis per stock
        var latestScores = await _context.SentimentAnalyses
            .GroupBy(s => s.StockId)
            .Select(g => g.OrderByDescending(s => s.AnalyzedAt).First())
            .ToListAsync();

        if (latestScores.Count == 0)
        {
            return new
            {
                score = 0.5,
                label = "Neutral",
                summary = "Market sentiment based on analyzed data",
                updatedAt = DateTime.UtcNow
            };
        }

        // SentimentScore is -1 to 1; normalise to 0-1
        var avgRaw = (double)latestScores.Average(s => s.SentimentScore);
        var score = Math.Round((avgRaw + 1.0) / 2.0, 4);
        var label = score > 0.6 ? "Bullish" : score < 0.4 ? "Bearish" : "Neutral";
        var updatedAt = latestScores.Max(s => s.AnalyzedAt);

        return new { score, label, summary = "Market sentiment based on analyzed data", updatedAt };
    }

    private async Task<object> BuildTrendingAsync()
    {
        // Top 5 stocks by number of watchlist additions
        var topStockIds = await _context.Watchlists
            .GroupBy(w => w.StockId)
            .OrderByDescending(g => g.Count())
            .Take(5)
            .Select(g => g.Key)
            .ToListAsync();

        if (topStockIds.Count == 0)
            return Array.Empty<object>();

        var stocks = await _context.Stocks
            .Where(s => topStockIds.Contains(s.StockId))
            .ToListAsync();

        // Latest sentiment score per stock
        var sentimentMap = await _context.SentimentAnalyses
            .Where(s => topStockIds.Contains(s.StockId))
            .GroupBy(s => s.StockId)
            .Select(g => g.OrderByDescending(s => s.AnalyzedAt).First())
            .ToDictionaryAsync(s => s.StockId, s => s.SentimentScore);

        // Preserve the watchlist-count ordering
        var trending = topStockIds
            .Select(id => stocks.First(s => s.StockId == id))
            .Select(s => new
            {
                symbol = s.Symbol,
                companyName = s.CompanyName,
                sentiment = sentimentMap.TryGetValue(s.StockId, out var score) ? score : 0m
            });

        return trending;
    }

    private async Task<object> BuildMoversAsync()
    {
        // Need at least 2 price records per stock to calculate change
        var stocksWithPrices = await _context.PriceData
            .GroupBy(p => p.StockId)
            .Where(g => g.Count() >= 2)
            .Select(g => g.Key)
            .ToListAsync();

        if (stocksWithPrices.Count == 0)
            return Array.Empty<object>();

        var recentPrices = await _context.PriceData
            .Where(p => stocksWithPrices.Contains(p.StockId))
            .OrderByDescending(p => p.RecordedAt)
            .ToListAsync();

        var top2PerStock = recentPrices
            .GroupBy(p => p.StockId)
            .Where(g => g.Count() >= 2)
            .Select(g =>
            {
                var ordered = g.Take(2).ToList();
                var latest = ordered[0].Price;
                var previous = ordered[1].Price;
                var changePct = previous == 0m ? 0m : Math.Round((latest - previous) / previous * 100, 2);
                return new { StockId = g.Key, ChangePct = changePct };
            })
            .OrderByDescending(x => Math.Abs(x.ChangePct))
            .Take(5)
            .ToList();

        var moverStockIds = top2PerStock.Select(x => x.StockId).ToList();

        var stocks = await _context.Stocks
            .Where(s => moverStockIds.Contains(s.StockId))
            .ToDictionaryAsync(s => s.StockId);

        var sentimentMap = await _context.SentimentAnalyses
            .Where(s => moverStockIds.Contains(s.StockId))
            .GroupBy(s => s.StockId)
            .Select(g => g.OrderByDescending(s => s.AnalyzedAt).First())
            .ToDictionaryAsync(s => s.StockId, s => s.SentimentScore);

        var movers = top2PerStock
            .Where(x => stocks.ContainsKey(x.StockId))
            .Select(x => new
            {
                symbol = stocks[x.StockId].Symbol,
                direction = x.ChangePct >= 0 ? "up" : "down",
                change = Math.Abs(x.ChangePct),
                currentScore = sentimentMap.TryGetValue(x.StockId, out var score) ? score : 0m
            });

        return movers;
    }
}
