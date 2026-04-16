namespace Server.Services;

public static class AlphaVantageRateLimitGuard
{
    private static readonly object Sync = new();
    private static readonly Dictionary<string, (DateTimeOffset Until, string Reason)> Blocks = new(StringComparer.OrdinalIgnoreCase);
    private const string GlobalKey = "__GLOBAL__";

    private static string NormalizeKey(string? apiKey) =>
        string.IsNullOrWhiteSpace(apiKey) ? GlobalKey : apiKey.Trim();

    public static bool IsBlocked(string? apiKey, out DateTimeOffset? blockedUntilUtc, out string? reason)
    {
        var key = NormalizeKey(apiKey);
        lock (Sync)
        {
            if (!Blocks.TryGetValue(key, out var block))
            {
                blockedUntilUtc = null;
                reason = null;
                return false;
            }

            if (DateTimeOffset.UtcNow < block.Until)
            {
                blockedUntilUtc = block.Until;
                reason = block.Reason;
                return true;
            }

            Blocks.Remove(key);
            blockedUntilUtc = null;
            reason = null;
            return false;
        }
    }

    public static bool IsAnyBlocked(out DateTimeOffset? blockedUntilUtc, out string? reason)
    {
        lock (Sync)
        {
            var now = DateTimeOffset.UtcNow;
            var active = Blocks
                .Where(kvp => kvp.Value.Until > now)
                .OrderBy(kvp => kvp.Value.Until)
                .FirstOrDefault();

            if (active.Key is null)
            {
                blockedUntilUtc = null;
                reason = null;
                return false;
            }

            blockedUntilUtc = active.Value.Until;
            reason = active.Value.Reason;
            return true;
        }
    }

    public static void MarkIfLimited(string? apiKey, string? message)
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
        var key = NormalizeKey(apiKey);
        lock (Sync)
        {
            Blocks[key] = (new DateTimeOffset(nextUtcDay, TimeSpan.Zero), text.Length > 220 ? text[..220] : text);
        }
    }
}
