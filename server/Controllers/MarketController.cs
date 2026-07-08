using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Server.Config;
using Server.Data;
using Server.Models;
using Server.Services;
using System.Text.Json;

[Route("api/[controller]")]
[ApiController]
public class MarketController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly AlphaVantageOptions _options;

    public MarketController(
        AppDbContext context,
        IOptions<AlphaVantageOptions> options)
    {
        _context = context;
        _options = options.Value;
    }

    // GET: api/Market/overview
    [HttpGet("overview")]
    public async Task<IActionResult> GetOverview()
    {
        var mood = await BuildMoodAsync();
        var trending = await BuildTrendingAsync();
        var sources = await BuildSourcesAsync();
        var news = await BuildNewsAsync();
        var movers = await BuildMoversAsync();
        var retrievedAt = await GetRetrievedAtAsync();

        return Ok(new
        {
            mood,
            trending,
            sources,
            news,
            movers,
            retrievedAt
        });
    }

    // GET: api/Market/news?page=1
    [HttpGet("news")]
    public async Task<IActionResult> GetNews([FromQuery] int page = 1)
    {
        var news = await BuildNewsAsync();
        return Ok(news);
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
        // Top 5 stocks by number of watchlist additions.
        var topStocks = await _context.Watchlists
            .GroupBy(w => w.StockId)
            .Select(g => new { StockId = g.Key, Count = g.Count() })
            .OrderByDescending(x => x.Count)
            .Take(5)
            .ToListAsync();

        if (topStocks.Count == 0)
        {
            var fallbackStocks = await _context.Stocks
                .OrderBy(s => s.Symbol)
                .Select(s => new { StockId = s.StockId, Count = 0 })
                .Take(5)
                .ToListAsync();

            if (fallbackStocks.Count > 0)
            {
                topStocks = fallbackStocks;
            }
        }

        // If still no stocks, use configured symbols and local DB snapshots only.
        // Do not call Alpha Vantage here, otherwise overview traffic burns daily quota quickly.
        if (topStocks.Count == 0 && _options.Symbols?.Count > 0)
        {
            var trendingResults = new List<object>();
            var configuredSymbols = _options.Symbols.Take(5).ToList();
            
            foreach (var sym in configuredSymbols)
            {
                var symbol = sym.Trim().ToUpperInvariant();
                if (string.IsNullOrWhiteSpace(symbol))
                    continue;

                var stock = await _context.Stocks.FirstOrDefaultAsync(s => s.Symbol == symbol);
                var latestPrice = stock is null
                    ? null
                    : await _context.PriceData
                        .Where(p => p.StockId == stock.StockId)
                        .OrderByDescending(p => p.RecordedAt)
                        .Select(p => (decimal?)p.Price)
                        .FirstOrDefaultAsync();

                trendingResults.Add(new
                {
                    symbol = symbol,
                    name = stock?.CompanyName ?? symbol,
                    price = latestPrice ?? 0m,
                    changePercent = 0m,
                    mentions = 0,
                    sentimentScore = 0m,
                    sentimentLabel = "neutral"
                });
            }

            return trendingResults;
        }

        if (topStocks.Count == 0)
            return Array.Empty<object>();

        var topStockIds = topStocks.Select(x => x.StockId).ToList();

        var stocks = await _context.Stocks
            .Where(s => topStockIds.Contains(s.StockId))
            .ToListAsync();

        var sentimentMap = await _context.SentimentAnalyses
            .Where(s => topStockIds.Contains(s.StockId))
            .GroupBy(s => s.StockId)
            .Select(g => g.OrderByDescending(s => s.AnalyzedAt).First())
            .ToDictionaryAsync(s => s.StockId, s => s.SentimentScore);

        var priceData = await _context.PriceData
            .Where(p => topStockIds.Contains(p.StockId))
            .OrderByDescending(p => p.RecordedAt)
            .ToListAsync();

        var trending = topStocks
            .Select(x =>
            {
                var stock = stocks.FirstOrDefault(s => s.StockId == x.StockId);
                if (stock == null)
                    return null;

                var prices = priceData.Where(p => p.StockId == x.StockId).Take(2).ToList();
                var latestPrice = prices.Count > 0 ? prices[0].Price : 0m;
                var previousPrice = prices.Count > 1 ? prices[1].Price : latestPrice;
                var changePercent = previousPrice == 0m
                    ? 0m
                    : Math.Round((latestPrice - previousPrice) / previousPrice * 100, 2);

                var sentimentScore = sentimentMap.TryGetValue(x.StockId, out var score) ? score : 0m;
                var sentimentLabel = sentimentScore >= 0.6m ? "bullish"
                    : sentimentScore <= 0.4m ? "bearish"
                    : "neutral";

                return new
                {
                    symbol = stock.Symbol,
                    name = stock.CompanyName,
                    price = latestPrice,
                    changePercent,
                    mentions = x.Count,
                    sentimentScore,
                    sentimentLabel
                };
            })
            .Where(x => x != null)
            .ToList();

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

    private async Task<IEnumerable<object>> BuildSourcesAsync()
    {
        var rows = await _context.SentimentAnalyses
            .Select(sa => new { sa.SentimentScore, sa.Source })
            .AsNoTracking()
            .ToListAsync();
        var sourceGroups = rows
            .GroupBy(sa => GetSentimentChannel(sa.Source))
            .Select(g => new
            {
                Source = g.Key,
                Positive = g.Count(sa => sa.SentimentScore >= 0.2m),
                Neutral = g.Count(sa => Math.Abs(sa.SentimentScore) < 0.2m),
                Negative = g.Count(sa => sa.SentimentScore <= -0.2m),
                TotalPosts = g.Count()
            })
            .ToList();

        return sourceGroups.Select(g =>
        {
            var total = g.TotalPosts == 0 ? 1 : g.TotalPosts;
            var iconName = g.Source.Contains("Reddit", StringComparison.OrdinalIgnoreCase) ? "chatbubbles-outline"
                    : g.Source.Contains("Twitter", StringComparison.OrdinalIgnoreCase) ? "logo-twitter"
                    : "newspaper-outline";
            return new
            {
                source = g.Source,
                icon = iconName,
                positive = (int)Math.Round((double)g.Positive / total * 100),
                neutral = (int)Math.Round((double)g.Neutral / total * 100),
                negative = (int)Math.Round((double)g.Negative / total * 100),
                totalPosts = g.TotalPosts
            };
        });
    }

    private static string GetSentimentChannel(string? source)
    {
        if (string.IsNullOrWhiteSpace(source))
        {
            return "Other";
        }

        var sep = AlphaVantageStockIngestionService.SourceChannelSeparator;
        var i = source.IndexOf(sep);
        if (i >= 0)
        {
            return source[..i].Trim();
        }

        if (source.StartsWith("Reddit:", StringComparison.OrdinalIgnoreCase) ||
            source.StartsWith("Reddit -", StringComparison.OrdinalIgnoreCase))
        {
            return "Reddit";
        }

        if (source.Equals("Reddit", StringComparison.OrdinalIgnoreCase))
        {
            return "Reddit";
        }

        return source.Trim();
    }

    private static (string Title, string SourceLabel) GetNewsCardDisplay(SentimentAnalysis sa, string symbolFallback)
    {
        var sep = AlphaVantageStockIngestionService.SourceChannelSeparator;
        var i = sa.Source.IndexOf(sep);
        if (i >= 0)
        {
            var channel = sa.Source[..i].Trim();
            var headline = sa.Source[(i + 1)..].Trim();
            return (string.IsNullOrEmpty(headline) ? symbolFallback : headline, string.IsNullOrEmpty(channel) ? "News" : channel);
        }

        if (sa.Source.StartsWith("Reddit:", StringComparison.OrdinalIgnoreCase))
        {
            var headline = sa.Source["Reddit:".Length..].Trim();
            return (string.IsNullOrEmpty(headline) ? "Reddit discussion" : headline, "Reddit");
        }
        if (sa.Source.StartsWith("Reddit -", StringComparison.OrdinalIgnoreCase))
        {
            var headline = sa.Source["Reddit -".Length..].Trim();
            return (string.IsNullOrEmpty(headline) ? "Reddit discussion" : headline, "Reddit");
        }

        if (sa.Source.Equals("Reddit", StringComparison.OrdinalIgnoreCase))
        {
            return ("Reddit discussion", "Reddit");
        }

        return (string.IsNullOrEmpty(sa.Source) ? symbolFallback : sa.Source, "News");
    }

    private async Task<IEnumerable<object>> BuildNewsAsync()
    {
        var items = await _context.SentimentAnalyses
            .OrderByDescending(sa => sa.AnalyzedAt)
            .Join(_context.Stocks,
                sa => sa.StockId,
                s => s.StockId,
                (sa, s) => new { sa, s.Symbol })
            .Take(12)
            .ToListAsync();

        return items.Select((item, idx) =>
        {
            var (title, sourceLabel) = GetNewsCardDisplay(item.sa, item.Symbol);
            return new
            {
                id = $"sa-{item.sa.StockId}-{item.sa.AnalyzedAt:yyyyMMddHHmmss}-{idx}",
                title,
                summary = item.sa.SentimentLabel,
                source = sourceLabel,
                publishedAt = item.sa.AnalyzedAt,
                sentiment = item.sa.SentimentScore >= 0.2m ? "positive"
                    : item.sa.SentimentScore <= -0.2m ? "negative"
                    : "neutral",
                sentimentScore = item.sa.SentimentScore,
                relatedSymbols = new[] { item.Symbol },
                url = "#"
            };
        });
    }

    private async Task<DateTime> GetRetrievedAtAsync()
    {
        var latestPriceAt = await _context.PriceData
            .OrderByDescending(p => p.RecordedAt)
            .Select(p => (DateTime?)p.RecordedAt)
            .FirstOrDefaultAsync();

        var latestSentimentAt = await _context.SentimentAnalyses
            .OrderByDescending(s => s.AnalyzedAt)
            .Select(s => (DateTime?)s.AnalyzedAt)
            .FirstOrDefaultAsync();

        return new[]
            {
                latestPriceAt ?? DateTime.MinValue,
                latestSentimentAt ?? DateTime.MinValue,
            }
            .Max() switch
        {
            var dt when dt == DateTime.MinValue => DateTime.UtcNow,
            var dt => dt
        };
    }

    private async Task<List<Stock>> EnsureStocksExistAsync(IEnumerable<string> symbols)
    {
        var normalizedSymbols = symbols
            .Select(s => s.Trim().ToUpperInvariant())
            .Where(s => !string.IsNullOrEmpty(s))
            .Distinct()
            .ToList();

        var existing = await _context.Stocks
            .Where(s => normalizedSymbols.Contains(s.Symbol))
            .ToListAsync();

        var missing = normalizedSymbols.Except(existing.Select(s => s.Symbol)).ToList();
        foreach (var symbol in missing)
        {
            existing.Add(new Stock
            {
                Symbol = symbol,
                CompanyName = symbol,
                Sector = string.Empty
            });
        }

        if (missing.Count > 0)
        {
            _context.Stocks.AddRange(existing.Where(s => missing.Contains(s.Symbol)));
            await _context.SaveChangesAsync();
        }

        return existing;
    }

}

