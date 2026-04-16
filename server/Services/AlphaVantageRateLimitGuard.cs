namespace Server.Services;

public static class AlphaVantageRateLimitGuard
{
    private static readonly object Sync = new();
    private static DateTimeOffset? _blockedUntilUtc;
    private static string? _reason;

    public static bool IsBlocked(out DateTimeOffset? blockedUntilUtc, out string? reason)
    {
        lock (Sync)
        {
            if (_blockedUntilUtc is null)
            {
                blockedUntilUtc = null;
                reason = null;
                return false;
            }

            if (DateTimeOffset.UtcNow < _blockedUntilUtc.Value)
            {
                blockedUntilUtc = _blockedUntilUtc;
                reason = _reason;
                return true;
            }

            _blockedUntilUtc = null;
            _reason = null;
            blockedUntilUtc = null;
            reason = null;
            return false;
        }
    }

    public static void MarkIfLimited(string? message)
    {
        if (string.IsNullOrWhiteSpace(message))
        {
            return;
        }

        var text = message.Trim();
        if (!text.Contains("rate limit", StringComparison.OrdinalIgnoreCase) &&
            !text.Contains("requests per day", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        var nextUtcDay = DateTimeOffset.UtcNow.UtcDateTime.Date.AddDays(1);
        lock (Sync)
        {
            _blockedUntilUtc = new DateTimeOffset(nextUtcDay, TimeSpan.Zero);
            _reason = text.Length > 220 ? text[..220] : text;
        }
    }
}
