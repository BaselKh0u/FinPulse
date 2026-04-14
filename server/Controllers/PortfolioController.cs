using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Server.Data;

[Route("portfolio")]
[Route("api/[controller]")]
[ApiController]
public class PortfolioController : ControllerBase
{
    private readonly AppDbContext _context;

    public PortfolioController(AppDbContext context)
    {
        _context = context;
    }

    [HttpGet("summary")]
    public async Task<IActionResult> GetSummary([FromQuery] int userId)
    {
        var resolvedUserId = ResolveUserId(userId);
        if (resolvedUserId <= 0)
        {
            return BadRequest(new { message = "Missing user id." });
        }

        var watchlist = await _context.Watchlists
            .Where(w => w.UserId == resolvedUserId)
            .ToListAsync();

        if (watchlist.Count == 0)
        {
            return Ok(new { totalBalance = 0d, todayChange = 0d, todayChangePercent = 0d });
        }

        var stockIds = watchlist.Select(w => w.StockId).Distinct().ToList();
        var prices = await _context.PriceData
            .Where(p => stockIds.Contains(p.StockId))
            .OrderByDescending(p => p.RecordedAt)
            .ToListAsync();

        decimal currentTotal = 0m;
        decimal previousTotal = 0m;

        foreach (var stockId in stockIds)
        {
            var latestTwo = prices.Where(p => p.StockId == stockId).Take(2).ToList();
            var current = latestTwo.FirstOrDefault()?.Price ?? 0m;
            var previous = latestTwo.Skip(1).FirstOrDefault()?.Price ?? current;
            currentTotal += current;
            previousTotal += previous;
        }

        var todayChange = currentTotal - previousTotal;
        var todayChangePercent = previousTotal == 0m ? 0m : (todayChange / previousTotal) * 100m;

        return Ok(new
        {
            totalBalance = (double)currentTotal,
            todayChange = (double)todayChange,
            todayChangePercent = (double)todayChangePercent
        });
    }

    private int ResolveUserId(int userIdFromQuery)
    {
        if (userIdFromQuery > 0)
        {
            return userIdFromQuery;
        }

        if (Request.Headers.TryGetValue("Authorization", out var authHeader))
        {
            var token = authHeader.ToString().Replace("Bearer ", string.Empty).Trim();
            if (token.StartsWith("server-session-", StringComparison.OrdinalIgnoreCase) &&
                int.TryParse(token["server-session-".Length..], out var tokenUserId))
            {
                return tokenUserId;
            }
        }

        if (Request.Headers.TryGetValue("X-User-Id", out var headerValue) &&
            int.TryParse(headerValue.ToString(), out var headerId))
        {
            return headerId;
        }

        return 0;
    }
}
