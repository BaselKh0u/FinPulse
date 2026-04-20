namespace Server.Services;

/// <summary>Obtains Reddit OAuth access tokens using a refresh token (official API).</summary>
public interface IRedditOAuthTokenProvider
{
    /// <summary>Returns null if Reddit OAuth is not configured (caller should use anonymous fallback).</summary>
    Task<string?> GetAccessTokenAsync(CancellationToken cancellationToken = default);
}
