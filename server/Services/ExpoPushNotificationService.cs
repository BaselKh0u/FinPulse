using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Server.Data;

namespace Server.Services;

public interface IPushNotificationService
{
    Task NotifyAlertTriggeredAsync(int userId, string symbol, string detail, CancellationToken cancellationToken = default);
}

/// <summary>
/// Sends alert notifications via Expo Push (<see href="https://docs.expo.dev/push-notifications/sending-notifications/" />).
/// Requires users to register <c>ExponentPushToken[…]</c> via the mobile app (development/production builds; Expo Go may not expose projectId).
/// </summary>
public sealed class ExpoPushNotificationService : IPushNotificationService
{
    private const string ExpoPushUrl = "https://exp.host/--/api/v2/push/send";

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly AppDbContext _dbContext;
    private readonly ILogger<ExpoPushNotificationService> _logger;

    public ExpoPushNotificationService(
        IHttpClientFactory httpClientFactory,
        AppDbContext dbContext,
        ILogger<ExpoPushNotificationService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _dbContext = dbContext;
        _logger = logger;
    }

    public async Task NotifyAlertTriggeredAsync(int userId, string symbol, string detail, CancellationToken cancellationToken = default)
    {
        var prefs = await _dbContext.UserPreferences.AsNoTracking()
            .FirstOrDefaultAsync(u => u.UserId == userId, cancellationToken);
        if (prefs is { PushNotifications: false })
        {
            return;
        }

        var tokens = await _dbContext.DeviceTokens.AsNoTracking()
            .Where(d => d.UserId == userId && d.ExpoPushToken != "")
            .Select(d => d.ExpoPushToken)
            .Distinct()
            .ToListAsync(cancellationToken);

        if (tokens.Count == 0)
        {
            return;
        }

        var sym = symbol.Trim().ToUpperInvariant();
        var title = $"{sym} alert";
        var pushBody = detail.Length > 220 ? detail[..217] + "…" : detail;

        var payloadObj = new
        {
            messages = tokens.Select(t => new
            {
                to = t,
                title,
                body = pushBody,
                sound = "default",
                priority = "high",
                data = new { symbol = sym, kind = "alert" },
            }).ToList(),
        };

        var payload = JsonSerializer.Serialize(
            payloadObj,
            new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
        try
        {
            var client = _httpClientFactory.CreateClient(nameof(ExpoPushNotificationService));
            using var req = new HttpRequestMessage(HttpMethod.Post, ExpoPushUrl);
            req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            req.Content = new StringContent(payload, Encoding.UTF8, "application/json");

            using var resp = await client.SendAsync(req, cancellationToken);
            var respText = await resp.Content.ReadAsStringAsync(cancellationToken);
            if (!resp.IsSuccessStatusCode)
            {
                _logger.LogWarning(
                    "Expo push returned {Status}: {Body}",
                    (int)resp.StatusCode,
                    respText.Length > 400 ? respText[..400] : respText);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Expo push delivery failed for user {UserId}", userId);
        }
    }
}
