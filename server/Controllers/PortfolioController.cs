using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Server.Data;
using System.Security.Claims;

[Route("api/[controller]")]
[ApiController]
[Authorize]
public class PortfolioController : ControllerBase
{
    private readonly AppDbContext _context;

    public PortfolioController(AppDbContext context)
    {
        _context = context;
    }

    private int GetUserId() => int.Parse(User.FindFirst("userId")!.Value);

    // GET: api/Portfolio/summary
    [HttpGet("summary")]
    public async Task<IActionResult> GetSummary()
    {
        var userId = GetUserId();

        var stockIds = await _context.Watchlists
            .Where(w => w.UserId == userId)
            .Select(w => w.StockId)
            .ToListAsync();

        if (stockIds.Count == 0)
            return Ok(new { totalBalance = 0m, todayChange = 0m, todayChangePercent = 0m });

        // Fetch the two most recent price entries per stock
        var recentPrices = await _context.PriceData
            .Where(p => stockIds.Contains(p.StockId))
            .OrderByDescending(p => p.RecordedAt)
            .ToListAsync();

        var top2PerStock = recentPrices
            .GroupBy(p => p.StockId)
            .ToDictionary(
                g => g.Key,
                g => g.Take(2).ToList()
            );

        var totalBalance = 0m;
        var previousTotal = 0m;

        foreach (var (_, prices) in top2PerStock)
        {
            var latest = prices[0].Price;
            var previous = prices.Count > 1 ? prices[1].Price : latest;

            totalBalance += latest;
            previousTotal += previous;
        }

        var todayChange = totalBalance - previousTotal;
        var todayChangePercent = previousTotal == 0m
            ? 0m
            : Math.Round(todayChange / previousTotal * 100, 2);

        return Ok(new
        {
            totalBalance = Math.Round(totalBalance, 2),
            todayChange = Math.Round(todayChange, 2),
            todayChangePercent
        });
    }
}
