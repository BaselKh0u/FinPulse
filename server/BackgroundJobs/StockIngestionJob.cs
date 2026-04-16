using Microsoft.Extensions.Options;
using Server.Config;
using Server.Services;

namespace Server.BackgroundJobs
{
    public class StockIngestionJob : BackgroundService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<StockIngestionJob> _logger;
        private readonly AlphaVantageOptions _options;

        public StockIngestionJob(
            IServiceProvider serviceProvider,
            IOptions<AlphaVantageOptions> options,
            ILogger<StockIngestionJob> logger)
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
                    await service.IngestAsync(stoppingToken);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Stock ingestion job failed.");
                }

                var delay = TimeSpan.FromMinutes(Math.Max(1, _options.PollingIntervalMinutes));
                await Task.Delay(delay, stoppingToken);
            }
        }
    }
}
