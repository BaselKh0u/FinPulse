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

    [HttpGet("overview")]
    public async Task<IActionResult> GetOverview()
    {
        var recentSentiment = await _context.SentimentAnalyses
            .OrderByDescending(s => s.AnalyzedAt)
            .Take(250)
            .ToListAsync();

        var moodScore = recentSentiment.Count == 0
            ? 0.5
            : Math.Clamp((double)recentSentiment.Average(s => s.SentimentScore) / 2 + 0.5, 0, 1);

        var moodLabel = moodScore switch
        {
            >= 0.8 => "Extreme Greed",
            >= 0.6 => "Greed",
            >= 0.4 => "Neutral",
            >= 0.2 => "Fear",
            _ => "Extreme Fear"
        };

        var trending = await _context.Stocks
            .Take(12)
            .Select(s => new
            {
                s.StockId,
                s.Symbol,
                Name = s.CompanyName
            })
            .ToListAsync();

        var trendingPayload = new List<TrendingRow>();
        foreach (var stock in trending)
        {
            var latestPrice = await _context.PriceData
                .Where(p => p.StockId == stock.StockId)
                .OrderByDescending(p => p.RecordedAt)
                .Take(2)
                .ToListAsync();

            var current = latestPrice.FirstOrDefault()?.Price ?? 0m;
            var previous = latestPrice.Skip(1).FirstOrDefault()?.Price ?? current;
            var changePct = previous == 0m ? 0m : ((current - previous) / previous) * 100m;

            var stockSentiment = await _context.SentimentAnalyses
                .Where(s => s.StockId == stock.StockId)
                .OrderByDescending(s => s.AnalyzedAt)
                .Take(40)
                .ToListAsync();

            var sentimentScore = stockSentiment.Count == 0 ? 0 : stockSentiment.Average(s => s.SentimentScore);
            var sentimentLabel = sentimentScore > 0.2m ? "bullish" : sentimentScore < -0.2m ? "bearish" : "neutral";

            trendingPayload.Add(new TrendingRow
            {
                symbol = stock.Symbol,
                name = stock.Name,
                price = (double)current,
                changePercent = (double)changePct,
                mentions = stockSentiment.Count,
                sentimentScore = (double)sentimentScore,
                sentimentLabel = sentimentLabel
            });
        }

        var topRows = recentSentiment
            .GroupBy(s => s.Source)
            .Select(g => new
            {
                source = g.Key,
                total = g.Count(),
                positive = g.Count(x => x.SentimentScore > 0.2m),
                neutral = g.Count(x => x.SentimentScore <= 0.2m && x.SentimentScore >= -0.2m),
                negative = g.Count(x => x.SentimentScore < -0.2m)
            })
            .OrderByDescending(x => x.total)
            .Take(3)
            .ToList();

        var sources = topRows.Select(row => new
        {
            source = row.source,
            icon = SourceToIcon(row.source),
            positive = row.total == 0 ? 0 : (int)Math.Round(row.positive * 100.0 / row.total),
            neutral = row.total == 0 ? 0 : (int)Math.Round(row.neutral * 100.0 / row.total),
            negative = row.total == 0 ? 0 : (int)Math.Round(row.negative * 100.0 / row.total),
            totalPosts = row.total
        });

        var movers = trendingPayload
            .Select(t => new
            {
                symbol = t.symbol,
                name = t.name,
                previousScore = Math.Max(-1, Math.Min(1, t.sentimentScore - 0.12)),
                currentScore = t.sentimentScore,
                change = 0.12,
                direction = t.sentimentScore >= 0 ? "up" : "down"
            })
            .Take(6)
            .ToList();

        var news = recentSentiment.Take(20).Select((s, i) => new
        {
            id = $"news-{i}-{s.AnalyzedAt:yyyyMMddHHmmss}",
            title = s.Source,
            summary = $"Signal collected for stock #{s.StockId} with score {s.SentimentScore:F2}.",
            source = s.Source,
            publishedAt = s.AnalyzedAt,
            sentiment = s.SentimentScore > 0.2m ? "positive" : s.SentimentScore < -0.2m ? "negative" : "neutral",
            sentimentScore = (double)s.SentimentScore,
            relatedSymbols = _context.Stocks.Where(st => st.StockId == s.StockId).Select(st => st.Symbol).Take(1).ToList(),
            url = "#"
        });

        return Ok(new
        {
            mood = new
            {
                score = moodScore,
                label = moodLabel,
                change = 0.03,
                updatedAt = DateTime.UtcNow
            },
            trending = trendingPayload,
            sources,
            movers,
            news
        });
    }

    [HttpGet("news")]
    public async Task<IActionResult> GetNews([FromQuery] int page = 1)
    {
        var pageSize = 20;
        var skip = Math.Max(0, page - 1) * pageSize;

        var rows = await _context.SentimentAnalyses
            .OrderByDescending(s => s.AnalyzedAt)
            .Skip(skip)
            .Take(pageSize)
            .ToListAsync();

        var payload = rows.Select((s, i) => new
        {
            id = $"n-{page}-{i}-{s.AnalyzedAt:yyyyMMddHHmmss}",
            title = s.Source,
            summary = $"Social/news event with score {s.SentimentScore:F2}.",
            source = s.Source,
            publishedAt = s.AnalyzedAt,
            sentiment = s.SentimentScore > 0.2m ? "positive" : s.SentimentScore < -0.2m ? "negative" : "neutral",
            sentimentScore = (double)s.SentimentScore,
            relatedSymbols = _context.Stocks.Where(st => st.StockId == s.StockId).Select(st => st.Symbol).Take(1).ToList(),
            url = "#"
        });

        return Ok(payload);
    }

    private static string SourceToIcon(string source)
    {
        var value = source.ToLowerInvariant();
        if (value.Contains("reddit"))
        {
            return "logo-reddit";
        }

        if (value.Contains("twitter") || value.Contains("x.com") || value.Contains("tweet"))
        {
            return "logo-twitter";
        }

        return "newspaper-outline";
    }

    private sealed class TrendingRow
    {
        public string symbol { get; set; } = string.Empty;
        public string name { get; set; } = string.Empty;
        public double price { get; set; }
        public double changePercent { get; set; }
        public int mentions { get; set; }
        public double sentimentScore { get; set; }
        public string sentimentLabel { get; set; } = "neutral";
    }
}
