using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using Server.Config;
using Server.Data;
using Server.Models;
using System.Net.Http.Headers;

namespace Server.Services
{
    public class AlphaVantageStockIngestionService : IStockIngestionService
    {
        /// <summary>Separates channel (e.g. Reddit, Bloomberg) from headline in <see cref="SentimentAnalysis.Source"/>.</summary>
        internal const char SourceChannelSeparator = '\u2016'; // ‖ unlikely in titles
        private readonly HttpClient _httpClient;
        private readonly AppDbContext _dbContext;
        private readonly AlphaVantageOptions _options;
        private readonly string _apiKey;
        private readonly List<string> _apiKeys;
        private readonly ILogger<AlphaVantageStockIngestionService> _logger;
        private readonly string _xBearerToken;
        private readonly string _facebookAccessToken;
        private readonly List<string> _facebookPageIds;
        private readonly string _finnhubApiKey;
        private readonly SymbolIngestionRotationState _symbolRotation;
        private readonly IRedditOAuthTokenProvider _redditOAuth;
        private readonly string _redditUserAgent;
        private readonly IVaderSentimentService _vader;

        public AlphaVantageStockIngestionService(
            HttpClient httpClient,
            AppDbContext dbContext,
            IOptions<AlphaVantageOptions> options,
            IConfiguration configuration,
            SymbolIngestionRotationState symbolRotation,
            IRedditOAuthTokenProvider redditOAuth,
            IVaderSentimentService vader,
            ILogger<AlphaVantageStockIngestionService> logger)
        {
            _httpClient = httpClient;
            _dbContext = dbContext;
            _symbolRotation = symbolRotation;
            _redditOAuth = redditOAuth;
            _vader = vader;
            _redditUserAgent = FirstNonEmpty(
                configuration["SocialApis:Reddit:UserAgent"],
                Environment.GetEnvironmentVariable("SocialApis__Reddit__UserAgent"),
                "FinPulse-ingestion/1.0");
            _logger = logger;
            _options = options.Value;
            _apiKey = FirstNonEmpty(
                _options.ApiKey,
                configuration["AlphaVantage:ApiKey"],
                Environment.GetEnvironmentVariable("AlphaVantage__ApiKey"));
            _apiKeys = ResolveApiKeys(configuration, _options, _apiKey);
            _xBearerToken = FirstNonEmpty(
                configuration["SocialApis:X:BearerToken"],
                Environment.GetEnvironmentVariable("SocialApis__X__BearerToken"));
            _facebookAccessToken = FirstNonEmpty(
                configuration["SocialApis:Facebook:AccessToken"],
                Environment.GetEnvironmentVariable("SocialApis__Facebook__AccessToken"));
            _facebookPageIds = (configuration.GetSection("SocialApis:Facebook:PageIds").Get<string[]>() ?? [])
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Select(x => x.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            _finnhubApiKey = FirstNonEmpty(
                configuration["SocialApis:Finnhub:ApiKey"],
                Environment.GetEnvironmentVariable("SocialApis__Finnhub__ApiKey"));
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

        /// <summary>
        /// PK is (StockId, AnalyzedAt). External feeds often only have second precision; multiple rows in one
        /// SaveChanges batch would collide. Spread within the same UTC second deterministically from <paramref name="uniquenessMaterial"/> (matches <see cref="SentimentAnalysis.Source"/>).
        /// </summary>
        private static DateTime StableAnalyzedAtUtc(DateTime publishedUtc, string uniquenessMaterial)
        {
            unchecked
            {
                ulong hash = 14695981039346656037UL;
                foreach (var c in uniquenessMaterial)
                {
                    hash ^= c;
                    hash *= 1099511628211UL;
                }

                var spread = (long)(hash % 9_999_999UL);
                return publishedUtc.AddTicks(spread);
            }
        }

        private static List<string> ResolveApiKeys(IConfiguration configuration, AlphaVantageOptions options, string fallbackKey)
        {
            var keys = new List<string>();
            keys.AddRange(options.ApiKeys ?? []);
            keys.AddRange(configuration.GetSection("AlphaVantage:ApiKeys").Get<string[]>() ?? []);

            var envCsv = Environment.GetEnvironmentVariable("AlphaVantage__ApiKeys");
            if (!string.IsNullOrWhiteSpace(envCsv))
            {
                keys.AddRange(envCsv.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries));
            }
            keys.Add(fallbackKey);

            return keys
                .Where(k => !string.IsNullOrWhiteSpace(k))
                .Select(k => k.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
        }

        private string? GetAvailableApiKey()
        {
            foreach (var key in _apiKeys)
            {
                if (!AlphaVantageRateLimitGuard.IsBlocked(key, out _, out _))
                {
                    return key;
                }
            }

            return null;
        }

        private IEnumerable<string> GetAvailableApiKeys()
        {
            foreach (var key in _apiKeys)
            {
                if (!AlphaVantageRateLimitGuard.IsBlocked(key, out _, out _))
                {
                    yield return key;
                }
            }
        }

        public async Task IngestAsync(CancellationToken cancellationToken, IngestionScope scope = IngestionScope.Full)
        {
            var runQuotes = scope is IngestionScope.Full or IngestionScope.QuotesOnly;
            var runExtended = scope is IngestionScope.Full or IngestionScope.ExtendedOnly;

            if (!_options.UseAlphaVantageIngestion)
            {
                _logger.LogInformation(
                    "Alpha Vantage HTTP calls are disabled (UseAlphaVantageIngestion=false). Using Yahoo/Stooq for quotes; AV news skipped. Finnhub/social still run when configured.");
            }
            else if (_apiKeys.Count == 0)
            {
                _logger.LogWarning("Alpha Vantage API key is empty; AV quote/news skipped — using Yahoo/Stooq and other providers.");
            }
            else if (GetAvailableApiKey() is null)
            {
                AlphaVantageRateLimitGuard.IsAnyBlocked(out var blockedUntilUtc, out var reason);
                _logger.LogWarning(
                    "All Alpha Vantage keys are cooling down until {BlockedUntil}. Reason: {Reason}. Continuing with fallback quote providers.",
                    blockedUntilUtc, reason);
            }

            int successCount = 0;
            int failureCount = 0;
            var symbolIndex = 0;

            var dbSymbols = await _dbContext.Stocks
                .Select(s => s.Symbol)
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .ToListAsync(cancellationToken);

            var symbolsToIngest = _options.Symbols
                .Concat(dbSymbols)
                .Select(s => s.Trim().ToUpperInvariant())
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(s => s, StringComparer.Ordinal)
                .ToList();

            var batchSymbols = symbolsToIngest;
            if (scope == IngestionScope.QuotesOnly)
            {
                batchSymbols = _symbolRotation.NextBatch(symbolsToIngest, _options.MaxSymbolsPerQuoteBatch, IngestionScope.QuotesOnly);
                if (_options.MaxSymbolsPerQuoteBatch > 0 && symbolsToIngest.Count > batchSymbols.Count)
                {
                    _logger.LogInformation(
                        "Quote ingestion batch: {BatchCount} of {Total} symbols this tick (round-robin).",
                        batchSymbols.Count,
                        symbolsToIngest.Count);
                }
            }
            else if (scope == IngestionScope.ExtendedOnly)
            {
                batchSymbols = _symbolRotation.NextBatch(symbolsToIngest, _options.MaxSymbolsPerExtendedBatch, IngestionScope.ExtendedOnly);
                if (_options.MaxSymbolsPerExtendedBatch > 0 && symbolsToIngest.Count > batchSymbols.Count)
                {
                    _logger.LogInformation(
                        "Extended ingestion batch: {BatchCount} of {Total} symbols this tick (round-robin).",
                        batchSymbols.Count,
                        symbolsToIngest.Count);
                }
            }

            _logger.LogInformation(
                "Running ingestion scope={Scope} for {RunCount} symbols ({TotalTracked} tracked).",
                scope,
                batchSymbols.Count,
                symbolsToIngest.Count);

            foreach (var symbol in batchSymbols)
            {
                if (symbolIndex > 0)
                {
                    await DelayBetweenSymbolsAsync(cancellationToken);
                }

                symbolIndex++;

                try
                {
                    var stock = await GetOrCreateStockAsync(symbol, cancellationToken);

                    if (runQuotes)
                    {
                        await IngestQuoteAsync(stock, cancellationToken);
                    }

                    if (runExtended)
                    {
                        if (runQuotes)
                        {
                            await DelayBetweenAlphaVantageCallsAsync(cancellationToken);
                        }

                        await IngestNewsAsync(stock, cancellationToken);
                        await DelayBetweenAlphaVantageCallsAsync(cancellationToken);
                        await IngestFinnhubNewsAsync(stock, cancellationToken);
                        await IngestRedditSignalsAsync(stock, cancellationToken);
                        await IngestXSignalsAsync(stock, cancellationToken);
                        await IngestFacebookSignalsAsync(stock, cancellationToken);
                        await UpdateConfidenceScoreAsync(stock, cancellationToken);
                    }

                    successCount++;
                }
                catch (HttpRequestException ex) when (ex.Message.Contains("429") || ex.Message.Contains("rate"))
                {
                    _logger.LogWarning("Rate limit hit for symbol {Symbol}. Stopping ingestion to avoid further throttling.", symbol);
                    failureCount++;
                    continue;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Ingestion failed for symbol {Symbol}.", symbol);
                    failureCount++;
                }
            }

            await _dbContext.SaveChangesAsync(cancellationToken);

            if (successCount > 0)
                _logger.LogInformation(
                    "Stock ingestion ({Scope}) completed: {SuccessCount} symbols updated, {FailureCount} failed.",
                    scope,
                    successCount,
                    failureCount);
            else if (failureCount > 0)
                _logger.LogWarning(
                    "Stock ingestion ({Scope}) failed for all {Count} symbols. Check API key and rate limits.",
                    scope,
                    failureCount);
        }

        private Task DelayBetweenAlphaVantageCallsAsync(CancellationToken cancellationToken)
        {
            var seconds = Math.Clamp(_options.DelayBetweenAlphaVantageCallsSeconds, 0, 600);
            if (seconds <= 0)
            {
                return Task.CompletedTask;
            }

            return Task.Delay(TimeSpan.FromSeconds(seconds), cancellationToken);
        }

        private Task DelayBetweenSymbolsAsync(CancellationToken cancellationToken)
        {
            var seconds = Math.Clamp(_options.DelayBetweenSymbolIngestionSeconds, 0, 3600);
            if (seconds <= 0)
            {
                return Task.CompletedTask;
            }

            return Task.Delay(TimeSpan.FromSeconds(seconds), cancellationToken);
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
            if (_options.UseAlphaVantageIngestion)
            {
                var candidateKeys = GetAvailableApiKeys().ToList();
                foreach (var apiKey in candidateKeys)
                {
                    try
                    {
                        var url =
                            $"{_options.BaseUrl}/query?function=GLOBAL_QUOTE&symbol={stock.Symbol}&apikey={apiKey}";
                    using var response = await _httpClient.GetAsync(url, cancellationToken);
                    response.EnsureSuccessStatusCode();

                    await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
                    using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);

                    // Check for rate limit message
                    if (document.RootElement.TryGetProperty("Note", out var noteProp))
                    {
                        var note = noteProp.GetString() ?? "";
                        if (note.Contains("rate limit", StringComparison.OrdinalIgnoreCase))
                        {
                            AlphaVantageRateLimitGuard.MarkIfLimited(apiKey, note);
                            continue;
                        }
                    }
                    if (document.RootElement.TryGetProperty("Information", out var infoProp))
                    {
                        var info = infoProp.GetString() ?? "";
                        AlphaVantageRateLimitGuard.MarkIfLimited(apiKey, info);
                        if (info.Contains("requests per day", StringComparison.OrdinalIgnoreCase))
                        {
                            continue;
                        }
                    }

                    if (!document.RootElement.TryGetProperty("Global Quote", out var quote))
                    {
                        continue;
                    }

                    if (!TryGetDecimal(quote, "05. price", out var price))
                    {
                        continue;
                    }

                    TryGetLong(quote, "06. volume", out var volume);
                    var recordedAt = DateTime.UtcNow;

                    var recentDuplicate = await _dbContext.PriceData
                        .AnyAsync(
                            p => p.StockId == stock.StockId &&
                                 p.RecordedAt >= recordedAt.AddSeconds(-15) &&
                                 p.Price == price,
                            cancellationToken);
                    if (recentDuplicate)
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
                    return;
                }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Alpha Vantage quote request failed for {Symbol}, trying next key or fallback.", stock.Symbol);
                        continue;
                    }
                }
            }

            var yahooFallbackWorked = await TryIngestQuoteFromYahooAsync(stock, cancellationToken);
            if (yahooFallbackWorked)
            {
                return;
            }

            var stooqFallbackWorked = await TryIngestQuoteFromStooqAsync(stock, cancellationToken);
            if (stooqFallbackWorked)
            {
                return;
            }

            throw new HttpRequestException($"No usable quote provider available for ingestion ({stock.Symbol}).");
        }

    private async Task IngestNewsAsync(Stock stock, CancellationToken cancellationToken)
        {
            if (!_options.UseAlphaVantageIngestion)
            {
                return;
            }

            var candidateKeys = GetAvailableApiKeys().ToList();
            if (candidateKeys.Count == 0)
            {
                return;
            }

            foreach (var apiKey in candidateKeys)
            {
                var url =
                    $"{_options.BaseUrl}/query?function=NEWS_SENTIMENT&tickers={stock.Symbol}&limit={_options.NewsPageSize}&apikey={apiKey}";
                using var response = await _httpClient.GetAsync(url, cancellationToken);
                response.EnsureSuccessStatusCode();

                await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
                using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);

                // Check for rate limit message
                if (document.RootElement.TryGetProperty("Note", out var noteProp))
                {
                    var note = noteProp.GetString() ?? "";
                    if (note.Contains("rate limit", StringComparison.OrdinalIgnoreCase))
                    {
                        AlphaVantageRateLimitGuard.MarkIfLimited(apiKey, note);
                        continue;
                    }
                }
                if (document.RootElement.TryGetProperty("Information", out var infoProp))
                {
                    var info = infoProp.GetString() ?? "";
                    AlphaVantageRateLimitGuard.MarkIfLimited(apiKey, info);
                    if (info.Contains("requests per day", StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }
                }

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

                    var sentimentScore = item.TryGetProperty("overall_sentiment_score", out var scoreProp)
                        ? GetJsonDecimal(scoreProp)
                        : 0m;

                    var overallLabel = item.TryGetProperty("overall_sentiment_label", out var labelProp)
                        ? GetJsonString(labelProp)
                        : null;

                    var headline = item.TryGetProperty("title", out var titleProp)
                        ? GetJsonString(titleProp) ?? "Article"
                        : "Article";
                    var publisher = item.TryGetProperty("source", out var srcProp)
                        ? GetJsonString(srcProp)
                        : null;
                    var channel = !string.IsNullOrWhiteSpace(publisher)
                        ? publisher.Trim()
                        : "News";

                    var fullSource = $"{channel}{SourceChannelSeparator}{headline}";
                    var exists = await _dbContext.SentimentAnalyses
                        .AnyAsync(sa => sa.StockId == stock.StockId && sa.Source == fullSource, cancellationToken);
                    if (exists)
                    {
                        continue;
                    }

                    var headlineScore = await _vader.ScoreAsync(headline, cancellationToken);
                    var labelScore = NewsSentimentScorer.ScoreFromAlphaVantageLabel(overallLabel);
                    var blendedScore = Math.Clamp(
                        sentimentScore * 0.28m + headlineScore * 0.27m + labelScore * 0.45m,
                        -1m,
                        1m);
                    var sentimentLabel = NewsSentimentScorer.LabelFromScore(blendedScore);

                    _dbContext.SentimentAnalyses.Add(new SentimentAnalysis
                    {
                        StockId = stock.StockId,
                        SentimentScore = blendedScore,
                        SentimentLabel = sentimentLabel,
                        Source = fullSource,
                        AnalyzedAt = StableAnalyzedAtUtc(publishedAt, fullSource)
                    });
                }
                return;
            }

            throw new HttpRequestException($"No usable Alpha Vantage key available for news ingestion ({stock.Symbol}).");
        }

        private async Task IngestRedditSignalsAsync(Stock stock, CancellationToken cancellationToken)
        {
            try
            {
                var searchTerms = new[]
                {
                    $"{stock.Symbol} stock",
                    $"${stock.Symbol} investing",
                    $"{stock.Symbol} earnings",
                    $"{stock.Symbol} business",
                };

                var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                foreach (var term in searchTerms)
                {
                    var posts = await FetchRedditPostsAsync(term, cancellationToken);
                    foreach (var (title, createdUtc, sourceChannel) in posts)
                    {
                        var dedupe = $"{createdUtc:O}|{title}";
                        if (!seen.Add(dedupe))
                        {
                            continue;
                        }

                        var headline = title.Trim();
                        if (headline.Length > 400)
                        {
                            headline = headline[..400];
                        }

                        var fullSource = $"{sourceChannel}{SourceChannelSeparator}{headline}";
                        var exists = await _dbContext.SentimentAnalyses
                            .AnyAsync(sa => sa.StockId == stock.StockId && sa.Source == fullSource, cancellationToken);
                        if (exists)
                        {
                            continue;
                        }

                        var score = await _vader.ScoreAsync(title, cancellationToken);

                        _dbContext.SentimentAnalyses.Add(new SentimentAnalysis
                        {
                            StockId = stock.StockId,
                            SentimentScore = score,
                            SentimentLabel = NewsSentimentScorer.LabelFromScore(score),
                            Source = fullSource,
                            AnalyzedAt = StableAnalyzedAtUtc(createdUtc, fullSource)
                        });
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Social signal ingestion failed for {Symbol}", stock.Symbol);
            }
        }

        private async Task<List<(string Title, DateTime CreatedUtc, string SourceChannel)>> FetchRedditPostsAsync(
            string searchTerm,
            CancellationToken cancellationToken)
        {
            var posts = new List<(string Title, DateTime CreatedUtc, string SourceChannel)>();

            var oauthToken = await _redditOAuth.GetAccessTokenAsync(cancellationToken);
            var url = string.IsNullOrEmpty(oauthToken)
                ? $"https://www.reddit.com/search.json?q={Uri.EscapeDataString(searchTerm)}&sort=new&limit=20"
                : $"https://oauth.reddit.com/search.json?q={Uri.EscapeDataString(searchTerm)}&sort=new&t=week&limit=25&type=link";

            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            HttpUserAgentHeader.Set(request.Headers, _redditUserAgent);
            if (!string.IsNullOrEmpty(oauthToken))
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", oauthToken);
            }

            using var response = await _httpClient.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning(
                    "Reddit search failed for term '{SearchTerm}' with status code {StatusCode}",
                    searchTerm,
                    (int)response.StatusCode);
                return posts;
            }

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);

            if (!document.RootElement.TryGetProperty("data", out var data) ||
                !data.TryGetProperty("children", out var children) ||
                children.ValueKind != JsonValueKind.Array)
            {
                return posts;
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
                posts.Add((title, createdUtc, "Reddit"));
            }

            return posts;
        }

        private async Task IngestFinnhubNewsAsync(Stock stock, CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(_finnhubApiKey))
            {
                return;
            }

            try
            {
                var toDate = DateTime.UtcNow.Date;
                var fromDate = toDate.AddDays(-30);
                var url =
                    $"https://finnhub.io/api/v1/company-news?symbol={Uri.EscapeDataString(stock.Symbol)}&from={fromDate:yyyy-MM-dd}&to={toDate:yyyy-MM-dd}&token={Uri.EscapeDataString(_finnhubApiKey)}";
                using var response = await _httpClient.GetAsync(url, cancellationToken);
                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogWarning(
                        "Finnhub news failed for {Symbol} with status code {StatusCode}",
                        stock.Symbol,
                        (int)response.StatusCode);
                    return;
                }

                await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
                using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
                if (document.RootElement.ValueKind != JsonValueKind.Array)
                {
                    return;
                }

                foreach (var item in document.RootElement.EnumerateArray().Take(30))
                {
                    var headline = item.TryGetProperty("headline", out var headlineEl)
                        ? (headlineEl.GetString() ?? string.Empty).Trim()
                        : string.Empty;
                    if (string.IsNullOrWhiteSpace(headline))
                    {
                        continue;
                    }

                    var sourceName = item.TryGetProperty("source", out var sourceEl)
                        ? (sourceEl.GetString() ?? "Finnhub").Trim()
                        : "Finnhub";

                    var createdUtc = DateTime.UtcNow;
                    if (item.TryGetProperty("datetime", out var datetimeEl) && datetimeEl.ValueKind == JsonValueKind.Number)
                    {
                        var unix = datetimeEl.TryGetInt64(out var ts) ? ts : (long)datetimeEl.GetDouble();
                        if (unix > 0)
                        {
                            createdUtc = DateTimeOffset.FromUnixTimeSeconds(unix).UtcDateTime;
                        }
                    }

                    var fullSource = $"{sourceName}{SourceChannelSeparator}{headline}";
                    var exists = await _dbContext.SentimentAnalyses
                        .AnyAsync(
                            sa => sa.StockId == stock.StockId && sa.Source == fullSource,
                            cancellationToken);
                    if (exists)
                    {
                        continue;
                    }

                    var score = await _vader.ScoreAsync(headline, cancellationToken);
                    _dbContext.SentimentAnalyses.Add(new SentimentAnalysis
                    {
                        StockId = stock.StockId,
                        SentimentScore = score,
                        SentimentLabel = NewsSentimentScorer.LabelFromScore(score),
                        Source = fullSource,
                        AnalyzedAt = StableAnalyzedAtUtc(createdUtc, fullSource)
                    });
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Finnhub news ingestion failed for {Symbol}", stock.Symbol);
            }
        }

        private async Task IngestXSignalsAsync(Stock stock, CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(_xBearerToken))
            {
                return;
            }

            try
            {
                var searchTerms = new[]
                {
                    $"${stock.Symbol} lang:en -is:retweet",
                    $"{stock.Symbol} stock lang:en -is:retweet",
                    $"{stock.Symbol} earnings lang:en -is:retweet",
                };

                var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                foreach (var term in searchTerms)
                {
                    var posts = await FetchXPostsAsync(term, cancellationToken);
                    foreach (var (title, createdUtc, sourceChannel) in posts)
                    {
                        var dedupe = $"{createdUtc:O}|{title}";
                        if (!seen.Add(dedupe))
                        {
                            continue;
                        }

                        var headline = title.Trim();
                        if (headline.Length > 400)
                        {
                            headline = headline[..400];
                        }

                        var fullSource = $"{sourceChannel}{SourceChannelSeparator}{headline}";
                        var exists = await _dbContext.SentimentAnalyses
                            .AnyAsync(sa => sa.StockId == stock.StockId && sa.Source == fullSource, cancellationToken);
                        if (exists)
                        {
                            continue;
                        }

                        var score = await _vader.ScoreAsync(title, cancellationToken);

                        _dbContext.SentimentAnalyses.Add(new SentimentAnalysis
                        {
                            StockId = stock.StockId,
                            SentimentScore = score,
                            SentimentLabel = NewsSentimentScorer.LabelFromScore(score),
                            Source = fullSource,
                            AnalyzedAt = StableAnalyzedAtUtc(createdUtc, fullSource)
                        });
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "X signal ingestion failed for {Symbol}", stock.Symbol);
            }
        }

        private async Task<List<(string Title, DateTime CreatedUtc, string SourceChannel)>> FetchXPostsAsync(
            string searchTerm,
            CancellationToken cancellationToken)
        {
            var posts = new List<(string Title, DateTime CreatedUtc, string SourceChannel)>();
            var url =
                $"https://api.twitter.com/2/tweets/search/recent?max_results=25&tweet.fields=created_at,text&query={Uri.EscapeDataString(searchTerm)}";
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _xBearerToken);
            using var response = await _httpClient.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning(
                    "X search failed for term '{SearchTerm}' with status code {StatusCode}",
                    searchTerm,
                    (int)response.StatusCode);
                return posts;
            }

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
            if (!document.RootElement.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Array)
            {
                return posts;
            }

            foreach (var post in data.EnumerateArray())
            {
                var title = post.TryGetProperty("text", out var textElement) ? textElement.GetString() ?? "" : "";
                if (string.IsNullOrWhiteSpace(title))
                {
                    continue;
                }

                var createdUtc = DateTime.UtcNow;
                if (post.TryGetProperty("created_at", out var createdElement))
                {
                    var raw = createdElement.GetString();
                    if (DateTime.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var parsed))
                    {
                        createdUtc = parsed.ToUniversalTime();
                    }
                }

                posts.Add((title, createdUtc, "X"));
            }

            return posts;
        }

        private async Task IngestFacebookSignalsAsync(Stock stock, CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(_facebookAccessToken) || _facebookPageIds.Count == 0)
            {
                return;
            }

            try
            {
                var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                foreach (var pageId in _facebookPageIds)
                {
                    var posts = await FetchFacebookPostsAsync(pageId, cancellationToken);
                    foreach (var (title, createdUtc, sourceChannel) in posts)
                    {
                        if (!title.Contains(stock.Symbol, StringComparison.OrdinalIgnoreCase) &&
                            !title.Contains($"${stock.Symbol}", StringComparison.OrdinalIgnoreCase))
                        {
                            continue;
                        }

                        var dedupe = $"{createdUtc:O}|{title}";
                        if (!seen.Add(dedupe))
                        {
                            continue;
                        }

                        var headline = title.Trim();
                        if (headline.Length > 400)
                        {
                            headline = headline[..400];
                        }

                        var fullSource = $"{sourceChannel}{SourceChannelSeparator}{headline}";
                        var exists = await _dbContext.SentimentAnalyses
                            .AnyAsync(sa => sa.StockId == stock.StockId && sa.Source == fullSource, cancellationToken);
                        if (exists)
                        {
                            continue;
                        }

                        var score = await _vader.ScoreAsync(title, cancellationToken);

                        _dbContext.SentimentAnalyses.Add(new SentimentAnalysis
                        {
                            StockId = stock.StockId,
                            SentimentScore = score,
                            SentimentLabel = NewsSentimentScorer.LabelFromScore(score),
                            Source = fullSource,
                            AnalyzedAt = StableAnalyzedAtUtc(createdUtc, fullSource)
                        });
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Facebook signal ingestion failed for {Symbol}", stock.Symbol);
            }
        }

        private async Task<List<(string Title, DateTime CreatedUtc, string SourceChannel)>> FetchFacebookPostsAsync(
            string pageId,
            CancellationToken cancellationToken)
        {
            var posts = new List<(string Title, DateTime CreatedUtc, string SourceChannel)>();
            var url =
                $"https://graph.facebook.com/v19.0/{Uri.EscapeDataString(pageId)}/posts?limit=25&fields=message,created_time&access_token={Uri.EscapeDataString(_facebookAccessToken)}";
            using var response = await _httpClient.GetAsync(url, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning(
                    "Facebook posts fetch failed for page {PageId} with status code {StatusCode}",
                    pageId,
                    (int)response.StatusCode);
                return posts;
            }

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            var payload = await JsonSerializer.DeserializeAsync<FacebookPostsPayload>(stream, cancellationToken: cancellationToken);
            if (payload?.Data is null)
            {
                return posts;
            }

            foreach (var post in payload.Data)
            {
                var title = post.Message?.Trim();
                if (string.IsNullOrWhiteSpace(title))
                {
                    continue;
                }

                var createdUtc = DateTime.UtcNow;
                if (!string.IsNullOrWhiteSpace(post.CreatedTime) &&
                    DateTime.TryParse(post.CreatedTime, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var parsed))
                {
                    createdUtc = parsed.ToUniversalTime();
                }

                posts.Add((title, createdUtc, "Facebook"));
            }

            return posts;
        }

        private sealed class FacebookPostsPayload
        {
            [JsonPropertyName("data")]
            public List<FacebookPostItem>? Data { get; init; }
        }

        private sealed class FacebookPostItem
        {
            [JsonPropertyName("message")]
            public string? Message { get; init; }

            [JsonPropertyName("created_time")]
            public string? CreatedTime { get; init; }
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

        private async Task<bool> TryIngestQuoteFromStooqAsync(Stock stock, CancellationToken cancellationToken)
        {
            try
            {
                var symbol = stock.Symbol.Trim().ToLowerInvariant();
                if (string.IsNullOrWhiteSpace(symbol))
                {
                    return false;
                }

                var url = $"https://stooq.com/q/l/?s={symbol}.us&f=sd2t2ohlcv&h&e=csv";
                using var response = await _httpClient.GetAsync(url, cancellationToken);
                response.EnsureSuccessStatusCode();
                var csv = await response.Content.ReadAsStringAsync(cancellationToken);
                if (string.IsNullOrWhiteSpace(csv))
                {
                    return false;
                }

                var lines = csv
                    .Split(new char[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                if (lines.Length < 2)
                {
                    return false;
                }

                var fields = lines[1].Split(',');
                if (fields.Length < 8)
                {
                    return false;
                }

                var closeRaw = fields[6].Trim();
                var volumeRaw = fields[7].Trim();
                if (!decimal.TryParse(closeRaw, NumberStyles.Any, CultureInfo.InvariantCulture, out var price) || price <= 0m)
                {
                    return false;
                }

                long.TryParse(volumeRaw, NumberStyles.Any, CultureInfo.InvariantCulture, out var volume);
                var recordedAt = DateTime.UtcNow;

                _dbContext.PriceData.Add(new PriceData
                {
                    StockId = stock.StockId,
                    Price = price,
                    Volume = volume,
                    RecordedAt = recordedAt
                });

                _logger.LogInformation("Used Stooq fallback quote for {Symbol} at {Price}", stock.Symbol, price);
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Stooq fallback quote failed for {Symbol}", stock.Symbol);
                return false;
            }
        }

        private async Task<bool> TryIngestQuoteFromYahooAsync(Stock stock, CancellationToken cancellationToken)
        {
            try
            {
                var symbol = stock.Symbol.Trim().ToUpperInvariant();
                if (string.IsNullOrWhiteSpace(symbol))
                {
                    return false;
                }

                var url = $"https://query1.finance.yahoo.com/v8/finance/chart/{Uri.EscapeDataString(symbol)}?interval=1d&range=5d";
                using var response = await _httpClient.GetAsync(url, cancellationToken);
                if ((int)response.StatusCode == 429)
                {
                    _logger.LogWarning("Yahoo fallback quote rate-limited (429) for {Symbol}", stock.Symbol);
                    return false;
                }
                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogWarning(
                        "Yahoo fallback quote failed for {Symbol} with status code {StatusCode}",
                        stock.Symbol,
                        (int)response.StatusCode);
                    return false;
                }

                await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
                using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);

                if (!document.RootElement.TryGetProperty("chart", out var chart) ||
                    !chart.TryGetProperty("result", out var resultArray) ||
                    resultArray.ValueKind != JsonValueKind.Array ||
                    resultArray.GetArrayLength() == 0)
                {
                    return false;
                }

                var result = resultArray[0];
                if (!result.TryGetProperty("meta", out var meta))
                {
                    return false;
                }

                decimal? price = null;
                if (meta.TryGetProperty("regularMarketPrice", out var marketPriceEl) && marketPriceEl.ValueKind == JsonValueKind.Number)
                {
                    price = marketPriceEl.TryGetDecimal(out var p) ? p : (decimal)marketPriceEl.GetDouble();
                }

                if (price is null || price <= 0m)
                {
                    return false;
                }

                long volume = 0;
                if (meta.TryGetProperty("regularMarketVolume", out var volumeEl) && volumeEl.ValueKind == JsonValueKind.Number)
                {
                    volume = volumeEl.TryGetInt64(out var v) ? v : (long)volumeEl.GetDouble();
                }

                var recordedAt = DateTime.UtcNow;
                if (meta.TryGetProperty("regularMarketTime", out var timeEl) && timeEl.ValueKind == JsonValueKind.Number)
                {
                    var unix = timeEl.TryGetInt64(out var ts) ? ts : (long)timeEl.GetDouble();
                    if (unix > 0)
                    {
                        recordedAt = DateTimeOffset.FromUnixTimeSeconds(unix).UtcDateTime;
                    }
                }

                var yahooExists = await _dbContext.PriceData
                    .AnyAsync(p => p.StockId == stock.StockId && p.RecordedAt == recordedAt, cancellationToken);
                if (yahooExists)
                {
                    _logger.LogDebug("Yahoo quote for {Symbol} at {RecordedAt} already exists, skipping", stock.Symbol, recordedAt);
                    return true;
                }

                _dbContext.PriceData.Add(new PriceData
                {
                    StockId = stock.StockId,
                    Price = price.Value,
                    Volume = volume,
                    RecordedAt = recordedAt
                });

                _logger.LogInformation("Used Yahoo fallback quote for {Symbol} at {Price}", stock.Symbol, price.Value);
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Yahoo fallback quote failed for {Symbol}", stock.Symbol);
                return false;
            }
        }
    }
}
