using System.Collections.Concurrent;
using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Server.Data;
using Server.Models;

namespace Server.Services;

/// <summary>Value type so <c>Dictionary.TryGetValue</c> failure yields default structs, not null — avoids NRE when mapping quotes.</summary>
public readonly record struct QuoteTickerSnapshot(decimal Price, decimal Change, decimal ChangePercent);

public interface IStockMarketDataService
{
    Task RefreshQuoteIfStaleAsync(AppDbContext db, Stock stock, CancellationToken cancellationToken = default);
    Task<StockDetailEnrichment?> GetEnrichmentAsync(string symbol, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<WireNewsItem>> FetchFinnhubCompanyNewsAsync(string symbol, CancellationToken cancellationToken = default);

    /// <summary>Yahoo v7 batch quotes for watchlist movers (regular session change / %).</summary>
    Task<IReadOnlyDictionary<string, QuoteTickerSnapshot>> GetYahooQuotesAsync(
        IEnumerable<string> symbols,
        CancellationToken cancellationToken = default);
}

public sealed record WireNewsItem(string Title, DateTime PublishedAtUtc, string Source);

public sealed class StockDetailEnrichment
{
    public string? CompanyDescription { get; init; }
    /// <summary>GICS sector when Yahoo provides it.</summary>
    public string? Sector { get; init; }
    public string? Industry { get; init; }
    public string? EmployeesDisplay { get; init; }
    public string? HeadquartersDisplay { get; init; }
    public decimal? Open { get; init; }
    public decimal? High { get; init; }
    public decimal? Low { get; init; }
    public decimal? RegularMarketPrice { get; init; }
    public long? RegularMarketVolume { get; init; }
    public long? AverageVolume { get; init; }
    public string? MarketCapDisplay { get; init; }
    public decimal? TrailingPe { get; init; }
    public decimal? FiftyTwoWeekHigh { get; init; }
    public decimal? FiftyTwoWeekLow { get; init; }
    public string? DividendDisplay { get; init; }
    public decimal? Beta { get; init; }
}

public sealed class StockMarketDataService : IStockMarketDataService
{
    public const string YahooHttpClientName = "YahooFinance";

    private static readonly ConcurrentDictionary<string, DateTimeOffset> QuoteRefreshCooldown = new(StringComparer.OrdinalIgnoreCase);
    private static readonly ConcurrentDictionary<string, (DateTimeOffset Until, StockDetailEnrichment Data)> EnrichmentCache = new(StringComparer.OrdinalIgnoreCase);
    private static readonly ConcurrentDictionary<string, (DateTimeOffset Until, IReadOnlyList<WireNewsItem> Items)> NewsCache = new(StringComparer.OrdinalIgnoreCase);

    private static readonly TimeSpan EnrichmentTtl = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan NewsTtl = TimeSpan.FromMinutes(3);
    private static readonly TimeSpan PriceStaleThreshold = TimeSpan.FromMinutes(12);
    private static readonly TimeSpan QuoteRefreshMinGap = TimeSpan.FromSeconds(45);

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<StockMarketDataService> _logger;
    private readonly string _finnhubApiKey;

    public StockMarketDataService(
        IHttpClientFactory httpClientFactory,
        ILogger<StockMarketDataService> logger,
        IConfiguration configuration)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
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

    public async Task RefreshQuoteIfStaleAsync(AppDbContext db, Stock stock, CancellationToken cancellationToken = default)
    {
        var sym = stock.Symbol.Trim().ToUpperInvariant();
        var latest = await db.PriceData
            .AsNoTracking()
            .Where(p => p.StockId == stock.StockId)
            .OrderByDescending(p => p.RecordedAt)
            .Select(p => new { p.RecordedAt })
            .FirstOrDefaultAsync(cancellationToken);

        var now = DateTime.UtcNow;
        if (latest != null && now - latest.RecordedAt < PriceStaleThreshold)
        {
            return;
        }

        if (QuoteRefreshCooldown.TryGetValue(sym, out var until) && DateTimeOffset.UtcNow < until)
        {
            return;
        }

        QuoteRefreshCooldown[sym] = DateTimeOffset.UtcNow.Add(QuoteRefreshMinGap);

        try
        {
            var client = _httpClientFactory.CreateClient(YahooHttpClientName);
            var url =
                $"https://query1.finance.yahoo.com/v7/finance/quote?symbols={Uri.EscapeDataString(sym)}";
            using var response = await client.GetAsync(url, cancellationToken);
            if ((int)response.StatusCode == 429)
            {
                _logger.LogWarning("Yahoo quote refresh rate-limited (429) for {Symbol}", sym);
                return;
            }

            if (!response.IsSuccessStatusCode)
            {
                return;
            }

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
            if (!document.RootElement.TryGetProperty("quoteResponse", out var qr) ||
                !qr.TryGetProperty("result", out var arr) ||
                arr.ValueKind != JsonValueKind.Array ||
                arr.GetArrayLength() == 0)
            {
                return;
            }

            var node = arr[0];
            var price = TryGetDecimal(node, "regularMarketPrice")
                ?? TryGetDecimal(node, "postMarketPrice")
                ?? TryGetDecimal(node, "preMarketPrice");
            if (price is null or <= 0m)
            {
                return;
            }

            long volume = 0;
            if (TryGetLong(node, "regularMarketVolume", out var rv))
            {
                volume = rv;
            }

            var recordedAt = DateTime.UtcNow;
            if (TryGetLong(node, "regularMarketTime", out var unix) && unix > 0)
            {
                recordedAt = DateTimeOffset.FromUnixTimeSeconds(unix).UtcDateTime;
            }

            var dup = await db.PriceData.AnyAsync(
                p => p.StockId == stock.StockId &&
                     p.RecordedAt >= recordedAt.AddSeconds(-30) &&
                     Math.Abs(p.Price - price.Value) < 0.0001m,
                cancellationToken);
            if (dup)
            {
                return;
            }

            db.PriceData.Add(new PriceData
            {
                StockId = stock.StockId,
                Price = price.Value,
                Volume = volume,
                RecordedAt = recordedAt
            });
            await db.SaveChangesAsync(cancellationToken);
            _logger.LogInformation("Refreshed stale quote from Yahoo for {Symbol}", sym);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "On-demand Yahoo quote refresh failed for {Symbol}", sym);
        }
    }

    public async Task<StockDetailEnrichment?> GetEnrichmentAsync(string symbol, CancellationToken cancellationToken = default)
    {
        var sym = symbol.Trim().ToUpperInvariant();
        if (EnrichmentCache.TryGetValue(sym, out var cached) && DateTimeOffset.UtcNow < cached.Until)
        {
            return cached.Data;
        }

        try
        {
            StockDetailEnrichment? merged = null;

            merged = Merge(merged, await TryYahooQuoteSummaryAsync(sym, "query2.finance.yahoo.com", cancellationToken));
            if (!HasRichFundamentals(merged))
            {
                merged = Merge(merged, await TryYahooQuoteSummaryAsync(sym, "query1.finance.yahoo.com", cancellationToken));
            }

            merged = Merge(merged, await TryYahooV7QuoteEnrichmentAsync(sym, cancellationToken));

            if (!string.IsNullOrWhiteSpace(_finnhubApiKey))
            {
                merged = Merge(merged, await TryFinnhubProfileEnrichmentAsync(sym, cancellationToken));
                merged = Merge(merged, await TryFinnhubStockMetricEnrichmentAsync(sym, cancellationToken));
            }

            merged ??= new StockDetailEnrichment();
            var ttl = string.IsNullOrWhiteSpace(merged.DividendDisplay)
                ? TimeSpan.FromMinutes(1)
                : EnrichmentTtl;

            EnrichmentCache[sym] = (DateTimeOffset.UtcNow.Add(ttl), merged);
            return merged;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Market enrichment failed for {Symbol}", symbol);
            return new StockDetailEnrichment();
        }
    }

    public async Task<IReadOnlyList<WireNewsItem>> FetchFinnhubCompanyNewsAsync(string symbol, CancellationToken cancellationToken = default)
    {
        var sym = symbol.Trim().ToUpperInvariant();
        if (string.IsNullOrWhiteSpace(_finnhubApiKey))
        {
            return Array.Empty<WireNewsItem>();
        }

        if (NewsCache.TryGetValue(sym, out var cached) && DateTimeOffset.UtcNow < cached.Until)
        {
            return cached.Items;
        }

        try
        {
            var client = _httpClientFactory.CreateClient(YahooHttpClientName);
            var to = DateTime.UtcNow.Date;
            var from = to.AddDays(-14);
            var url =
                $"https://finnhub.io/api/v1/company-news?symbol={Uri.EscapeDataString(sym)}" +
                $"&from={from:yyyy-MM-dd}&to={to:yyyy-MM-dd}&token={Uri.EscapeDataString(_finnhubApiKey)}";

            using var response = await client.GetAsync(url, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return Array.Empty<WireNewsItem>();
            }

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
            if (document.RootElement.ValueKind != JsonValueKind.Array)
            {
                return Array.Empty<WireNewsItem>();
            }

            var list = new List<WireNewsItem>();
            foreach (var item in document.RootElement.EnumerateArray().Take(40))
            {
                var headline = item.TryGetProperty("headline", out var h) ? (h.GetString() ?? "").Trim() : "";
                if (string.IsNullOrWhiteSpace(headline))
                {
                    continue;
                }

                var source = item.TryGetProperty("source", out var s) ? (s.GetString() ?? "News").Trim() : "News";
                var dt = DateTime.UtcNow;
                if (item.TryGetProperty("datetime", out var dtEl) && dtEl.ValueKind == JsonValueKind.Number)
                {
                    var unix = dtEl.TryGetInt64(out var ts) ? ts : (long)dtEl.GetDouble();
                    if (unix > 0)
                    {
                        dt = DateTimeOffset.FromUnixTimeSeconds(unix).UtcDateTime;
                    }
                }

                list.Add(new WireNewsItem(headline, dt, source));
            }

            var ordered = list.OrderByDescending(x => x.PublishedAtUtc).ToList();
            NewsCache[sym] = (DateTimeOffset.UtcNow.Add(NewsTtl), ordered);
            return ordered;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Finnhub company-news fetch failed for {Symbol}", sym);
            return Array.Empty<WireNewsItem>();
        }
    }

    public async Task<IReadOnlyDictionary<string, QuoteTickerSnapshot>> GetYahooQuotesAsync(
        IEnumerable<string> symbols,
        CancellationToken cancellationToken = default)
    {
        var symList = symbols
            .Select(s => s.Trim().ToUpperInvariant())
            .Where(s => s.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        var dict = new Dictionary<string, QuoteTickerSnapshot>(StringComparer.OrdinalIgnoreCase);
        if (symList.Count == 0)
        {
            return dict;
        }

        const int chunkSize = 40;
        var client = _httpClientFactory.CreateClient(YahooHttpClientName);

        for (var i = 0; i < symList.Count; i += chunkSize)
        {
            var chunk = symList.Skip(i).Take(chunkSize).ToList();
            var joined = string.Join(",", chunk.Select(Uri.EscapeDataString));
            var url = $"https://query1.finance.yahoo.com/v7/finance/quote?symbols={joined}";
            try
            {
                using var response = await client.GetAsync(url, cancellationToken);
                if ((int)response.StatusCode == 429 || !response.IsSuccessStatusCode)
                {
                    continue;
                }

                await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
                using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
                if (!document.RootElement.TryGetProperty("quoteResponse", out var qr) ||
                    !qr.TryGetProperty("result", out var arr) ||
                    arr.ValueKind != JsonValueKind.Array)
                {
                    continue;
                }

                foreach (var q in arr.EnumerateArray())
                {
                    var sym = q.TryGetProperty("symbol", out var sEl) ? sEl.GetString() : null;
                    if (string.IsNullOrEmpty(sym))
                    {
                        continue;
                    }

                    var price = TryGetDecimal(q, "regularMarketPrice")
                        ?? TryGetDecimal(q, "postMarketPrice")
                        ?? TryGetDecimal(q, "preMarketPrice")
                        ?? 0m;
                    var chg = TryGetDecimal(q, "regularMarketChange") ?? 0m;
                    var pct = TryGetDecimal(q, "regularMarketChangePercent") ?? 0m;

                    dict[sym] = new QuoteTickerSnapshot(price, chg, pct);
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Yahoo batch quote chunk failed");
            }
        }

        return dict;
    }

    private static bool HasRichFundamentals(StockDetailEnrichment? e) =>
        e is not null &&
        (!string.IsNullOrWhiteSpace(e.CompanyDescription) ||
         !string.IsNullOrWhiteSpace(e.MarketCapDisplay) ||
         e.TrailingPe is not null);

    private static StockDetailEnrichment? Merge(StockDetailEnrichment? b, StockDetailEnrichment? o)
    {
        if (o is null)
        {
            return b;
        }

        if (b is null)
        {
            return o;
        }

        return new StockDetailEnrichment
        {
            CompanyDescription = Pick(o.CompanyDescription, b.CompanyDescription),
            Sector = Pick(o.Sector, b.Sector),
            Industry = Pick(o.Industry, b.Industry),
            EmployeesDisplay = Pick(o.EmployeesDisplay, b.EmployeesDisplay),
            HeadquartersDisplay = Pick(o.HeadquartersDisplay, b.HeadquartersDisplay),
            Open = o.Open ?? b.Open,
            High = o.High ?? b.High,
            Low = o.Low ?? b.Low,
            RegularMarketPrice = o.RegularMarketPrice ?? b.RegularMarketPrice,
            RegularMarketVolume = o.RegularMarketVolume ?? b.RegularMarketVolume,
            AverageVolume = o.AverageVolume ?? b.AverageVolume,
            MarketCapDisplay = Pick(o.MarketCapDisplay, b.MarketCapDisplay),
            TrailingPe = o.TrailingPe ?? b.TrailingPe,
            FiftyTwoWeekHigh = o.FiftyTwoWeekHigh ?? b.FiftyTwoWeekHigh,
            FiftyTwoWeekLow = o.FiftyTwoWeekLow ?? b.FiftyTwoWeekLow,
            DividendDisplay = Pick(o.DividendDisplay, b.DividendDisplay),
            Beta = o.Beta ?? b.Beta
        };
    }

    private static string? Pick(string? primary, string? fallback) =>
        !string.IsNullOrWhiteSpace(primary) ? primary : fallback;

    private async Task<StockDetailEnrichment?> TryYahooQuoteSummaryAsync(
        string symbol,
        string host,
        CancellationToken cancellationToken)
    {
        try
        {
            var client = _httpClientFactory.CreateClient(YahooHttpClientName);
            var url =
                $"https://{host}/v10/finance/quoteSummary/{Uri.EscapeDataString(symbol)}" +
                "?modules=assetProfile,summaryDetail,defaultKeyStatistics,price";

            using var response = await client.GetAsync(url, cancellationToken);
            if (!response.IsSuccessStatusCode || (int)response.StatusCode == 429)
            {
                return null;
            }

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);

            if (!document.RootElement.TryGetProperty("quoteSummary", out var qs) ||
                !qs.TryGetProperty("result", out var resultArr) ||
                resultArr.ValueKind != JsonValueKind.Array ||
                resultArr.GetArrayLength() == 0)
            {
                return null;
            }

            return ParseQuoteSummaryRoot(resultArr[0]);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Yahoo quoteSummary from {Host} failed for {Symbol}", host, symbol);
            return null;
        }
    }

    private async Task<StockDetailEnrichment?> TryYahooV7QuoteEnrichmentAsync(string symbol, CancellationToken cancellationToken)
    {
        try
        {
            var client = _httpClientFactory.CreateClient(YahooHttpClientName);
            var url = $"https://query1.finance.yahoo.com/v7/finance/quote?symbols={Uri.EscapeDataString(symbol)}";
            using var response = await client.GetAsync(url, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return null;
            }

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
            if (!document.RootElement.TryGetProperty("quoteResponse", out var qr) ||
                !qr.TryGetProperty("result", out var arr) ||
                arr.ValueKind != JsonValueKind.Array ||
                arr.GetArrayLength() == 0)
            {
                return null;
            }

            var q = arr[0];
            long? vol = TryGetLongDirect(q, "regularMarketVolume");
            long? avg =
                TryGetLongDirect(q, "averageDailyVolume10Day") ??
                TryGetLongDirect(q, "averageDailyVolume3Month") ??
                TryGetLongDirect(q, "averageDailyVolume");

            decimal? mcRaw = TryGetDecimal(q, "marketCap");
            string? mcFmt = mcRaw is > 0
                ? FormatMarketCapNumber(mcRaw.Value)
                : null;

            string? div = null;
            if (q.TryGetProperty("dividendYield", out var dy))
            {
                div = FormatYieldLike(dy);
            }

            if (string.IsNullOrEmpty(div) && q.TryGetProperty("trailingAnnualDividendYield", out var tay))
            {
                div = FormatYieldLike(tay);
            }

            var divRate = TryGetDecimal(q, "trailingAnnualDividendRate") ?? TryGetDecimal(q, "dividendRate");
            var divYield = TryGetDecimal(q, "dividendYield") ?? TryGetDecimal(q, "trailingAnnualDividendYield");
            if (string.IsNullOrEmpty(div))
            {
                div = BuildDividendDisplay(divRate, divYield);
            }

            var trailPe = TryGetDecimal(q, "trailingPE") ?? TryGetDecimal(q, "forwardPE");

            return new StockDetailEnrichment
            {
                Open = TryGetDecimal(q, "regularMarketOpen"),
                High = TryGetDecimal(q, "regularMarketDayHigh"),
                Low = TryGetDecimal(q, "regularMarketDayLow"),
                RegularMarketPrice = TryGetDecimal(q, "regularMarketPrice"),
                RegularMarketVolume = vol,
                AverageVolume = avg,
                MarketCapDisplay = mcFmt,
                TrailingPe = trailPe,
                FiftyTwoWeekHigh = TryGetDecimal(q, "fiftyTwoWeekHigh"),
                FiftyTwoWeekLow = TryGetDecimal(q, "fiftyTwoWeekLow"),
                DividendDisplay = div,
                Beta = TryGetDecimal(q, "beta")
            };
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Yahoo v7 quote enrichment failed for {Symbol}", symbol);
            return null;
        }
    }

    private static string FormatMarketCapNumber(decimal raw)
    {
        if (raw >= 1_000_000_000_000m)
        {
            return $"{raw / 1_000_000_000_000m:F2}T";
        }

        if (raw >= 1_000_000_000m)
        {
            return $"{raw / 1_000_000_000m:F2}B";
        }

        if (raw >= 1_000_000m)
        {
            return $"{raw / 1_000_000m:F1}M";
        }

        return raw.ToString("N0", CultureInfo.InvariantCulture);
    }

    private async Task<StockDetailEnrichment?> TryFinnhubProfileEnrichmentAsync(string symbol, CancellationToken cancellationToken)
    {
        try
        {
            var url =
                $"https://finnhub.io/api/v1/stock/profile2?symbol={Uri.EscapeDataString(symbol)}&token={Uri.EscapeDataString(_finnhubApiKey)}";
            using var client = _httpClientFactory.CreateClient(YahooHttpClientName);
            using var response = await client.GetAsync(url, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return null;
            }

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
            var root = document.RootElement;

            var industry = root.TryGetProperty("finnhubIndustry", out var ind) ? ind.GetString() : null;
            var country = root.TryGetProperty("country", out var co) ? co.GetString() : null;
            var city = root.TryGetProperty("city", out var ci) ? ci.GetString() : null;
            long? employees = null;
            if (root.TryGetProperty("employeeTotal", out var emp) && emp.ValueKind == JsonValueKind.Number)
            {
                employees = emp.TryGetInt64(out var e) ? e : (long)emp.GetDouble();
            }

            string? hq = null;
            var parts = new[] { city, country }.Where(x => !string.IsNullOrWhiteSpace(x)).ToArray();
            if (parts.Length > 0)
            {
                hq = string.Join(", ", parts);
            }

            string? mcap = null;
            if (root.TryGetProperty("marketCapitalization", out var mcEl) && mcEl.ValueKind == JsonValueKind.Number)
            {
                var millions = mcEl.TryGetDouble(out var m) ? m : mcEl.GetDouble();
                var dollars = (decimal)(millions * 1_000_000d);
                if (dollars > 0)
                {
                    mcap = FormatMarketCapNumber(dollars);
                }
            }

            return new StockDetailEnrichment
            {
                Industry = industry,
                EmployeesDisplay = employees is > 0 ? employees.Value.ToString("N0", CultureInfo.InvariantCulture) : null,
                HeadquartersDisplay = hq,
                MarketCapDisplay = mcap
            };
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Finnhub profile2 enrichment failed for {Symbol}", symbol);
            return null;
        }
    }

    /// <summary>Fills avg volume, P/E, dividend when Yahoo quoteSummary/v7 returns 401/empty — uses Finnhub <c>/stock/metric?metric=all</c>.</summary>
    private async Task<StockDetailEnrichment?> TryFinnhubStockMetricEnrichmentAsync(
        string symbol,
        CancellationToken cancellationToken)
    {
        try
        {
            var url =
                $"https://finnhub.io/api/v1/stock/metric?symbol={Uri.EscapeDataString(symbol)}&metric=all&token={Uri.EscapeDataString(_finnhubApiKey)}";
            using var client = _httpClientFactory.CreateClient(YahooHttpClientName);
            using var response = await client.GetAsync(url, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return null;
            }

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
            var root = document.RootElement;
            if (!root.TryGetProperty("metric", out var metric))
            {
                return null;
            }

            long? avgVol =
                TryLongMetric(metric, "10DayAverageTradingVolume", "10DayAvgTradeVolume") ??
                TryLongMetric(metric, "30DayAverageTradingVolume") ??
                TryLongMetric(metric, "3MonthAverageTradingVolume");

            decimal? pe =
                TryDecimalMetric(metric, "peNormalizedAnnual", "peBasicExclExtraTTM", "peAnnual", "peTTM");

            decimal? divYield =
                TryDecimalMetric(metric, "dividendYieldIndicatedAnnual", "dividendYieldTTM", "dividendYield");

            string? divFmt = null;
            if (divYield is > 0m)
            {
                var v = divYield.Value;
                divFmt = $"{(v <= 1m ? v * 100m : v):0.##}%";
            }

            return new StockDetailEnrichment
            {
                AverageVolume = avgVol,
                TrailingPe = pe,
                DividendDisplay = divFmt
            };
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Finnhub stock/metric enrichment failed for {Symbol}", symbol);
            return null;
        }
    }

    private static long? TryLongMetric(JsonElement metric, params string[] propertyNames)
    {
        foreach (var name in propertyNames)
        {
            if (!metric.TryGetProperty(name, out var el) || el.ValueKind != JsonValueKind.Number)
            {
                continue;
            }

            try
            {
                var d = el.GetDouble();
                if (d > 0 && d < 1e15)
                {
                    return (long)Math.Round(d, MidpointRounding.AwayFromZero);
                }
            }
            catch
            {
                // ignore
            }
        }

        return null;
    }

    private static decimal? TryDecimalMetric(JsonElement metric, params string[] propertyNames)
    {
        foreach (var name in propertyNames)
        {
            if (!metric.TryGetProperty(name, out var el) || el.ValueKind != JsonValueKind.Number)
            {
                continue;
            }

            try
            {
                var v = el.TryGetDecimal(out var dec) ? dec : (decimal)el.GetDouble();
                if (v is > 0 and < 1_000_000m)
                {
                    return v;
                }
            }
            catch
            {
                // ignore
            }
        }

        return null;
    }

    private static StockDetailEnrichment ParseQuoteSummaryRoot(JsonElement root)
    {
        JsonElement? asset = root.TryGetProperty("assetProfile", out var ap) ? ap : null;
        JsonElement? summary = root.TryGetProperty("summaryDetail", out var sd) ? sd : null;
        JsonElement? stats = root.TryGetProperty("defaultKeyStatistics", out var dk) ? dk : null;
        JsonElement? priceMod = root.TryGetProperty("price", out var pr) ? pr : null;

        string? desc = asset?.TryGetProperty("longBusinessSummary", out var lbs) == true
            ? lbs.GetString()
            : null;

        string? sector = asset?.TryGetProperty("sector", out var sectorEl) == true ? sectorEl.GetString() : null;
        var industry = asset?.TryGetProperty("industry", out var ind) == true ? ind.GetString() : null;
        if (string.IsNullOrWhiteSpace(industry))
        {
            industry = sector;
        }

        string? employees = null;
        if (asset?.TryGetProperty("fullTimeEmployees", out var empEl) == true && empEl.ValueKind == JsonValueKind.Number)
        {
            var n = empEl.TryGetInt64(out var e) ? e : (long)empEl.GetDouble();
            employees = n > 0 ? n.ToString("N0", CultureInfo.InvariantCulture) : null;
        }

        string? hq = null;
        if (asset is not null)
        {
            var city = asset.Value.TryGetProperty("city", out var c) ? c.GetString() : null;
            var state = asset.Value.TryGetProperty("state", out var st) ? st.GetString() : null;
            var country = asset.Value.TryGetProperty("country", out var co2) ? co2.GetString() : null;
            var parts = new[] { city, state, country }.Where(x => !string.IsNullOrWhiteSpace(x)).ToArray();
            if (parts.Length > 0)
            {
                hq = string.Join(", ", parts);
            }
        }

        var marketCapFmt = PickFmt(summary, "marketCap");
        var beta = TryDecimalFromKeyed(stats, "beta") ?? TryDecimalFromKeyed(priceMod, "beta");

        long? avgVol = TryLongKeyed(summary, "averageVolume")
            ?? TryLongKeyed(stats, "averageDailyVolume")
            ?? TryLongKeyed(stats, "averageVolume10days")
            ?? TryLongKeyed(stats, "averageVolume");
        var trailingPe = TryDecimalFromKeyed(summary, "trailingPE") ??
                         TryDecimalFromKeyed(stats, "forwardPE") ??
                         TryDecimalFromKeyed(summary, "forwardPE") ??
                         TryDecimalFromKeyed(stats, "trailingPE");

        decimal? fiftyTwoHigh = TryDecimalFromKeyed(summary, "fiftyTwoWeekHigh") ??
                                TryDecimalFromKeyed(stats, "fiftyTwoWeekHigh");
        decimal? fiftyTwoLow = TryDecimalFromKeyed(summary, "fiftyTwoWeekLow") ??
                               TryDecimalFromKeyed(stats, "fiftyTwoWeekLow");

        string? dividend = null;
        if (summary?.TryGetProperty("dividendYield", out var dy) == true)
        {
            dividend = FormatYieldLike(dy);
        }

        if (string.IsNullOrEmpty(dividend) && stats?.TryGetProperty("dividendYield", out var dy2) == true)
        {
            dividend = FormatYieldLike(dy2);
        }

        if (string.IsNullOrEmpty(dividend) && stats?.TryGetProperty("trailingAnnualDividendYield", out var tay) == true)
        {
            dividend = FormatYieldLike(tay);
        }

        var divRate = TryDecimalFromKeyed(summary, "dividendRate")
            ?? TryDecimalFromKeyed(stats, "trailingAnnualDividendRate")
            ?? TryDecimalFromKeyed(stats, "dividendRate");
        var divYield = TryDecimalFromKeyed(summary, "dividendYield")
            ?? TryDecimalFromKeyed(stats, "dividendYield")
            ?? TryDecimalFromKeyed(stats, "trailingAnnualDividendYield");
        if (string.IsNullOrEmpty(dividend))
        {
            dividend = BuildDividendDisplay(divRate, divYield);
        }

        decimal? open = TryDecimalFromKeyed(summary, "open") ?? TryDecimalFromKeyed(priceMod, "regularMarketOpen");
        decimal? dayHigh = TryDecimalFromKeyed(summary, "dayHigh") ?? TryDecimalFromKeyed(priceMod, "regularMarketDayHigh");
        decimal? dayLow = TryDecimalFromKeyed(summary, "dayLow") ?? TryDecimalFromKeyed(priceMod, "regularMarketDayLow");
        decimal? lastPrice = TryDecimalFromKeyed(priceMod, "regularMarketPrice");
        long? vol = TryLongKeyed(priceMod, "regularMarketVolume") ?? TryLongKeyed(summary, "volume");

        return new StockDetailEnrichment
        {
            CompanyDescription = desc,
            Sector = sector,
            Industry = industry,
            EmployeesDisplay = employees,
            HeadquartersDisplay = hq,
            Open = open,
            High = dayHigh,
            Low = dayLow,
            RegularMarketPrice = lastPrice,
            RegularMarketVolume = vol,
            AverageVolume = avgVol,
            MarketCapDisplay = marketCapFmt,
            TrailingPe = trailingPe,
            FiftyTwoWeekHigh = fiftyTwoHigh,
            FiftyTwoWeekLow = fiftyTwoLow,
            DividendDisplay = dividend,
            Beta = beta
        };
    }

    private static string? PickFmt(JsonElement? module, string prop)
    {
        if (module?.TryGetProperty(prop, out var el) != true)
        {
            return null;
        }

        if (el.TryGetProperty("fmt", out var fmt) && fmt.ValueKind == JsonValueKind.String)
        {
            var s = fmt.GetString();
            if (!string.IsNullOrWhiteSpace(s))
            {
                return s;
            }
        }

        if (el.TryGetProperty("raw", out var raw) && raw.ValueKind == JsonValueKind.Number)
        {
            return raw.TryGetDecimal(out var d) ? d.ToString("N0", CultureInfo.InvariantCulture) : raw.GetDouble().ToString(CultureInfo.InvariantCulture);
        }

        return null;
    }

    private static string? FormatYieldLike(JsonElement el)
    {
        if (el.ValueKind == JsonValueKind.Number)
        {
            var v = el.TryGetDecimal(out var d) ? d : (decimal)el.GetDouble();
            return $"{(v <= 1m ? v * 100m : v):0.##}%";
        }

        if (el.TryGetProperty("fmt", out var fmt) && fmt.ValueKind == JsonValueKind.String)
        {
            var s = fmt.GetString();
            if (!string.IsNullOrWhiteSpace(s))
            {
                return s;
            }
        }

        if (el.TryGetProperty("raw", out var raw) && raw.ValueKind == JsonValueKind.Number)
        {
            var v = raw.TryGetDecimal(out var d) ? d : (decimal)raw.GetDouble();
            return $"{(v <= 1m ? v * 100m : v):0.##}%";
        }

        return null;
    }

    private static string? BuildDividendDisplay(decimal? annualRate, decimal? yield)
    {
        var normalizedYield = yield.HasValue
            ? (yield.Value <= 1m ? yield.Value * 100m : yield.Value)
            : (decimal?)null;

        if (annualRate is > 0m && normalizedYield is > 0m)
        {
            return $"{annualRate.Value:0.##} ({normalizedYield.Value:0.##}%)";
        }

        if (annualRate is > 0m)
        {
            return annualRate.Value.ToString("0.##", CultureInfo.InvariantCulture);
        }

        if (normalizedYield is > 0m)
        {
            return $"{normalizedYield.Value:0.##}%";
        }

        return null;
    }

    private static decimal? TryDecimalFromKeyed(JsonElement? module, string prop)
    {
        if (module?.TryGetProperty(prop, out var el) != true)
        {
            return null;
        }

        return ExtractDecimal(el);
    }

    private static decimal? ExtractDecimal(JsonElement el)
    {
        if (el.ValueKind == JsonValueKind.Number)
        {
            return el.TryGetDecimal(out var d) ? d : (decimal)el.GetDouble();
        }

        if (el.TryGetProperty("raw", out var raw) && raw.ValueKind == JsonValueKind.Number)
        {
            return raw.TryGetDecimal(out var d) ? d : (decimal)raw.GetDouble();
        }

        return null;
    }

    private static long? TryLongKeyed(JsonElement? module, string prop)
    {
        if (module?.TryGetProperty(prop, out var el) != true)
        {
            return null;
        }

        if (el.ValueKind == JsonValueKind.Number)
        {
            return el.TryGetInt64(out var v) ? v : (long)el.GetDouble();
        }

        if (el.TryGetProperty("raw", out var raw) && raw.ValueKind == JsonValueKind.Number)
        {
            return raw.TryGetInt64(out var v) ? v : (long)raw.GetDouble();
        }

        return null;
    }

    private static bool TryGetLong(JsonElement node, string name, out long value)
    {
        value = 0;
        if (!node.TryGetProperty(name, out var el) || el.ValueKind != JsonValueKind.Number)
        {
            return false;
        }

        value = el.TryGetInt64(out var v) ? v : (long)el.GetDouble();
        return true;
    }

    private static long? TryGetLongDirect(JsonElement node, string name) =>
        TryGetLong(node, name, out var v) ? v : null;

    private static decimal? TryGetDecimal(JsonElement node, string name) =>
        node.TryGetProperty(name, out var el) ? ExtractDecimal(el) : null;
}
