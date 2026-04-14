using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Server.Data;
using Server.Models;

[Route("api/[controller]")]
[ApiController]
public class AlertsController : ControllerBase
{
    private readonly AppDbContext _context;

    public AlertsController(AppDbContext context)
    {
        _context = context;
    }

    [HttpGet("user/{userId:int}")]
    public async Task<ActionResult<IEnumerable<Alert>>> GetUserAlerts(int userId)
    {
        var alerts = await _context.Alerts
            .Where(a => a.UserId == userId)
            .OrderByDescending(a => a.CreatedAt)
            .ToListAsync();

        var stockLookup = await _context.Stocks
            .Where(s => alerts.Select(a => a.StockId).Contains(s.StockId))
            .ToDictionaryAsync(s => s.StockId, s => s.Symbol);

        return Ok(alerts.Select(a => new
        {
            a.AlertId,
            a.StockId,
            Symbol = stockLookup.TryGetValue(a.StockId, out var symbol) ? symbol : a.StockId.ToString(),
            a.ConditionType,
            a.Direction,
            a.TargetPrice,
            a.PercentageThreshold,
            a.Message,
            a.IsActive,
            a.CreatedAt
        }));
    }

    [HttpPost]
    public async Task<IActionResult> CreateAlert([FromBody] AlertUpsertRequest request)
    {
        var validationError = ValidateRequest(request);
        if (validationError is not null)
        {
            return BadRequest(new { message = validationError });
        }

        var stockId = await ResolveStockIdAsync(request.StockId, request.Symbol);
        if (stockId is null)
        {
            return BadRequest(new { message = "A valid stock symbol or stockId is required." });
        }

        var alert = new Alert
        {
            UserId = request.UserId,
            StockId = stockId.Value,
            ConditionType = request.ConditionType,
            Direction = request.Direction,
            TargetPrice = request.TargetPrice,
            PercentageThreshold = request.PercentageThreshold,
            VolatilityWindowMinutes = request.VolatilityWindowMinutes,
            ReferencePrice = request.ReferencePrice,
            ReportKeyword = request.ReportKeyword,
            Message = request.Message,
            CooldownMinutes = request.CooldownMinutes,
            IsActive = true
        };

        _context.Alerts.Add(alert);
        await _context.SaveChangesAsync();
        return Ok(new { message = "Alert created.", alertId = alert.AlertId });
    }

    [HttpPut("{alertId:int}")]
    public async Task<IActionResult> UpdateAlert(int alertId, [FromBody] AlertUpsertRequest request)
    {
        var alert = await _context.Alerts.FindAsync(alertId);
        if (alert is null)
        {
            return NotFound(new { message = "Alert not found." });
        }

        var validationError = ValidateRequest(request);
        if (validationError is not null)
        {
            return BadRequest(new { message = validationError });
        }

        var stockId = await ResolveStockIdAsync(request.StockId, request.Symbol);
        if (stockId is null)
        {
            return BadRequest(new { message = "A valid stock symbol or stockId is required." });
        }

        alert.StockId = stockId.Value;
        alert.ConditionType = request.ConditionType;
        alert.Direction = request.Direction;
        alert.TargetPrice = request.TargetPrice;
        alert.PercentageThreshold = request.PercentageThreshold;
        alert.VolatilityWindowMinutes = request.VolatilityWindowMinutes;
        alert.ReferencePrice = request.ReferencePrice;
        alert.ReportKeyword = request.ReportKeyword;
        alert.Message = request.Message;
        alert.CooldownMinutes = request.CooldownMinutes;

        await _context.SaveChangesAsync();
        return Ok(new { message = "Alert updated." });
    }

    [HttpPost("{alertId:int}/deactivate")]
    public async Task<IActionResult> DeactivateAlert(int alertId)
    {
        var alert = await _context.Alerts.FindAsync(alertId);
        if (alert is null)
        {
            return NotFound(new { message = "Alert not found." });
        }

        alert.IsActive = false;
        await _context.SaveChangesAsync();
        return Ok(new { message = "Alert deactivated." });
    }

    [HttpGet("events/{userId:int}")]
    public async Task<IActionResult> GetAlertEvents(int userId, [FromQuery] bool unreadOnly = false)
    {
        var query = _context.AlertEvents.Where(e => e.UserId == userId);
        if (unreadOnly)
        {
            query = query.Where(e => !e.IsRead);
        }

        var events = await query
            .OrderByDescending(e => e.CreatedAt)
            .Take(200)
            .ToListAsync();

        return Ok(events);
    }

    [HttpPost("events/{alertEventId:int}/read")]
    public async Task<IActionResult> MarkAlertEventAsRead(int alertEventId)
    {
        var alertEvent = await _context.AlertEvents.FindAsync(alertEventId);
        if (alertEvent is null)
        {
            return NotFound(new { message = "Alert event not found." });
        }

        alertEvent.IsRead = true;
        await _context.SaveChangesAsync();
        return Ok(new { message = "Alert event marked as read." });
    }

    private static string? ValidateRequest(AlertUpsertRequest request)
    {
        if (request.UserId <= 0)
        {
            return "UserId must be positive.";
        }

        if (request.StockId <= 0 && string.IsNullOrWhiteSpace(request.Symbol))
        {
            return "StockId or Symbol must be provided.";
        }

        if (request.CooldownMinutes < 0)
        {
            return "CooldownMinutes cannot be negative.";
        }

        return request.ConditionType switch
        {
            AlertConditionType.PriceTarget when request.TargetPrice is null =>
                "TargetPrice is required for PriceTarget alerts.",
            AlertConditionType.PercentVolatility when request.PercentageThreshold is null =>
                "PercentageThreshold is required for PercentVolatility alerts.",
            AlertConditionType.PercentVolatility when request.VolatilityWindowMinutes is null =>
                "VolatilityWindowMinutes is required for PercentVolatility alerts.",
            _ => null
        };
    }

    private async Task<int?> ResolveStockIdAsync(int stockId, string? symbol)
    {
        if (stockId > 0)
        {
            var exists = await _context.Stocks.AnyAsync(s => s.StockId == stockId);
            if (exists)
            {
                return stockId;
            }
        }

        if (!string.IsNullOrWhiteSpace(symbol))
        {
            var normalizedSymbol = symbol.Trim().ToUpperInvariant();
            var fromSymbol = await _context.Stocks
                .Where(s => s.Symbol == normalizedSymbol)
                .Select(s => (int?)s.StockId)
                .FirstOrDefaultAsync();
            return fromSymbol;
        }

        return null;
    }

    public class AlertUpsertRequest
    {
        public int UserId { get; set; }
        public int StockId { get; set; }
        public string? Symbol { get; set; }
        public AlertConditionType ConditionType { get; set; }
        public AlertDirection Direction { get; set; } = AlertDirection.Above;
        public decimal? TargetPrice { get; set; }
        public decimal? PercentageThreshold { get; set; }
        public int? VolatilityWindowMinutes { get; set; }
        public decimal? ReferencePrice { get; set; }
        public string? ReportKeyword { get; set; }
        public string Message { get; set; } = string.Empty;
        public int CooldownMinutes { get; set; } = 60;
    }
}
