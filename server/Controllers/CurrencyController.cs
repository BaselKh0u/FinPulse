using Microsoft.AspNetCore.Mvc;

[Route("currency")]
[Route("api/[controller]")]
[ApiController]
public class CurrencyController : ControllerBase
{
    [HttpGet("rates")]
    public IActionResult GetRates([FromQuery] string baseCurrency = "USD")
    {
        var baseCode = string.IsNullOrWhiteSpace(baseCurrency) ? "USD" : baseCurrency.ToUpperInvariant();

        // Static baseline fallback to keep frontend unblocked.
        var rates = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase)
        {
            ["USD"] = 1,
            ["EUR"] = 0.92,
            ["GBP"] = 0.79,
            ["ILS"] = 3.63,
            ["JPY"] = 149.5
        };

        return Ok(new
        {
            @base = baseCode,
            rates
        });
    }
}
