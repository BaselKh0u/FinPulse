using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Server.Config;
using Server.Services;

namespace Server.Controllers;

/// <summary>Non-sensitive configuration exposed to clients (e.g. profile / about).</summary>
[ApiController]
[Route("api/config")]
public class PublicConfigController : ControllerBase
{
    [HttpGet("data-ingestion")]
    [AllowAnonymous]
    public ActionResult<object> GetDataIngestion([FromServices] IOptions<AlphaVantageOptions> options)
    {
        var o = options.Value;
        var cooldownActive = AlphaVantageRateLimitGuard.IsBlocked(out var blockedUntilUtc, out var reason);
        return Ok(new
        {
            pollingIntervalMinutes = Math.Max(1, o.PollingIntervalMinutes),
            delayBetweenSymbolIngestionSeconds = Math.Clamp(o.DelayBetweenSymbolIngestionSeconds, 0, 3600),
            delayBetweenAlphaVantageCallsSeconds = Math.Clamp(o.DelayBetweenAlphaVantageCallsSeconds, 0, 600),
            startupDelaySeconds = Math.Clamp(o.StartupDelaySeconds, 0, 600),
            hasAlphaVantageKey = !string.IsNullOrWhiteSpace(o.ApiKey),
            alphaVantageCooldownActive = cooldownActive,
            alphaVantageBlockedUntilUtc = blockedUntilUtc,
            alphaVantageCooldownReason = reason
        });
    }
}
