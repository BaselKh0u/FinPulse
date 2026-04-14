using Microsoft.AspNetCore.Mvc;

[Route("api/[controller]")]
[ApiController]
public class CurrencyController : ControllerBase
{
    // GET: api/Currency/rates?base=USD
    // TODO: Replace with real exchange rate API (ExchangeRate-API or Fixer.io)
    [HttpGet("rates")]
    public IActionResult GetRates([FromQuery] string @base = "USD")
    {
        return Ok(new
        {
            @base = "USD",
            rates = new
            {
                USD = 1.0,
                EUR = 0.92,
                GBP = 0.79,
                ILS = 3.63,
                JPY = 149.5
            },
            updatedAt = DateTime.UtcNow
        });
    }
}
