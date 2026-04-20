using System.Net.Http.Headers;

namespace Server.Services;

internal static class HttpUserAgentHeader
{
    internal static void Set(HttpHeaders headers, string? userAgent, string fallback = "FinPulse-ingestion/1.0")
    {
        var ua = string.IsNullOrWhiteSpace(userAgent) ? fallback : userAgent.Trim();
        headers.Remove("User-Agent");
        headers.TryAddWithoutValidation("User-Agent", ua);
    }
}
