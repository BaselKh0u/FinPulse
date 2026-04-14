using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Server.Data;
using Server.Models;
using System.Security.Claims;

[Route("api/[controller]")]
[ApiController]
public class StockController : ControllerBase
{
    private readonly AppDbContext _context;

    public StockController(AppDbContext context)
    {
        _context = context;
    }

    private int GetUserId() => int.Parse(User.FindFirst("userId")!.Value);

    // GET: api/Stock
    // Returns the logged-in user's watchlist with latest price for each stock
    [Authorize]
    [HttpGet]
    public async Task<IActionResult> GetWatchlist()
    {
        var userId = GetUserId();

        var watchlist = await _context.Watchlists
            .Where(w => w.UserId == userId)
            .Join(_context.Stocks,
                w => w.StockId,
                s => s.StockId,
                (w, s) => new { w.AddedAt, Stock = s })
            .ToListAsync();

        var stockIds = watchlist.Select(w => w.Stock.StockId).ToList();

        // Fetch latest PriceData for each stock in one query
        var latestPrices = await _context.PriceData
            .Where(p => stockIds.Contains(p.StockId))
            .GroupBy(p => p.StockId)
            .Select(g => g.OrderByDescending(p => p.RecordedAt).First())
            .ToListAsync();

        var priceMap = latestPrices.ToDictionary(p => p.StockId);

        var result = watchlist.Select(w =>
        {
            priceMap.TryGetValue(w.Stock.StockId, out var price);
            return new
            {
                stockId = w.Stock.StockId,
                symbol = w.Stock.Symbol,
                companyName = w.Stock.CompanyName,
                sector = w.Stock.Sector,
                price = price?.Price ?? 0,
                volume = price?.Volume ?? 0,
                addedAt = w.AddedAt
            };
        });

        return Ok(result);
    }

    // POST: api/Stock
    // Add a stock to the user's watchlist by symbol
    [Authorize]
    [HttpPost]
    public async Task<IActionResult> AddToWatchlist([FromBody] AddStockRequest request)
    {
        var userId = GetUserId();

        var symbol = request.Symbol.ToUpper();

        var stock = await _context.Stocks.FirstOrDefaultAsync(s => s.Symbol == symbol);
        if (stock == null)
        {
            stock = new Stock { Symbol = symbol };
            _context.Stocks.Add(stock);
            await _context.SaveChangesAsync();
        }

        var alreadyInWatchlist = await _context.Watchlists
            .AnyAsync(w => w.UserId == userId && w.StockId == stock.StockId);

        if (alreadyInWatchlist)
            return BadRequest(new { message = "Stock is already in your watchlist." });

        _context.Watchlists.Add(new Watchlist { UserId = userId, StockId = stock.StockId });
        await _context.SaveChangesAsync();

        return Ok(new { message = "Stock added to watchlist.", stockId = stock.StockId });
    }

    // DELETE: api/Stock/{symbol}
    // Remove a stock from the user's watchlist
    [Authorize]
    [HttpDelete("{symbol}")]
    public async Task<IActionResult> RemoveFromWatchlist(string symbol)
    {
        var userId = GetUserId();

        var stock = await _context.Stocks.FirstOrDefaultAsync(s => s.Symbol == symbol.ToUpper());
        if (stock == null)
            return NotFound(new { message = "Stock not found." });

        var entry = await _context.Watchlists
            .FirstOrDefaultAsync(w => w.UserId == userId && w.StockId == stock.StockId);

        if (entry == null)
            return NotFound(new { message = "Stock is not in your watchlist." });

        _context.Watchlists.Remove(entry);
        await _context.SaveChangesAsync();

        return Ok(new { message = "Stock removed from watchlist." });
    }

    // GET: api/Stock/search?q={query}
    [HttpGet("search")]
    public async Task<IActionResult> Search([FromQuery] string q)
    {
        if (string.IsNullOrWhiteSpace(q))
            return Ok(Array.Empty<object>());

        var term = q.Trim().ToUpper();

        var results = await _context.Stocks
            .Where(s => s.Symbol.ToUpper().Contains(term) || s.CompanyName.ToUpper().Contains(term))
            .Select(s => new
            {
                stockId = s.StockId,
                symbol = s.Symbol,
                companyName = s.CompanyName,
                sector = s.Sector
            })
            .ToListAsync();

        return Ok(results);
    }

    // GET: api/Stock/{symbol}/details
    [HttpGet("{symbol}/details")]
    public async Task<IActionResult> GetDetails(string symbol)
    {
        var stock = await _context.Stocks.FirstOrDefaultAsync(s => s.Symbol == symbol.ToUpper());
        if (stock == null)
            return NotFound(new { message = "Stock not found." });

        var priceHistory = await _context.PriceData
            .Where(p => p.StockId == stock.StockId)
            .OrderByDescending(p => p.RecordedAt)
            .Take(30)
            .Select(p => new { price = p.Price, volume = p.Volume, recordedAt = p.RecordedAt })
            .ToListAsync();

        var latestPrice = priceHistory.FirstOrDefault();

        return Ok(new
        {
            stockId = stock.StockId,
            symbol = stock.Symbol,
            companyName = stock.CompanyName,
            sector = stock.Sector,
            latestPrice = latestPrice?.price ?? 0,
            priceHistory
        });
    }

    // GET: api/Stock/{symbol}/chart?range={range}
    [HttpGet("{symbol}/chart")]
    public async Task<IActionResult> GetChart(string symbol, [FromQuery] string range = "1M")
    {
        var stock = await _context.Stocks.FirstOrDefaultAsync(s => s.Symbol == symbol.ToUpper());
        if (stock == null)
            return NotFound(new { message = "Stock not found." });

        var cutoff = range switch
        {
            "1D"  => DateTime.UtcNow.AddHours(-24),
            "1W"  => DateTime.UtcNow.AddDays(-7),
            "1M"  => DateTime.UtcNow.AddDays(-30),
            "3M"  => DateTime.UtcNow.AddDays(-90),
            "1Y"  => DateTime.UtcNow.AddDays(-365),
            "ALL" => DateTime.MinValue,
            _     => DateTime.UtcNow.AddDays(-30)
        };

        var labelFormat = range switch
        {
            "1D" => "HH:mm",
            "1W" => "ddd dd",
            _    => "MMM dd"
        };

        var points = await _context.PriceData
            .Where(p => p.StockId == stock.StockId && p.RecordedAt >= cutoff)
            .OrderBy(p => p.RecordedAt)
            .Select(p => new { p.Price, p.RecordedAt })
            .ToListAsync();

        var result = points.Select(p => new
        {
            label = p.RecordedAt.ToString(labelFormat),
            value = p.Price
        });

        return Ok(result);
    }
}

public record AddStockRequest(string Symbol);
