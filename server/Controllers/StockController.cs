using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using Server.Config;
using Server.Data;
using Server.Models;
using Server.Services;
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

    public StockController(
        AppDbContext context,
        IHttpClientFactory httpClientFactory,
        IOptions<AlphaVantageOptions> options,
        IConfiguration configuration,
        ILogger<StockController> logger,
        IServiceProvider serviceProvider)
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
    public async Task<IActionResult> GetWatchlist()
    {
        var userId = GetUserId();

        var watchlist = await _context.Watchlists
            .Where(w => w.UserId == userId)
            .Join(_context.Stocks,
                w => w.StockId,
                s => s.StockId,
                (w, s) => new { w.AddedAt, Stock = s })
            .ToListAsync();

        var stockIds = watchlist.Select(w => w.Stock.StockId).ToList();

        // Fetch latest PriceData for each stock in one query
        var latestPrices = await _context.PriceData
            .Where(p => stockIds.Contains(p.StockId))
            .GroupBy(p => p.StockId)
            .Select(g => g.OrderByDescending(p => p.RecordedAt).First())
            .ToListAsync();

        var priceMap = latestPrices.ToDictionary(p => p.StockId);

        var result = watchlist.Select(w =>
        {
            priceMap.TryGetValue(w.Stock.StockId, out var price);
            return new
            {
                stockId = w.Stock.StockId,
                symbol = w.Stock.Symbol,
                companyName = w.Stock.CompanyName,
                sector = w.Stock.Sector,
                price = price?.Price ?? 0,
                volume = price?.Volume ?? 0,
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
            stock = new Stock { Symbol = symbol };
            _context.Stocks.Add(stock);
            await _context.SaveChangesAsync();
        }

        var alreadyInWatchlist = await _context.Watchlists
            .AnyAsync(w => w.UserId == userId && w.StockId == stock.StockId);

        if (alreadyInWatchlist)
            return BadRequest(new { message = "Stock is already in your watchlist." });

        _context.Watchlists.Add(new Watchlist { UserId = userId, StockId = stock.StockId });
        await _context.SaveChangesAsync();

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
                    sector = s.Sector
                })
                .ToListAsync();

            if (allStocks.Count > 0)
            {
                return Ok(allStocks);
            }

            if (_alphaOptions.Symbols?.Count > 0)
            {
                return Ok(_alphaOptions.Symbols.Select(s => new
                {
                    stockId = 0,
                    symbol = s.Trim().ToUpperInvariant(),
                    companyName = s.Trim().ToUpperInvariant(),
                    sector = string.Empty
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
            else
            {
                _logger.LogInformation("No DB results for {Query}, trying Alpha Vantage", q);
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
        await ingestionService.IngestAsync(CancellationToken.None);

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
        var stock = await _context.Stocks.FirstOrDefaultAsync(s => s.Symbol == symbol.ToUpper());
        if (stock == null)
            return NotFound(new { message = "Stock not found." });

        var priceHistory = await _context.PriceData
            .Where(p => p.StockId == stock.StockId)
            .OrderByDescending(p => p.RecordedAt)
            .Take(30)
            .Select(p => new { price = p.Price, volume = p.Volume, recordedAt = p.RecordedAt })
            .ToListAsync();

        var latestPrice = priceHistory.FirstOrDefault();

        return Ok(new
        {
            stockId = stock.StockId,
            symbol = stock.Symbol,
            companyName = stock.CompanyName,
            sector = stock.Sector,
            latestPrice = latestPrice?.price ?? 0,
            lastRetrievedAt = latestPrice?.recordedAt,
            priceHistory
        });
    }

    // GET: api/Stock/{symbol}/chart?range={range}
    [HttpGet("{symbol}/chart")]
    public async Task<IActionResult> GetChart(string symbol, [FromQuery] string range = "1M")
    {
        var stock = await _context.Stocks.FirstOrDefaultAsync(s => s.Symbol == symbol.ToUpper());
        if (stock == null)
            return NotFound(new { message = "Stock not found." });

        var cutoff = range switch
        {
            "1D"  => DateTime.UtcNow.AddHours(-24),
            "1W"  => DateTime.UtcNow.AddDays(-7),
            "1M"  => DateTime.UtcNow.AddDays(-30),
            "3M"  => DateTime.UtcNow.AddDays(-90),
            "1Y"  => DateTime.UtcNow.AddDays(-365),
            "ALL" => DateTime.MinValue,
            _     => DateTime.UtcNow.AddDays(-30)
        };

        var labelFormat = range switch
        {
            "1D" => "HH:mm",
            "1W" => "ddd dd",
            _    => "MMM dd"
        };

        var points = await _context.PriceData
            .Where(p => p.StockId == stock.StockId && p.RecordedAt >= cutoff)
            .OrderBy(p => p.RecordedAt)
            .Select(p => new { p.Price, p.RecordedAt })
            .ToListAsync();

        var result = points.Select(p => new
        {
            label = p.RecordedAt.ToString(labelFormat),
            value = p.Price,
            recordedAt = p.RecordedAt
        });

        return Ok(new
        {
            range = range.ToUpperInvariant(),
            from = points.FirstOrDefault()?.RecordedAt,
            to = points.LastOrDefault()?.RecordedAt,
            retrievedAt = points.LastOrDefault()?.RecordedAt ?? DateTime.UtcNow,
            points = result
        });
    }
}

public record AddStockRequest(string Symbol);
