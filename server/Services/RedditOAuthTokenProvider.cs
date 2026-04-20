using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;

namespace Server.Services;

/// <summary>
/// Reddit requires OAuth for stable API access. Configure in appsettings.Local.json only (gitignored).
/// Create an app at https://www.reddit.com/prefs/apps (script or web), then obtain a refresh_token via OAuth flow.
/// </summary>
public sealed class RedditOAuthTokenProvider : IRedditOAuthTokenProvider
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<RedditOAuthTokenProvider> _logger;

    private readonly object _sync = new();
    private string? _cachedAccessToken;
    private DateTimeOffset _cachedExpiryUtc;

    public RedditOAuthTokenProvider(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<RedditOAuthTokenProvider> logger)
    {
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _logger = logger;
    }

    private static string FirstNonEmpty(params string?[] values)
    {
        foreach (var v in values)
        {
            if (!string.IsNullOrWhiteSpace(v))
            {
                return v.Trim();
            }
        }

        return string.Empty;
    }

    private string UserAgent =>
        FirstNonEmpty(
            _configuration["SocialApis:Reddit:UserAgent"],
            Environment.GetEnvironmentVariable("SocialApis__Reddit__UserAgent"),
            "FinPulse-ingestion/1.0");

    public async Task<string?> GetAccessTokenAsync(CancellationToken cancellationToken = default)
    {
        var clientId = FirstNonEmpty(
            _configuration["SocialApis:Reddit:ClientId"],
            Environment.GetEnvironmentVariable("SocialApis__Reddit__ClientId"));
        var clientSecret = FirstNonEmpty(
            _configuration["SocialApis:Reddit:ClientSecret"],
            Environment.GetEnvironmentVariable("SocialApis__Reddit__ClientSecret"));
        var refreshToken = FirstNonEmpty(
            _configuration["SocialApis:Reddit:RefreshToken"],
            Environment.GetEnvironmentVariable("SocialApis__Reddit__RefreshToken"));

        if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(refreshToken))
        {
            return null;
        }

        lock (_sync)
        {
            if (_cachedAccessToken is not null && DateTimeOffset.UtcNow < _cachedExpiryUtc)
            {
                return _cachedAccessToken;
            }
        }

        try
        {
            var client = _httpClientFactory.CreateClient(nameof(RedditOAuthTokenProvider));
            using var request = new HttpRequestMessage(
                HttpMethod.Post,
                "https://www.reddit.com/api/v1/access_token");

            var secretPair = $"{clientId}:{clientSecret}";
            request.Headers.Authorization =
                new AuthenticationHeaderValue(
                    "Basic",
                    Convert.ToBase64String(Encoding.UTF8.GetBytes(secretPair)));

            HttpUserAgentHeader.Set(request.Headers, UserAgent);
            request.Content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["grant_type"] = "refresh_token",
                ["refresh_token"] = refreshToken
            });

            using var response = await client.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogWarning(
                    "Reddit OAuth token refresh failed with {Status}: {Body}",
                    (int)response.StatusCode,
                    body.Length > 300 ? body[..300] : body);
                return null;
            }

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
            var root = doc.RootElement;
            if (!root.TryGetProperty("access_token", out var tokEl))
            {
                _logger.LogWarning("Reddit OAuth response missing access_token.");
                return null;
            }

            var accessToken = tokEl.GetString();
            if (string.IsNullOrWhiteSpace(accessToken))
            {
                return null;
            }

            var expiresIn = 3600;
            if (root.TryGetProperty("expires_in", out var expEl) && expEl.ValueKind == JsonValueKind.Number)
            {
                expiresIn = expEl.TryGetInt32(out var s) ? s : (int)expEl.GetDouble();
            }

            lock (_sync)
            {
                _cachedAccessToken = accessToken;
                _cachedExpiryUtc = DateTimeOffset.UtcNow.AddSeconds(Math.Max(120, expiresIn - 90));
            }

            return accessToken;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Reddit OAuth token refresh threw.");
            return null;
        }
    }
}
