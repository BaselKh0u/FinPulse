using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using Server.Config;
using Server.Data;
using Server.Models;
using Server.Services;
using System.Globalization;
using System.Security.Claims;
using System.Text.Json;

[Route("api/[controller]")]
[Route("stocks")]
[ApiController]
public class StockController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly AlphaVantageOptions _alphaOptions;
    private readonly string _apiKey;
    private readonly List<string> _apiKeys;
    private readonly ILogger<StockController> _logger;
    private readonly IServiceProvider _serviceProvider;
    private readonly AlphaVantageSymbolSearchThrottle _symbolSearchThrottle;
    private readonly IStockMarketDataService _marketData;
    private readonly IVaderSentimentService _vader;

    public StockController(
        AppDbContext context,
        IHttpClientFactory httpClientFactory,
        IOptions<AlphaVantageOptions> options,
        IConfiguration configuration,
        ILogger<StockController> logger,
        IServiceProvider serviceProvider,
        AlphaVantageSymbolSearchThrottle symbolSearchThrottle,
        IStockMarketDataService marketData,
        IVaderSentimentService vader)
    {
        _context = context;
        _httpClientFactory = httpClientFactory;
        _alphaOptions = options.Value;
        _apiKey = FirstNonEmpty(
            _alphaOptions.ApiKey,
            configuration["AlphaVantage:ApiKey"],
            Environment.GetEnvironmentVariable("AlphaVantage__ApiKey"));
        _apiKeys = ResolveApiKeys(configuration, _alphaOptions, _apiKey);
        _logger = logger;
        _serviceProvider = serviceProvider;
        _symbolSearchThrottle = symbolSearchThrottle;
        _marketData = marketData;
        _vader = vader;
    }

    private static string FormatCompactNumber(long? value)
    {
        if (value is null or <= 0)
        {
            return "N/A";
        }

        var n = value.Value;
        if (n >= 1_000_000_000)
        {
            return $"{n / 1_000_000_000d:F2}B";
        }

        if (n >= 1_000_000)
        {
            return $"{n / 1_000_000d:F1}M";
        }

        if (n >= 1_000)
        {
            return $"{n / 1_000d:F1}K";
        }

        return n.ToString("N0", CultureInfo.InvariantCulture);
    }

    private static string FirstNonEmpty(params string?[] values)
    {
        foreach (var value in values)
        {
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value.Trim();
            }
        }

        return string.Empty;
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

    private int GetUserId() => int.Parse(User.FindFirst("userId")!.Value);

    // GET: api/Stock
    // Returns the logged-in user's watchlist with latest price for each stock
    [Authorize]
    [HttpGet]
    public async Task<IActionResult> GetWatchlist(CancellationToken cancellationToken)
    {
        var userId = GetUserId();

        var watchlist = await _context.Watchlists
            .Where(w => w.UserId == userId)
            .Join(_context.Stocks,
                w => w.StockId,
                s => s.StockId,
                (w, s) => new { w.AddedAt, Stock = s })
            .ToListAsync(cancellationToken);

        var stockIds = watchlist.Select(w => w.Stock!.StockId).ToList();

        // Fetch latest PriceData for each stock in one query
        var latestPrices = await _context.PriceData
            .Where(p => stockIds.Contains(p.StockId))
            .GroupBy(p => p.StockId)
            .Select(g => g.OrderByDescending(p => p.RecordedAt).First())
            .ToListAsync(cancellationToken);

        var priceMap = latestPrices.ToDictionary(p => p.StockId);

        var symbols = watchlist.Select(w => w.Stock!.Symbol).ToList();
        var quotes = await _marketData.GetYahooQuotesAsync(symbols, cancellationToken);

        var result = watchlist.Select(w =>
        {
            var stk = w.Stock!;
            priceMap.TryGetValue(stk.StockId, out var dbRow);
            var symUpper = stk.Symbol.Trim().ToUpperInvariant();
            _ = quotes.TryGetValue(symUpper, out var snap);
            var hasYahoo = snap.Price > 0;

            var dbPx = dbRow?.Price ?? 0m;
            var px = hasYahoo ? snap.Price : dbPx;
            var change = hasYahoo ? snap.Change : 0m;
            var changePct = hasYahoo ? snap.ChangePercent : 0m;

            return new
            {
                stockId = stk.StockId,
                symbol = stk.Symbol,
                companyName = stk.CompanyName,
                sector = stk.Sector,
                price = px,
                change,
                changePercent = changePct,
                volume = dbRow?.Volume ?? 0,
                addedAt = w.AddedAt
            };
        });

        return Ok(result);
    }

    // POST: api/Stock
    // Add a stock to the user's watchlist by symbol
    [Authorize]
    [HttpPost]
    public async Task<IActionResult> AddToWatchlist([FromBody] AddStockRequest request)
    {
        var userId = GetUserId();

        var symbol = request.Symbol.ToUpper();

        var stock = await _context.Stocks.FirstOrDefaultAsync(s => s.Symbol == symbol);
        if (stock == null)
        {
            stock = new Stock { Symbol = symbol, CompanyName = symbol };
            _context.Stocks.Add(stock);
            await _context.SaveChangesAsync();

            // Enrich company name/sector and fetch initial price in background
            _ = Task.Run(async () =>
            {
                try
                {
                    var enrichment = await _marketData.GetEnrichmentAsync(symbol);
                    if (enrichment != null)
                    {
                        using var scope = _serviceProvider.CreateScope();
                        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                        var s = await db.Stocks.FirstOrDefaultAsync(x => x.Symbol == symbol);
                        if (s != null)
                        {
                            if (!string.IsNullOrWhiteSpace(enrichment.Sector))
                                s.Sector = enrichment.Sector;
                            if (enrichment.RegularMarketPrice > 0)
                            {
                                db.PriceData.Add(new PriceData
                                {
                                    StockId = s.StockId,
                                    Price = enrichment.RegularMarketPrice.Value,
                                    RecordedAt = DateTime.UtcNow
                                });
                            }
                            await db.SaveChangesAsync();
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Background enrichment failed for new symbol {Symbol}", symbol);
                }
            });
        }

        var alreadyInWatchlist = await _context.Watchlists
            .AnyAsync(w => w.UserId == userId && w.StockId == stock.StockId);

        if (alreadyInWatchlist)
            return BadRequest(new { message = "Stock is already in your watchlist." });

        _context.Watchlists.Add(new Watchlist { UserId = userId, StockId = stock.StockId });
        await _context.SaveChangesAsync();

        // Kick off news + sentiment ingestion for this symbol in the background
        _ = Task.Run(async () =>
        {
            try
            {
                var news = await _marketData.FetchFinnhubCompanyNewsAsync(symbol);
                if (news.Count == 0) return;

                using var scope = _serviceProvider.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var vader = scope.ServiceProvider.GetRequiredService<IVaderSentimentService>();

                var freshStock = await db.Stocks.FirstOrDefaultAsync(s => s.Symbol == symbol);
                if (freshStock is null) return;

                int added = 0;
                foreach (var item in news)
                {
                    var sep = AlphaVantageStockIngestionService.SourceChannelSeparator;
                    var fullSource = $"{item.Source}{sep}{item.Title}";
                    var exists = await db.SentimentAnalyses
                        .AnyAsync(sa => sa.StockId == freshStock.StockId && sa.Source == fullSource);
                    if (exists) continue;

                    var score = await vader.ScoreAsync(item.Title);
                    db.SentimentAnalyses.Add(new SentimentAnalysis
                    {
                        StockId = freshStock.StockId,
                        SentimentScore = score,
                        SentimentLabel = NewsSentimentScorer.LabelFromScore(score),
                        Source = fullSource,
                        AnalyzedAt = item.PublishedAtUtc
                    });
                    added++;
                }

                if (added > 0)
                {
                    await db.SaveChangesAsync();
                    _logger.LogInformation("Watchlist add: ingested {Count} Finnhub news items for {Symbol}", added, symbol);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Background news ingestion failed for {Symbol}", symbol);
            }
        });

        return Ok(new { message = "Stock added to watchlist.", stockId = stock.StockId });
    }

    // DELETE: api/Stock/{symbol}
    // Remove a stock from the user's watchlist
    [Authorize]
    [HttpDelete("{symbol}")]
    public async Task<IActionResult> RemoveFromWatchlist(string symbol)
    {
        var userId = GetUserId();

        var stock = await _context.Stocks.FirstOrDefaultAsync(s => s.Symbol == symbol.ToUpper());
        if (stock == null)
            return NotFound(new { message = "Stock not found." });

        var entry = await _context.Watchlists
            .FirstOrDefaultAsync(w => w.UserId == userId && w.StockId == stock.StockId);

        if (entry == null)
            return NotFound(new { message = "Stock is not in your watchlist." });

        _context.Watchlists.Remove(entry);
        await _context.SaveChangesAsync();

        return Ok(new { message = "Stock removed from watchlist." });
    }

    // GET: api/Stock/search?q={query}
    [HttpGet("search")]
    public async Task<IActionResult> Search([FromQuery] string? q = "")
    {
        if (string.IsNullOrWhiteSpace(q))
        {
            var allStocks = await _context.Stocks
                .OrderBy(s => s.Symbol)
                .Select(s => new
                {
                    stockId = s.StockId,
                    symbol = s.Symbol,
                    companyName = s.CompanyName,
                    sector = s.Sector,
                    price = _context.PriceData
                        .Where(p => p.StockId == s.StockId)
                        .OrderByDescending(p => p.RecordedAt)
                        .Select(p => (decimal?)p.Price)
                        .FirstOrDefault() ?? 0m
                })
                .ToListAsync();

            if (allStocks.Count > 0)
            {
                return Ok(allStocks);
            }

            if (_alphaOptions.Symbols?.Count > 0)
            {
                var normalizedSymbols = _alphaOptions.Symbols
                    .Select(s => s.Trim().ToUpperInvariant())
                    .Where(s => !string.IsNullOrWhiteSpace(s))
                    .Distinct()
                    .ToList();

                var existingStocks = await _context.Stocks
                    .Where(s => normalizedSymbols.Contains(s.Symbol))
                    .Select(s => new
                    {
                        s.StockId,
                        s.Symbol,
                        s.CompanyName,
                        s.Sector,
                        Price = _context.PriceData
                            .Where(p => p.StockId == s.StockId)
                            .OrderByDescending(p => p.RecordedAt)
                            .Select(p => (decimal?)p.Price)
                            .FirstOrDefault() ?? 0m
                    })
                    .ToListAsync();

                var bySymbol = existingStocks.ToDictionary(s => s.Symbol, StringComparer.OrdinalIgnoreCase);
                return Ok(normalizedSymbols.Select(symbol =>
                {
                    if (bySymbol.TryGetValue(symbol, out var existing))
                    {
                        return new
                        {
                            stockId = existing.StockId,
                            symbol = existing.Symbol,
                            companyName = existing.CompanyName,
                            sector = existing.Sector,
                            price = existing.Price
                        };
                    }

                    return new
                    {
                        stockId = 0,
                        symbol,
                        companyName = symbol,
                        sector = string.Empty,
                        price = 0m
                    };
                }));
            }

            return Ok(Array.Empty<object>());
        }

        var term = q.Trim().ToUpper();

        var results = (await _context.Stocks
            .Where(s => s.Symbol.ToUpper().Contains(term) || s.CompanyName.ToUpper().Contains(term))
            .Select(s => new
            {
                stockId = s.StockId,
                symbol = s.Symbol,
                companyName = s.CompanyName,
                sector = s.Sector,
                price = _context.PriceData
                    .Where(p => p.StockId == s.StockId)
                    .OrderByDescending(p => p.RecordedAt)
                    .Select(p => (decimal?)p.Price)
                    .FirstOrDefault() ?? 0m
            })
            .ToListAsync()).Cast<object>().ToList();

        if (results.Count == 0)
        {
            _logger.LogInformation("No DB results for {Query}, trying Finnhub symbol search", q);
            var finnhubMatches = await _marketData.SearchSymbolsAsync(q);
            if (finnhubMatches.Count > 0)
            {
                var matchSymbols = finnhubMatches.Select(m => m.Symbol).ToList();
                var existing = await _context.Stocks
                    .Where(s => matchSymbols.Contains(s.Symbol))
                    .ToDictionaryAsync(s => s.Symbol, StringComparer.OrdinalIgnoreCase);

                results = finnhubMatches.Select(m =>
                {
                    existing.TryGetValue(m.Symbol, out var dbStock);
                    return (object)new
                    {
                        stockId = dbStock?.StockId ?? 0,
                        symbol = m.Symbol,
                        companyName = dbStock?.CompanyName ?? m.Description,
                        sector = dbStock?.Sector ?? string.Empty,
                        price = 0m
                    };
                }).ToList();
            }
        }

        if (results.Count == 0 && _apiKeys.Count > 0)
        {
            var key = GetAvailableApiKey();
            if (key is null)
            {
                AlphaVantageRateLimitGuard.IsAnyBlocked(out var blockedUntilUtc, out var reason);
                _logger.LogWarning(
                    "Skipping Alpha Vantage search, all keys are cooling down. First unblock at {BlockedUntil}. Reason: {Reason}",
                    blockedUntilUtc, reason);
            }
            else if (!_symbolSearchThrottle.TryConsume(out var searchRetryAfter))
            {
                _logger.LogWarning(
                    "Skipping Alpha Vantage symbol search (min-interval throttle). Retry after ~{RetrySeconds:F0}s.",
                    searchRetryAfter?.TotalSeconds ?? 0);
            }
            else
            {
                _logger.LogInformation("No Finnhub results for {Query}, trying Alpha Vantage", q);
                results = await SearchAlphaVantageAsync(q, key);
            }
        }

        if (results.Count == 0 && _alphaOptions.Symbols?.Count > 0)
        {
            results = _alphaOptions.Symbols
                .Select(s => s.Trim().ToUpperInvariant())
                .Where(s => s.Contains(term, StringComparison.OrdinalIgnoreCase))
                .Select(s => (object)new
                {
                    stockId = 0,
                    symbol = s,
                    companyName = s,
                    sector = string.Empty
                })
                .ToList();
        }

        return Ok(results);
    }

    // Debug endpoint - test Alpha Vantage directly
    [HttpGet("debug/av-test")]
    public async Task<IActionResult> DebugAlphaVantageTest([FromQuery] string symbol = "MSFT")
    {
        try
        {
            _logger.LogInformation("Testing Alpha Vantage with symbol: {Symbol}", symbol);
            
            var client = _httpClientFactory.CreateClient();
            var testKey = GetAvailableApiKey();
            if (string.IsNullOrWhiteSpace(testKey))
            {
                return Ok(new
                {
                    statusCode = "NoKeyAvailable",
                    isSuccess = false,
                    apiKeyConfigured = _apiKeys.Count > 0,
                    activeKeyCount = _apiKeys.Count,
                    cooldownActive = AlphaVantageRateLimitGuard.IsAnyBlocked(out var blockedUntil, out var why),
                    blockedUntilUtc = blockedUntil,
                    cooldownReason = why,
                    response = "No Alpha Vantage key is currently available (all keys cooling down or unset)."
                });
            }
            var url = $"{_alphaOptions.BaseUrl}/query?function=SYMBOL_SEARCH&keywords={Uri.EscapeDataString(symbol)}&apikey={testKey}";
            
            _logger.LogInformation("Request URL: {Url}", url);
            
            using var response = await client.GetAsync(url);
            var content = await response.Content.ReadAsStringAsync();
            
            _logger.LogInformation("Response: {Content}", content);
            var cooldownActive = AlphaVantageRateLimitGuard.IsAnyBlocked(out var blockedUntilUtc, out var reason);
            
            return Ok(new
            {
                statusCode = response.StatusCode,
                isSuccess = response.IsSuccessStatusCode,
                apiKeyConfigured = _apiKeys.Count > 0,
                activeKeyCount = _apiKeys.Count,
                cooldownActive,
                blockedUntilUtc,
                cooldownReason = reason,
                response = content[..Math.Min(500, content.Length)]
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error testing Alpha Vantage");
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpGet("debug/status")]
    public async Task<IActionResult> DebugStatus()
    {
        var totalStocks = await _context.Stocks.CountAsync();
        var stocksWithPrices = await _context.PriceData
            .Select(p => p.StockId)
            .Distinct()
            .CountAsync();
        var latestPriceAt = await _context.PriceData
            .OrderByDescending(p => p.RecordedAt)
            .Select(p => (DateTime?)p.RecordedAt)
            .FirstOrDefaultAsync();
        var latestSentimentAt = await _context.SentimentAnalyses
            .OrderByDescending(s => s.AnalyzedAt)
            .Select(s => (DateTime?)s.AnalyzedAt)
            .FirstOrDefaultAsync();

        var blockedKeys = _apiKeys
            .Where(k => AlphaVantageRateLimitGuard.IsBlocked(k, out _, out _))
            .Count();
        var availableKeys = _apiKeys.Count - blockedKeys;

        var cooldownActive = AlphaVantageRateLimitGuard.IsAnyBlocked(out var blockedUntilUtc, out var reason);

        return Ok(new
        {
            totalStocks,
            stocksWithPrices,
            latestPriceAt,
            latestSentimentAt,
            activeKeyCount = _apiKeys.Count,
            availableKeyCount = availableKeys,
            blockedKeyCount = blockedKeys,
            cooldownActive,
            blockedUntilUtc,
            cooldownReason = reason
        });
    }

    [HttpPost("debug/ingest-now")]
    public async Task<IActionResult> DebugIngestNow()
    {
        using var scope = _serviceProvider.CreateScope();
        var ingestionService = scope.ServiceProvider.GetRequiredService<IStockIngestionService>();
        await ingestionService.IngestAsync(CancellationToken.None, IngestionScope.Full);

        var latestPriceAt = await _context.PriceData
            .OrderByDescending(p => p.RecordedAt)
            .Select(p => (DateTime?)p.RecordedAt)
            .FirstOrDefaultAsync();
        var stocksWithPrices = await _context.PriceData
            .Select(p => p.StockId)
            .Distinct()
            .CountAsync();

        return Ok(new
        {
            message = "Ingestion run completed.",
            latestPriceAt,
            stocksWithPrices
        });
    }

    private async Task<List<object>> SearchAlphaVantageAsync(string query, string apiKey)
    {
        try
        {
            var client = _httpClientFactory.CreateClient();
            var url = $"{_alphaOptions.BaseUrl}/query?function=SYMBOL_SEARCH&keywords={Uri.EscapeDataString(query)}&apikey={apiKey}";
            
            _logger.LogInformation("Searching Alpha Vantage for: {Query}", query);
            
            using var response = await client.GetAsync(url);
            var responseContent = await response.Content.ReadAsStringAsync();
            
            _logger.LogInformation("Alpha Vantage response status: {Status}", response.StatusCode);
            
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Alpha Vantage API failed with status {Status}: {Content}", response.StatusCode, responseContent);
                return new List<object>();
            }

            await using var stream = await response.Content.ReadAsStreamAsync();
            using var document = await JsonDocument.ParseAsync(stream);

            // Log the full response for debugging
            _logger.LogInformation("Alpha Vantage raw response: {Response}", document.RootElement.GetRawText());

            if (!document.RootElement.TryGetProperty("bestMatches", out var matches) || matches.ValueKind != JsonValueKind.Array)
            {
                _logger.LogWarning("No bestMatches array in Alpha Vantage response");
                
                // Check for error message
                if (document.RootElement.TryGetProperty("Note", out var note))
                {
                    var noteText = note.GetString();
                    _logger.LogWarning("Alpha Vantage API limit note: {Note}", noteText);
                    AlphaVantageRateLimitGuard.MarkIfLimited(apiKey, noteText);
                }
                if (document.RootElement.TryGetProperty("Information", out var info))
                {
                    var infoText = info.GetString();
                    _logger.LogWarning("Alpha Vantage API information: {Info}", infoText);
                    AlphaVantageRateLimitGuard.MarkIfLimited(apiKey, infoText);
                }
                
                return new List<object>();
            }

            var results = new List<object>();
            foreach (var match in matches.EnumerateArray().Take(10))
            {
                var symbol = GetJsonProperty(match, "1. symbol");
                if (string.IsNullOrWhiteSpace(symbol))
                {
                    continue;
                }

                var companyName = GetJsonProperty(match, "2. name") ?? symbol;
                var normalizedSymbol = symbol.Trim().ToUpperInvariant();

                _logger.LogInformation("Creating/updating stock: {Symbol} - {Name}", normalizedSymbol, companyName);

                var stock = await _context.Stocks.FirstOrDefaultAsync(s => s.Symbol == normalizedSymbol);
                if (stock == null)
                {
                    stock = new Stock
                    {
                        Symbol = normalizedSymbol,
                        CompanyName = companyName,
                        Sector = string.Empty
                    };
                    _context.Stocks.Add(stock);
                    await _context.SaveChangesAsync();
                }

                var latestPrice = await _context.PriceData
                    .Where(p => p.StockId == stock.StockId)
                    .OrderByDescending(p => p.RecordedAt)
                    .Select(p => (decimal?)p.Price)
                    .FirstOrDefaultAsync();

                results.Add(new
                {
                    stockId = stock.StockId,
                    symbol = stock.Symbol,
                    companyName = stock.CompanyName,
                    sector = stock.Sector,
                    price = latestPrice ?? 0m
                });
            }

            _logger.LogInformation("Alpha Vantage search returned {Count} results for {Query}", results.Count, query);
            return results;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error searching Alpha Vantage for: {Query}", query);
            return new List<object>();
        }
    }

    private static string? GetJsonProperty(JsonElement element, string propertyName)
    {
        return element.TryGetProperty(propertyName, out var value) ? value.GetString() : null;
    }

    // GET: api/Stock/{symbol}/details
    [HttpGet("{symbol}/details")]
    public async Task<IActionResult> GetDetails(string symbol)
    {
        var sym = symbol.Trim().ToUpperInvariant();
        var stock = await _context.Stocks.FirstOrDefaultAsync(s => s.Symbol == sym);
        if (stock == null)
        {
            // Stock not in DB yet (came from Finnhub search) — create a stub and enrich immediately
            stock = new Stock { Symbol = sym, CompanyName = sym };
            _context.Stocks.Add(stock);
            await _context.SaveChangesAsync();

            var earlyEnrichment = await _marketData.GetEnrichmentAsync(sym);
            if (earlyEnrichment != null)
            {
                if (!string.IsNullOrWhiteSpace(earlyEnrichment.Sector)) stock.Sector = earlyEnrichment.Sector;
                if (earlyEnrichment.RegularMarketPrice > 0)
                {
                    _context.PriceData.Add(new PriceData
                    {
                        StockId = stock.StockId,
                        Price = earlyEnrichment.RegularMarketPrice.Value,
                        RecordedAt = DateTime.UtcNow
                    });
                }
                await _context.SaveChangesAsync();
            }
        }

        await _marketData.RefreshQuoteIfStaleAsync(_context, stock);

        var priceRows = await _context.PriceData
            .Where(p => p.StockId == stock.StockId)
            .OrderByDescending(p => p.RecordedAt)
            .Take(90)
            .Select(p => new { p.Price, p.Volume, p.RecordedAt })
            .ToListAsync();

        var chronological = priceRows.OrderBy(p => p.RecordedAt).ToList();
        var latestRow = chronological.Count > 0 ? chronological[^1] : null;

        var enrichment = await _marketData.GetEnrichmentAsync(stock.Symbol);

        var sentiments = await _context.SentimentAnalyses
            .AsNoTracking()
            .Where(sa => sa.StockId == stock.StockId)
            .OrderByDescending(sa => sa.AnalyzedAt)
            .Take(400)
            .Select(sa => new { sa.SentimentScore, sa.AnalyzedAt, sa.SentimentLabel, sa.Source })
            .ToListAsync();

        var band = NewsSentimentScorer.NeutralBand;
        var bullish = sentiments.Count(s => s.SentimentScore > band);
        var bearish = sentiments.Count(s => s.SentimentScore < -band);
        var neutralCount = sentiments.Count(s => Math.Abs(s.SentimentScore) <= band);

        double avgRaw = sentiments.Count > 0 ? sentiments.Average(s => (double)s.SentimentScore) : 0;
        var sentimentScore01 = Math.Round((avgRaw + 1.0) / 2.0, 4);

        var confidence = await _context.ConfidenceScores
            .AsNoTracking()
            .Where(c => c.StockId == stock.StockId)
            .OrderByDescending(c => c.CalculatedAt)
            .FirstOrDefaultAsync();

        double volatilityPct = 0;
        if (chronological.Count >= 3)
        {
            var closes = chronological.Select(c => (double)c.Price).ToList();
            var returns = new List<double>();
            for (var i = 1; i < closes.Count; i++)
            {
                if (closes[i - 1] == 0)
                {
                    continue;
                }

                returns.Add((closes[i] - closes[i - 1]) / closes[i - 1]);
            }

            if (returns.Count >= 2)
            {
                var avg = returns.Average();
                var variance = returns.Select(r => Math.Pow(r - avg, 2)).Average();
                var dailyStd = Math.Sqrt(variance);
                volatilityPct = Math.Round(dailyStd * Math.Sqrt(252.0) * 100.0, 2);
            }
        }

        var stabilityScore =
            confidence is not null
                ? Math.Clamp((int)Math.Round(confidence.ConfidenceValue * 100f, MidpointRounding.AwayFromZero), 0, 100)
                : chronological.Count >= 10
                    ? Math.Clamp(100 - (int)Math.Round(volatilityPct), 0, 100)
                    : 50;

        var fromDb = sentiments.Select((sa, idx) =>
        {
            var headline = DetailHeadlineFromSource(sa.Source, stock.Symbol);
            return new
            {
                id = $"det-{stock.StockId}-{sa.AnalyzedAt.Ticks}-{idx}",
                title = headline,
                summary = string.IsNullOrWhiteSpace(sa.SentimentLabel) ? headline : sa.SentimentLabel,
                source = DetailChannelFromSource(sa.Source),
                publishedAt = sa.AnalyzedAt,
                sentiment = NewsSentimentScorer.WireLabel(sa.SentimentScore),
                sentimentScore = sa.SentimentScore,
                url = "#"
            };
        }).ToList();

        var wireNews = await _marketData.FetchFinnhubCompanyNewsAsync(stock.Symbol);
        var fromWire = wireNews.Select((w, i) =>
        {
            var wScore = NewsSentimentScorer.ScoreText(w.Title);
            return new
            {
                id = $"fn-{stock.StockId}-{w.PublishedAtUtc.Ticks}-{i}",
                title = w.Title,
                summary = w.Title,
                source = w.Source,
                publishedAt = w.PublishedAtUtc,
                sentiment = NewsSentimentScorer.WireLabel(wScore),
                sentimentScore = wScore,
                url = "#"
            };
        }).ToList();

        var newsItems = fromDb
            .Concat(fromWire)
            .OrderByDescending(n => n.publishedAt)
            .GroupBy(n => n.title.Trim(), StringComparer.OrdinalIgnoreCase)
            .Select(g => g.First())
            .Take(15)
            .ToList();

        var latestPx = latestRow?.Price ?? 0m;
        var prices = chronological.Select(p => p.Price).ToList();
        var histHigh = prices.Count > 0 ? prices.Max() : latestPx;
        var histLow = prices.Count > 0 ? prices.Min() : latestPx;
        var histOpen = prices.Count > 0 ? prices[0] : latestPx;

        var open = enrichment?.Open ?? histOpen;
        var high = enrichment?.High ?? histHigh;
        var low = enrichment?.Low ?? histLow;
        var close = enrichment?.RegularMarketPrice ?? latestPx;

        long? volNum = enrichment?.RegularMarketVolume ?? (latestRow != null ? latestRow.Volume : null);
        var sectorOut = !string.IsNullOrWhiteSpace(enrichment?.Sector) ? enrichment!.Sector! : stock.Sector;

        var companyDescription = !string.IsNullOrWhiteSpace(enrichment?.CompanyDescription)
            ? enrichment!.CompanyDescription!
            : (volatilityPct > 0
                ? $"Annualized historical volatility (from recent DB prices): ~{volatilityPct:F1}%."
                : "Price and sentiment data are sourced from your FinPulse backend.");

        return Ok(new
        {
            stockId = stock.StockId,
            symbol = stock.Symbol,
            companyName = stock.CompanyName,
            companyDescription,
            sector = sectorOut,
            industry = enrichment?.Industry ?? "N/A",
            employeesDisplay = enrichment?.EmployeesDisplay ?? "N/A",
            headquartersDisplay = enrichment?.HeadquartersDisplay ?? "N/A",
            latestPrice = latestRow?.Price ?? 0,
            lastRetrievedAt = latestRow?.RecordedAt,
            priceHistory = chronological,
            keyStats = new
            {
                open,
                high,
                low,
                close,
                volume = FormatCompactNumber(volNum),
                avgVolume = FormatCompactNumber(enrichment?.AverageVolume),
                marketCap = enrichment?.MarketCapDisplay ?? "N/A",
                peRatio = enrichment?.TrailingPe,
                week52High = enrichment?.FiftyTwoWeekHigh ?? histHigh,
                week52Low = enrichment?.FiftyTwoWeekLow ?? histLow,
                dividend = enrichment?.DividendDisplay ?? "N/A",
                beta = enrichment?.Beta ?? 1m
            },
            confidenceScore = confidence?.ConfidenceValue ?? 0f,
            stabilityScore,
            volatilityAnnualizedPercent = volatilityPct,
            sentiment = new
            {
                bullish,
                bearish,
                neutral = neutralCount,
                score = sentimentScore01,
                mentions = sentiments.Count,
                trending = sentiments.Count >= 20
            },
            news = newsItems
        });
    }

    private const string SentimentSourceSeparator = "\u2016"; // ‖

    private static string DetailChannelFromSource(string? source)
    {
        if (string.IsNullOrWhiteSpace(source))
        {
            return "News";
        }

        var i = source.IndexOf(SentimentSourceSeparator, StringComparison.Ordinal);
        return i >= 0 ? source[..i].Trim() : "News";
    }

    private static string DetailHeadlineFromSource(string? source, string symbolFallback)
    {
        if (string.IsNullOrWhiteSpace(source))
        {
            return $"{symbolFallback} headline";
        }

        var i = source.IndexOf(SentimentSourceSeparator, StringComparison.Ordinal);
        if (i >= 0)
        {
            var headline = source[(i + 1)..].Trim();
            return string.IsNullOrEmpty(headline) ? symbolFallback : headline;
        }

        if (source.StartsWith("Reddit:", StringComparison.OrdinalIgnoreCase))
        {
            var h = source["Reddit:".Length..].Trim();
            return string.IsNullOrEmpty(h) ? "Reddit discussion" : h;
        }

        return source.Length > 180 ? source[..180] + "…" : source;
    }

    // GET: api/Stock/{symbol}/chart?range={range}
    [HttpGet("{symbol}/chart")]
    public async Task<IActionResult> GetChart(string symbol, [FromQuery] string range = "1M")
    {
        var stock = await _context.Stocks.FirstOrDefaultAsync(s => s.Symbol == symbol.ToUpper());
        if (stock == null)
            return NotFound(new { message = "Stock not found." });

        var rangeKey = (range ?? "1M").Trim().ToUpperInvariant();
        rangeKey = rangeKey switch
        {
            "1D" or "1W" or "1M" or "3M" or "1Y" or "ALL" => rangeKey,
            _ => "1M"
        };

        var cutoff = rangeKey switch
        {
            "1D"  => DateTime.UtcNow.AddHours(-24),
            "1W"  => DateTime.UtcNow.AddDays(-7),
            "1M"  => DateTime.UtcNow.AddDays(-30),
            "3M"  => DateTime.UtcNow.AddDays(-90),
            "1Y"  => DateTime.UtcNow.AddDays(-365),
            "ALL" => DateTime.MinValue,
            _     => DateTime.UtcNow.AddDays(-30)
        };

        var labelFormat = rangeKey switch
        {
            "1D" => "HH:mm",
            "1W" => "ddd dd",
            _    => "MMM dd"
        };

        var points = (await _context.PriceData
            .Where(p => p.StockId == stock.StockId && p.RecordedAt >= cutoff)
            .OrderBy(p => p.RecordedAt)
            .Select(p => new { p.Price, p.RecordedAt })
            .ToListAsync())
            .Select(p => (p.Price, p.RecordedAt))
            .ToList();

        var needYahoo = points.Count == 0 || ShouldPreferYahooChart(rangeKey, points);
        if (needYahoo)
        {
            var yahooPts = await FetchYahooChartPointsAsync(stock.Symbol, rangeKey);
            if (yahooPts.Count > 0)
            {
                points = yahooPts;
            }
        }

        var result = points.Select(p => new
        {
            label = p.RecordedAt.ToString(labelFormat),
            value = p.Price,
            recordedAt = p.RecordedAt
        });

        var from = points.Count > 0 ? points.First().RecordedAt : (DateTime?)null;
        var to = points.Count > 0 ? points.Last().RecordedAt : (DateTime?)null;

        return Ok(new
        {
            range = rangeKey,
            from,
            to,
            retrievedAt = to,
            points = result
        });
    }

    /// <summary>
    /// DB ingestion often produces only a few recent dots — long ranges (1M–1Y) then look identical.
    /// Prefer Yahoo when we do not have enough time coverage or bars for the selected window.
    /// </summary>
    private static bool ShouldPreferYahooChart(string rangeKey, IReadOnlyList<(decimal Price, DateTime RecordedAt)> dbPoints)
    {
        if (dbPoints.Count == 0)
        {
            return true;
        }

        var span = dbPoints[^1].RecordedAt - dbPoints[0].RecordedAt;
        var target = rangeKey switch
        {
            "1D" => TimeSpan.FromHours(20),
            "1W" => TimeSpan.FromDays(5),
            "1M" => TimeSpan.FromDays(18),
            "3M" => TimeSpan.FromDays(50),
            "1Y" => TimeSpan.FromDays(200),
            "ALL" => TimeSpan.FromDays(365 * 3),
            _ => TimeSpan.FromDays(18)
        };

        var minBars = rangeKey switch
        {
            "1D" => 12,
            "1W" => 8,
            "1M" => 12,
            "3M" => 14,
            "1Y" => 18,
            "ALL" => 20,
            _ => 10
        };

        if (dbPoints.Count < minBars)
        {
            return true;
        }

        return span < target;
    }

    private async Task<List<(decimal Price, DateTime RecordedAt)>> FetchYahooChartPointsAsync(string symbol, string range)
    {
        try
        {
            var (yahooRange, interval) = range.ToUpperInvariant() switch
            {
                "1D" => ("1d", "5m"),
                "1W" => ("5d", "30m"),
                "1M" => ("1mo", "1d"),
                "3M" => ("3mo", "1d"),
                "1Y" => ("1y", "1d"),
                "ALL" => ("5y", "1d"),
                _ => ("1mo", "1d"),
            };

            var client = _httpClientFactory.CreateClient(StockMarketDataService.YahooHttpClientName);
            var url = $"https://query1.finance.yahoo.com/v8/finance/chart/{Uri.EscapeDataString(symbol)}?range={yahooRange}&interval={interval}";
            using var response = await client.GetAsync(url);
            if (!response.IsSuccessStatusCode)
            {
                return [];
            }

            await using var stream = await response.Content.ReadAsStreamAsync();
            using var document = await JsonDocument.ParseAsync(stream);
            if (!document.RootElement.TryGetProperty("chart", out var chartRoot) ||
                !chartRoot.TryGetProperty("result", out var resultArray) ||
                resultArray.ValueKind != JsonValueKind.Array ||
                resultArray.GetArrayLength() == 0)
            {
                return [];
            }

            var result = resultArray[0];
            if (!result.TryGetProperty("timestamp", out var tsArray) || tsArray.ValueKind != JsonValueKind.Array)
            {
                return [];
            }

            if (!result.TryGetProperty("indicators", out var indicators) ||
                !indicators.TryGetProperty("quote", out var quoteArray) ||
                quoteArray.ValueKind != JsonValueKind.Array ||
                quoteArray.GetArrayLength() == 0)
            {
                return [];
            }

            var quote = quoteArray[0];
            if (!quote.TryGetProperty("close", out var closeArray) || closeArray.ValueKind != JsonValueKind.Array)
            {
                return [];
            }

            var items = new List<(decimal Price, DateTime RecordedAt)>();
            var n = Math.Min(tsArray.GetArrayLength(), closeArray.GetArrayLength());
            decimal? lastClose = null;
            for (var i = 0; i < n; i++)
            {
                var close = closeArray[i];
                var ts = tsArray[i];
                if (ts.ValueKind != JsonValueKind.Number)
                {
                    continue;
                }

                decimal price;
                if (close.ValueKind == JsonValueKind.Null || close.ValueKind == JsonValueKind.Undefined)
                {
                    if (lastClose is null)
                    {
                        continue;
                    }

                    price = lastClose.Value;
                }
                else if (close.ValueKind == JsonValueKind.Number)
                {
                    price = close.TryGetDecimal(out var d) ? d : (decimal)close.GetDouble();
                    if (price > 0m)
                    {
                        lastClose = price;
                    }
                }
                else
                {
                    continue;
                }

                if (price <= 0m)
                {
                    continue;
                }

                var unix = ts.TryGetInt64(out var ut) ? ut : (long)ts.GetDouble();
                if (unix <= 0)
                {
                    continue;
                }

                items.Add((price, DateTimeOffset.FromUnixTimeSeconds(unix).UtcDateTime));
            }

            return items;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Yahoo chart fallback failed for {Symbol} ({Range})", symbol, range);
            return [];
        }
    }

    // GET: api/Stock/{symbol}/export
    // Returns a CSV file with price history + sentiment data for the given symbol.
    [Authorize]
    [HttpGet("{symbol}/export")]
    public async Task<IActionResult> ExportToCsv(string symbol)
    {
        var stock = await _context.Stocks
            .FirstOrDefaultAsync(s => s.Symbol == symbol.ToUpper());

        if (stock == null)
            return NotFound(new { message = "Stock not found." });

        var prices = await _context.PriceData
            .Where(p => p.StockId == stock.StockId)
            .OrderByDescending(p => p.RecordedAt)
            .Take(500)
            .Select(p => new { p.RecordedAt, p.Price })
            .ToListAsync();

        var sentiments = await _context.SentimentAnalyses
            .Where(s => s.StockId == stock.StockId)
            .OrderByDescending(s => s.AnalyzedAt)
            .Take(200)
            .Select(s => new { s.AnalyzedAt, s.SentimentScore, s.SentimentLabel, s.Source })
            .ToListAsync();

        var sb = new System.Text.StringBuilder();

        // Sheet 1: Price History
        sb.AppendLine("FinPulse Export - " + stock.Symbol + " (" + stock.CompanyName + ")");
        sb.AppendLine("Generated: " + DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm") + " UTC");
        sb.AppendLine();

        sb.AppendLine("=== Price History ===");
        sb.AppendLine("Date,Time (UTC),Price (USD)");
        foreach (var p in prices)
        {
            sb.AppendLine($"{p.RecordedAt:yyyy-MM-dd},{p.RecordedAt:HH:mm},{p.Price:F2}");
        }

        sb.AppendLine();
        sb.AppendLine("=== Sentiment Analysis ===");
        sb.AppendLine("Date,Time (UTC),Score,Label,Source");
        foreach (var s in sentiments)
        {
            var safeSource = s.Source?.Replace(",", ";") ?? "";
            sb.AppendLine($"{s.AnalyzedAt:yyyy-MM-dd},{s.AnalyzedAt:HH:mm},{s.SentimentScore:F4},{s.SentimentLabel},{safeSource}");
        }

        var fileName = $"FinPulse_{stock.Symbol}_{DateTime.UtcNow:yyyyMMdd}.csv";
        var bytes = System.Text.Encoding.UTF8.GetBytes(sb.ToString());
        return File(bytes, "text/csv", fileName);
    }
}

public record AddStockRequest(string Symbol);
