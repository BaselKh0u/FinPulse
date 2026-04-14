using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Server.Data;
using Server.Models;

[Route("api/[controller]")]
[ApiController]
public class StockController : ControllerBase
{
    private readonly AppDbContext _context;

    public StockController(AppDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<object>>> GetStocks()
    {
        var stocks = await _context.Stocks.ToListAsync();
        var items = new List<object>();
        foreach (var stock in stocks)
        {
            var latest = await _context.PriceData
                .Where(p => p.StockId == stock.StockId)
                .OrderByDescending(p => p.RecordedAt)
                .Take(2)
                .ToListAsync();

            var currentPrice = latest.FirstOrDefault()?.Price ?? 0m;
            var previous = latest.Skip(1).FirstOrDefault()?.Price ?? currentPrice;
            var change = currentPrice - previous;
            var changePercent = previous == 0 ? 0 : (change / previous) * 100m;

            items.Add(new
            {
                stockId = stock.StockId,
                symbol = stock.Symbol,
                name = stock.CompanyName,
                price = (double)currentPrice,
                change = (double)change,
                changePercent = (double)changePercent
            });
        }

        return Ok(items);
    }

    [HttpPost]
    public async Task<IActionResult> CreateStock(Stock stock)
    {
        if (await _context.Stocks.AnyAsync(s => s.Symbol == stock.Symbol))
        {
            return BadRequest(new { message = "Stock with this symbol already exists." });
        }

        _context.Stocks.Add(stock);
        await _context.SaveChangesAsync();

        return Ok(new { message = "Stock added successfully.", stockId = stock.StockId });
    }

    [HttpDelete("{symbol}")]
    public async Task<IActionResult> DeleteStock(string symbol)
    {
        var stock = await _context.Stocks.FirstOrDefaultAsync(s => s.Symbol == symbol.ToUpper());
        if (stock is null)
        {
            return NotFound(new { message = "Stock not found." });
        }

        _context.Stocks.Remove(stock);
        await _context.SaveChangesAsync();
        return Ok(new { message = "Stock removed successfully." });
    }

    [HttpGet("search")]
    public async Task<IActionResult> Search([FromQuery] string q)
    {
        var query = (q ?? string.Empty).Trim().ToUpper();
        var stocks = await _context.Stocks
            .Where(s => s.Symbol.Contains(query) || s.CompanyName.ToUpper().Contains(query))
            .Take(30)
            .ToListAsync();

        return Ok(stocks.Select(s => new
        {
            stockId = s.StockId,
            symbol = s.Symbol,
            name = s.CompanyName,
            price = 0,
            change = 0,
            changePercent = 0
        }));
    }

    [HttpGet("{symbol}/history")]
    public async Task<IActionResult> GetHistory(string symbol, [FromQuery] string range = "1M")
    {
        var stock = await _context.Stocks.FirstOrDefaultAsync(s => s.Symbol == symbol.ToUpper());
        if (stock is null)
        {
            return NotFound(new { message = "Stock not found." });
        }

        var from = GetRangeStart(range);
        var data = await _context.PriceData
            .Where(p => p.StockId == stock.StockId && p.RecordedAt >= from)
            .OrderBy(p => p.RecordedAt)
            .Select(p => (double)p.Price)
            .ToListAsync();

        return Ok(data);
    }

    [HttpGet("{symbol}/details")]
    public async Task<IActionResult> GetDetails(string symbol)
    {
        var stock = await _context.Stocks.FirstOrDefaultAsync(s => s.Symbol == symbol.ToUpper());
        if (stock is null)
        {
            return NotFound(new { message = "Stock not found." });
        }

        var priceData = await _context.PriceData
            .Where(p => p.StockId == stock.StockId)
            .OrderByDescending(p => p.RecordedAt)
            .Take(180)
            .ToListAsync();

        var ordered = priceData.OrderBy(p => p.RecordedAt).ToList();
        var latest = ordered.LastOrDefault();
        var previous = ordered.Count > 1 ? ordered[^2] : latest;

        var sentimentRows = await _context.SentimentAnalyses
            .Where(sa => sa.StockId == stock.StockId)
            .OrderByDescending(sa => sa.AnalyzedAt)
            .Take(100)
            .ToListAsync();
        var confidence = await _context.ConfidenceScores
            .Where(c => c.StockId == stock.StockId)
            .OrderByDescending(c => c.CalculatedAt)
            .Select(c => (double?)c.ConfidenceValue)
            .FirstOrDefaultAsync();

        var bullish = sentimentRows.Count(s => s.SentimentScore > 0.2m);
        var bearish = sentimentRows.Count(s => s.SentimentScore < -0.2m);
        var neutral = Math.Max(0, sentimentRows.Count - bullish - bearish);
        var sentimentAvg = sentimentRows.Count == 0 ? 0 : (double)sentimentRows.Average(s => s.SentimentScore);

        var chartData = ordered.Select(o => (double)o.Price).ToList();
        var stabilityScore = CalculateStabilityScore(chartData);
        var confidenceScore = (int)Math.Round(((confidence ?? 0.5) * 100));

        return Ok(new
        {
            symbol = stock.Symbol,
            name = stock.CompanyName,
            price = (double)(latest?.Price ?? 0m),
            change = (double)((latest?.Price ?? 0m) - (previous?.Price ?? latest?.Price ?? 0m)),
            changePercent = previous is null || previous.Price == 0
                ? 0
                : (double)(((latest?.Price ?? 0m) - previous.Price) / previous.Price * 100m),
            description = $"Live market profile for {stock.CompanyName}.",
            sector = string.IsNullOrWhiteSpace(stock.Sector) ? "N/A" : stock.Sector,
            industry = "N/A",
            employees = "N/A",
            headquarters = "N/A",
            stabilityScore,
            confidenceScore,
            keyStats = new
            {
                open = (double)(ordered.FirstOrDefault()?.Price ?? 0m),
                high = (double)(ordered.Count == 0 ? 0m : ordered.Max(p => p.Price)),
                low = (double)(ordered.Count == 0 ? 0m : ordered.Min(p => p.Price)),
                close = (double)(latest?.Price ?? 0m),
                volume = $"{(latest?.Volume ?? 0):N0}",
                avgVolume = $"{(ordered.Count == 0 ? 0 : ordered.Average(p => p.Volume)):N0}",
                marketCap = "N/A",
                peRatio = (double?)null,
                week52High = (double)(ordered.Count == 0 ? 0m : ordered.Max(p => p.Price)),
                week52Low = (double)(ordered.Count == 0 ? 0m : ordered.Min(p => p.Price)),
                dividend = "N/A",
                beta = 1.0
            },
            sentiment = new
            {
                bullish,
                bearish,
                neutral,
                score = sentimentAvg,
                mentions = sentimentRows.Count,
                trending = sentimentRows.Count > 20
            },
            news = sentimentRows.Take(8).Select((s, index) => new
            {
                id = $"{stock.Symbol}-{index}-{s.AnalyzedAt:yyyyMMddHHmmss}",
                title = s.Source,
                source = "Social/News",
                publishedAt = s.AnalyzedAt,
                url = "#",
                sentiment = s.SentimentScore > 0.2m ? "positive" : s.SentimentScore < -0.2m ? "negative" : "neutral"
            }),
            chartData
        });
    }

    private static DateTime GetRangeStart(string range)
    {
        var now = DateTime.UtcNow;
        return range.ToUpper() switch
        {
            "1D" => now.AddDays(-1),
            "1W" => now.AddDays(-7),
            "1M" => now.AddMonths(-1),
            "3M" => now.AddMonths(-3),
            "1Y" => now.AddYears(-1),
            _ => now.AddYears(-10)
        };
    }

    private static int CalculateStabilityScore(List<double> prices)
    {
        if (prices.Count < 2)
        {
            return 50;
        }

        var returns = new List<double>();
        for (var i = 1; i < prices.Count; i++)
        {
            if (prices[i - 1] == 0)
            {
                continue;
            }

            returns.Add((prices[i] - prices[i - 1]) / prices[i - 1]);
        }

        if (returns.Count == 0)
        {
            return 50;
        }

        var avg = returns.Average();
        var variance = returns.Select(r => (r - avg) * (r - avg)).Average();
        var stdDevPercent = Math.Sqrt(variance) * 100;

        var normalized = Math.Clamp(100 - (stdDevPercent * 12), 0, 100);
        return (int)Math.Round(normalized);
    }
}