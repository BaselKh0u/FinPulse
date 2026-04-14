using Server.Services;

namespace Server.BackgroundJobs
{
    public class AlertTriggerJob : BackgroundService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<AlertTriggerJob> _logger;

        public AlertTriggerJob(IServiceProvider serviceProvider, ILogger<AlertTriggerJob> logger)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    using var scope = _serviceProvider.CreateScope();
                    var service = scope.ServiceProvider.GetRequiredService<IAlertEvaluationService>();
                    await service.EvaluateAndTriggerAsync(stoppingToken);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Alert trigger job failed.");
                }

                await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
            }
        }
    }
}
