using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using Server.Config;
using Server.Data;
using Server.Models;

namespace Server.Services
{
    public class AlphaVantageStockIngestionService : IStockIngestionService
    {
        private readonly HttpClient _httpClient;
        private readonly AppDbContext _dbContext;
        private readonly AlphaVantageOptions _options;
        private readonly string _apiKey;
        private readonly ILogger<AlphaVantageStockIngestionService> _logger;

        public AlphaVantageStockIngestionService(
            HttpClient httpClient,
            AppDbContext dbContext,
            IOptions<AlphaVantageOptions> options,
            IConfiguration configuration,
            ILogger<AlphaVantageStockIngestionService> logger)
        {
            _httpClient = httpClient;
            _dbContext = dbContext;
            _logger = logger;
            _options = options.Value;
            _apiKey = FirstNonEmpty(
                _options.ApiKey,
                configuration["AlphaVantage:ApiKey"],
                Environment.GetEnvironmentVariable("AlphaVantage__ApiKey"));
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

        public async Task IngestAsync(CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(_apiKey))
            {
                _logger.LogWarning("Skipping ingestion because AlphaVantage API key is empty.");
                return;
            }

            foreach (var symbolRaw in _options.Symbols)
            {
                var symbol = symbolRaw.Trim().ToUpperInvariant();
                if (string.IsNullOrWhiteSpace(symbol))
                {
                    continue;
                }

                try
                {
                    var stock = await GetOrCreateStockAsync(symbol, cancellationToken);
                    await IngestQuoteAsync(stock, cancellationToken);
                    await IngestNewsAsync(stock, cancellationToken);
                    await IngestRedditSignalsAsync(stock, cancellationToken);
                    await UpdateConfidenceScoreAsync(stock, cancellationToken);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Ingestion failed for symbol {Symbol}.", symbol);
                }
            }

            await _dbContext.SaveChangesAsync(cancellationToken);
        }

        private async Task<Stock> GetOrCreateStockAsync(string symbol, CancellationToken cancellationToken)
        {
            var stock = await _dbContext.Stocks.FirstOrDefaultAsync(s => s.Symbol == symbol, cancellationToken);
            if (stock != null)
            {
                return stock;
            }

            stock = new Stock
            {
                Symbol = symbol,
                CompanyName = symbol,
                Sector = string.Empty
            };
            _dbContext.Stocks.Add(stock);
            await _dbContext.SaveChangesAsync(cancellationToken);

            return stock;
        }

        private async Task IngestQuoteAsync(Stock stock, CancellationToken cancellationToken)
        {
            var url =
                $"{_options.BaseUrl}/query?function=GLOBAL_QUOTE&symbol={stock.Symbol}&apikey={_apiKey}";
            using var response = await _httpClient.GetAsync(url, cancellationToken);
            response.EnsureSuccessStatusCode();

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);

            if (!document.RootElement.TryGetProperty("Global Quote", out var quote))
            {
                return;
            }

            if (!TryGetDecimal(quote, "05. price", out var price))
            {
                return;
            }

            TryGetLong(quote, "06. volume", out var volume);
            var recordedAt = TryGetDate(quote, "07. latest trading day") ?? DateTime.UtcNow;

            var exists = await _dbContext.PriceData
                .AnyAsync(p => p.StockId == stock.StockId && p.RecordedAt == recordedAt, cancellationToken);
            if (exists)
            {
                return;
            }

            _dbContext.PriceData.Add(new PriceData
            {
                StockId = stock.StockId,
                Price = price,
                Volume = volume,
                RecordedAt = recordedAt
            });
        }

        private async Task IngestNewsAsync(Stock stock, CancellationToken cancellationToken)
        {
            var url =
                $"{_options.BaseUrl}/query?function=NEWS_SENTIMENT&tickers={stock.Symbol}&limit={_options.NewsPageSize}&apikey={_apiKey}";
            using var response = await _httpClient.GetAsync(url, cancellationToken);
            response.EnsureSuccessStatusCode();

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);

            if (!document.RootElement.TryGetProperty("feed", out var feed) || feed.ValueKind != JsonValueKind.Array)
            {
                return;
            }

            foreach (var item in feed.EnumerateArray())
            {
                if (!item.TryGetProperty("time_published", out var publishedProp))
                {
                    continue;
                }

                var publishedAt = ParseNewsTimestamp(GetJsonString(publishedProp)) ?? DateTime.UtcNow;
                var exists = await _dbContext.SentimentAnalyses
                    .AnyAsync(sa => sa.StockId == stock.StockId && sa.AnalyzedAt == publishedAt, cancellationToken);
                if (exists)
                {
                    continue;
                }

                var sentimentLabel = item.TryGetProperty("overall_sentiment_label", out var labelProp)
                    ? GetJsonString(labelProp) ?? "Neutral"
                    : "Neutral";

                var sentimentScore = item.TryGetProperty("overall_sentiment_score", out var scoreProp)
                    ? GetJsonDecimal(scoreProp)
                    : 0m;

                var source = item.TryGetProperty("title", out var titleProp)
                    ? GetJsonString(titleProp) ?? "AlphaVantage"
                    : "AlphaVantage";

                _dbContext.SentimentAnalyses.Add(new SentimentAnalysis
                {
                    StockId = stock.StockId,
                    SentimentScore = sentimentScore,
                    SentimentLabel = sentimentLabel,
                    Source = source,
                    AnalyzedAt = publishedAt
                });
            }
        }

        private async Task IngestRedditSignalsAsync(Stock stock, CancellationToken cancellationToken)
        {
            var url = $"https://www.reddit.com/search.json?q={Uri.EscapeDataString(stock.Symbol + " stock")}&sort=new&limit=15";
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.UserAgent.ParseAdd("FinPulseBot/1.0");
            using var response = await _httpClient.SendAsync(request, cancellationToken);
            response.EnsureSuccessStatusCode();

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);

            if (!document.RootElement.TryGetProperty("data", out var data) ||
                !data.TryGetProperty("children", out var children) ||
                children.ValueKind != JsonValueKind.Array)
            {
                return;
            }

            foreach (var child in children.EnumerateArray())
            {
                if (!child.TryGetProperty("data", out var post))
                {
                    continue;
                }

                var title = post.TryGetProperty("title", out var titleElement) ? titleElement.GetString() ?? "" : "";
                if (string.IsNullOrWhiteSpace(title))
                {
                    continue;
                }

                var createdUtc = post.TryGetProperty("created_utc", out var utcElement) && utcElement.TryGetDouble(out var utc)
                    ? DateTimeOffset.FromUnixTimeSeconds((long)utc).UtcDateTime
                    : DateTime.UtcNow;

                var exists = await _dbContext.SentimentAnalyses
                    .AnyAsync(sa => sa.StockId == stock.StockId && sa.AnalyzedAt == createdUtc, cancellationToken);
                if (exists)
                {
                    continue;
                }

                var score = EstimateSentimentFromTitle(title);
                _dbContext.SentimentAnalyses.Add(new SentimentAnalysis
                {
                    StockId = stock.StockId,
                    SentimentScore = score,
                    SentimentLabel = score > 0.2m ? "Positive" : score < -0.2m ? "Negative" : "Neutral",
                    Source = $"Reddit: {title}",
                    AnalyzedAt = createdUtc
                });
            }
        }

        private static decimal EstimateSentimentFromTitle(string text)
        {
            var lower = text.ToLowerInvariant();
            var positives = new[] { "beat", "growth", "surge", "bull", "strong", "upgrade", "profit" };
            var negatives = new[] { "miss", "drop", "bear", "weak", "downgrade", "lawsuit", "decline" };

            var positiveHits = positives.Count(lower.Contains);
            var negativeHits = negatives.Count(lower.Contains);
            var score = (positiveHits - negativeHits) * 0.2m;
            return Math.Clamp(score, -1m, 1m);
        }

        private async Task UpdateConfidenceScoreAsync(Stock stock, CancellationToken cancellationToken)
        {
            var latestPrices = await _dbContext.PriceData
                .Where(p => p.StockId == stock.StockId)
                .OrderByDescending(p => p.RecordedAt)
                .Take(80)
                .OrderBy(p => p.RecordedAt)
                .Select(p => (double)p.Price)
                .ToListAsync(cancellationToken);

            var recentSentiment = await _dbContext.SentimentAnalyses
                .Where(s => s.StockId == stock.StockId)
                .OrderByDescending(s => s.AnalyzedAt)
                .Take(80)
                .ToListAsync(cancellationToken);

            var stability = CalculateStability(latestPrices);
            var sentimentConsistency = CalculateSentimentConsistency(recentSentiment.Select(s => (double)s.SentimentScore).ToList());
            var coverage = Math.Clamp(recentSentiment.Count / 80.0, 0, 1);

            // Confidence score: weighted blend of stability, sentiment consistency, and signal coverage.
            var confidence = (stability * 0.5) + (sentimentConsistency * 0.3) + (coverage * 0.2);
            var normalized = (float)Math.Round(Math.Clamp(confidence, 0, 1), 4);

            _dbContext.ConfidenceScores.Add(new ConfidenceScore
            {
                StockId = stock.StockId,
                ConfidenceValue = normalized,
                CalculatedAt = DateTime.UtcNow
            });
        }

        private static double CalculateStability(List<double> prices)
        {
            if (prices.Count < 3)
            {
                return 0.5;
            }

            var returns = new List<double>();
            for (var i = 1; i < prices.Count; i++)
            {
                if (prices[i - 1] == 0)
                {
                    continue;
                }

                returns.Add((prices[i] - prices[i - 1]) / prices[i - 1]);
            }

            if (returns.Count < 2)
            {
                return 0.5;
            }

            var avg = returns.Average();
            var variance = returns.Select(r => (r - avg) * (r - avg)).Average();
            var stdDev = Math.Sqrt(variance);
            return Math.Clamp(1 - (stdDev * 12), 0, 1);
        }

        private static double CalculateSentimentConsistency(List<double> sentiments)
        {
            if (sentiments.Count < 3)
            {
                return 0.5;
            }

            var avg = sentiments.Average();
            var variance = sentiments.Select(s => (s - avg) * (s - avg)).Average();
            var stdDev = Math.Sqrt(variance);
            return Math.Clamp(1 - stdDev, 0, 1);
        }

        private static string? GetJsonString(JsonElement el) =>
            el.ValueKind switch
            {
                JsonValueKind.String => el.GetString(),
                JsonValueKind.Number => el.GetRawText(),
                JsonValueKind.True => "true",
                JsonValueKind.False => "false",
                _ => null
            };

        private static decimal GetJsonDecimal(JsonElement el) =>
            el.ValueKind switch
            {
                JsonValueKind.Number => el.TryGetDecimal(out var d) ? d : (decimal)el.GetDouble(),
                JsonValueKind.String => decimal.TryParse(
                    el.GetString(),
                    NumberStyles.Any,
                    CultureInfo.InvariantCulture,
                    out var d)
                    ? d
                    : 0m,
                _ => 0m
            };

        private static DateTime? TryGetDate(JsonElement quote, string property)
        {
            if (!quote.TryGetProperty(property, out var value))
            {
                return null;
            }

            var text = GetJsonString(value);
            if (DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal,
                    out var parsed))
            {
                return parsed.ToUniversalTime();
            }

            return null;
        }

        private static DateTime? ParseNewsTimestamp(string? raw)
        {
            if (string.IsNullOrWhiteSpace(raw))
            {
                return null;
            }

            if (DateTime.TryParseExact(raw, "yyyyMMddTHHmmss", CultureInfo.InvariantCulture,
                    DateTimeStyles.AssumeUniversal, out var parsed))
            {
                return parsed.ToUniversalTime();
            }

            return null;
        }

        private static bool TryGetDecimal(JsonElement element, string property, out decimal value)
        {
            value = 0;
            if (!element.TryGetProperty(property, out var jsonValue))
            {
                return false;
            }

            if (jsonValue.ValueKind == JsonValueKind.Number)
            {
                value = jsonValue.TryGetDecimal(out var d) ? d : (decimal)jsonValue.GetDouble();
                return true;
            }

            return jsonValue.ValueKind == JsonValueKind.String
                && decimal.TryParse(jsonValue.GetString(), NumberStyles.Any, CultureInfo.InvariantCulture, out value);
        }

        private static bool TryGetLong(JsonElement element, string property, out long value)
        {
            value = 0;
            if (!element.TryGetProperty(property, out var jsonValue))
            {
                return false;
            }

            if (jsonValue.ValueKind == JsonValueKind.Number && jsonValue.TryGetInt64(out value))
            {
                return true;
            }

            return jsonValue.ValueKind == JsonValueKind.String
                && long.TryParse(jsonValue.GetString(), NumberStyles.Any, CultureInfo.InvariantCulture, out value);
        }
    }
}
