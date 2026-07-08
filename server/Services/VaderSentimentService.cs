using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace Server.Services;

/// <summary>
/// Calls the Python VADER microservice (sentiment_service/main.py).
/// Falls back to <see cref="NewsSentimentScorer"/> when the service is unreachable,
/// so the ingestion pipeline keeps running even if Python is not started.
/// </summary>
public interface IVaderSentimentService
{
    /// <summary>Returns a sentiment score in [-1, 1] for the given text.</summary>
    Task<decimal> ScoreAsync(string text, CancellationToken ct = default);
}

public class VaderSentimentService : IVaderSentimentService
{
    public const string HttpClientName = nameof(VaderSentimentService);
    private const string ScoreEndpoint = "/score";

    private readonly IHttpClientFactory _factory;
    private readonly ILogger<VaderSentimentService> _logger;

    public VaderSentimentService(IHttpClientFactory factory, ILogger<VaderSentimentService> logger)
    {
        _factory = factory;
        _logger = logger;
    }

    public async Task<decimal> ScoreAsync(string text, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(text))
            return 0m;

        try
        {
            var client = _factory.CreateClient(HttpClientName);
            var response = await client.PostAsJsonAsync(ScoreEndpoint, new { text }, ct);
            response.EnsureSuccessStatusCode();

            var result = await response.Content.ReadFromJsonAsync<VaderScoreResponse>(cancellationToken: ct);
            if (result is null)
                return NewsSentimentScorer.ScoreText(text);

            return (decimal)result.Compound;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or OperationCanceledException)
        {
            // Python service not running — degrade gracefully
            _logger.LogDebug("VADER service unreachable, falling back to keyword scorer: {Message}", ex.Message);
            return NewsSentimentScorer.ScoreText(text);
        }
    }

    private sealed class VaderScoreResponse
    {
        [JsonPropertyName("compound")]
        public double Compound { get; init; }

        [JsonPropertyName("label")]
        public string Label { get; init; } = string.Empty;
    }
}
