using Microsoft.Extensions.Options;
using Server.Config;
using Server.Services;

namespace Server.BackgroundJobs;

/// <summary>Frequently refreshes cached prices (quotes-only ingestion).</summary>
public class StockQuoteIngestionJob : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<StockQuoteIngestionJob> _logger;
    private readonly AlphaVantageOptions _options;

    public StockQuoteIngestionJob(
        IServiceProvider serviceProvider,
        IOptions<AlphaVantageOptions> options,
        ILogger<StockQuoteIngestionJob> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _options = options.Value;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (_options.StartupDelaySeconds > 0)
        {
            await Task.Delay(TimeSpan.FromSeconds(_options.StartupDelaySeconds), stoppingToken);
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var service = scope.ServiceProvider.GetRequiredService<IStockIngestionService>();
                await service.IngestAsync(stoppingToken, IngestionScope.QuotesOnly);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Quote ingestion job failed.");
            }

            try
            {
                var delay = TimeSpan.FromMinutes(Math.Max(1, _options.QuotePollingIntervalMinutes));
                await Task.Delay(delay, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
        }
    }
}
