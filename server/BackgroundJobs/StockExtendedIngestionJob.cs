using Microsoft.Extensions.Options;
using Server.Config;
using Server.Services;

namespace Server.BackgroundJobs;

/// <summary>Less frequent pass: Alpha Vantage news (when enabled), Finnhub, social signals, confidence.</summary>
public class StockExtendedIngestionJob : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<StockExtendedIngestionJob> _logger;
    private readonly AlphaVantageOptions _options;

    public StockExtendedIngestionJob(
        IServiceProvider serviceProvider,
        IOptions<AlphaVantageOptions> options,
        ILogger<StockExtendedIngestionJob> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _options = options.Value;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var startupSeconds = Math.Clamp(_options.StartupDelaySeconds, 0, 3600)
            + Math.Clamp(_options.ExtendedJobStartupOffsetSeconds, 0, 7200);
        if (startupSeconds > 0)
        {
            await Task.Delay(TimeSpan.FromSeconds(startupSeconds), stoppingToken);
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var service = scope.ServiceProvider.GetRequiredService<IStockIngestionService>();
                await service.IngestAsync(stoppingToken, IngestionScope.ExtendedOnly);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Extended stock ingestion job failed.");
            }

            try
            {
                var delay = TimeSpan.FromMinutes(Math.Max(1, _options.ExtendedPollingIntervalMinutes));
                await Task.Delay(delay, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
        }
    }
}
