using Microsoft.Extensions.Options;
using Server.Config;

namespace Server.Services;

/// <summary>
/// Limits how often SYMBOL_SEARCH hits Alpha Vantage when the DB has no matches (protects free-tier quota).
/// </summary>
public sealed class AlphaVantageSymbolSearchThrottle(IOptions<AlphaVantageOptions> options)
{
    private readonly IOptions<AlphaVantageOptions> _options = options;
    private readonly object _sync = new();
    private DateTimeOffset _lastAllowedUtc = DateTimeOffset.MinValue;

    /// <summary>Returns false if the next search should be skipped until <paramref name="retryAfter"/> elapses.</summary>
    public bool TryConsume(out TimeSpan? retryAfter)
    {
        var minSec = Math.Clamp(_options.Value.AlphaVantageSymbolSearchMinIntervalSeconds, 0, 86400);
        if (minSec <= 0)
        {
            retryAfter = null;
            return true;
        }

        lock (_sync)
        {
            var now = DateTimeOffset.UtcNow;
            var wait = TimeSpan.FromSeconds(minSec);
            if (now - _lastAllowedUtc < wait)
            {
                retryAfter = wait - (now - _lastAllowedUtc);
                return false;
            }

            _lastAllowedUtc = now;
            retryAfter = null;
            return true;
        }
    }
}
