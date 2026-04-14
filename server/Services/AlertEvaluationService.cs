using Microsoft.EntityFrameworkCore;
using Server.Data;
using Server.Models;

namespace Server.Services
{
    public class AlertEvaluationService : IAlertEvaluationService
    {
        private readonly AppDbContext _dbContext;
        private readonly ILogger<AlertEvaluationService> _logger;

        public AlertEvaluationService(AppDbContext dbContext, ILogger<AlertEvaluationService> logger)
        {
            _dbContext = dbContext;
            _logger = logger;
        }

        public async Task EvaluateAndTriggerAsync(CancellationToken cancellationToken)
        {
            var now = DateTime.UtcNow;
            var alerts = await _dbContext.Alerts
                .Where(a => a.IsActive)
                .ToListAsync(cancellationToken);

            foreach (var alert in alerts)
            {
                if (!CanTriggerByCooldown(alert, now))
                {
                    continue;
                }

                var triggerResult = alert.ConditionType switch
                {
                    AlertConditionType.PriceTarget => await EvaluatePriceTargetAsync(alert, cancellationToken),
                    AlertConditionType.PercentVolatility => await EvaluatePercentVolatilityAsync(alert, cancellationToken),
                    AlertConditionType.ReportReleased => await EvaluateReportReleasedAsync(alert, cancellationToken),
                    _ => null
                };

                if (triggerResult is null)
                {
                    continue;
                }

                _dbContext.AlertEvents.Add(new AlertEvent
                {
                    AlertId = alert.AlertId,
                    UserId = alert.UserId,
                    StockId = alert.StockId,
                    ConditionType = alert.ConditionType,
                    TriggerValue = triggerResult.TriggerValue,
                    Details = triggerResult.Details,
                    CreatedAt = now
                });

                alert.LastTriggeredAt = now;
            }

            await _dbContext.SaveChangesAsync(cancellationToken);
        }

        private static bool CanTriggerByCooldown(Alert alert, DateTime nowUtc)
        {
            if (alert.CooldownMinutes <= 0 || alert.LastTriggeredAt is null)
            {
                return true;
            }

            return alert.LastTriggeredAt.Value.AddMinutes(alert.CooldownMinutes) <= nowUtc;
        }

        private async Task<TriggerResult?> EvaluatePriceTargetAsync(Alert alert, CancellationToken cancellationToken)
        {
            if (alert.TargetPrice is null)
            {
                return null;
            }

            var latestPrice = await _dbContext.PriceData
                .Where(p => p.StockId == alert.StockId)
                .OrderByDescending(p => p.RecordedAt)
                .Select(p => (decimal?)p.Price)
                .FirstOrDefaultAsync(cancellationToken);

            if (latestPrice is null)
            {
                return null;
            }

            var triggered = alert.Direction == AlertDirection.Above
                ? latestPrice.Value >= alert.TargetPrice.Value
                : latestPrice.Value <= alert.TargetPrice.Value;
            if (!triggered)
            {
                return null;
            }

            return new TriggerResult(latestPrice.Value, $"Price condition matched at {latestPrice.Value}.");
        }

        private async Task<TriggerResult?> EvaluatePercentVolatilityAsync(Alert alert, CancellationToken cancellationToken)
        {
            if (alert.PercentageThreshold is null)
            {
                return null;
            }

            var windowMinutes = alert.VolatilityWindowMinutes.GetValueOrDefault(60);
            var fromTime = DateTime.UtcNow.AddMinutes(-Math.Max(1, windowMinutes));
            var points = await _dbContext.PriceData
                .Where(p => p.StockId == alert.StockId && p.RecordedAt >= fromTime)
                .OrderBy(p => p.RecordedAt)
                .Select(p => p.Price)
                .ToListAsync(cancellationToken);

            if (points.Count < 2)
            {
                return null;
            }

            var baseline = alert.ReferencePrice ?? points.First();
            if (baseline == 0)
            {
                return null;
            }

            var latest = points.Last();
            var changePercent = ((latest - baseline) / baseline) * 100m;

            var threshold = alert.PercentageThreshold.Value;
            var triggered = alert.Direction == AlertDirection.Above
                ? changePercent >= threshold
                : changePercent <= -threshold;
            if (!triggered)
            {
                return null;
            }

            return new TriggerResult(changePercent, $"Volatility condition matched at {changePercent:F2}%.");
        }

        private async Task<TriggerResult?> EvaluateReportReleasedAsync(Alert alert, CancellationToken cancellationToken)
        {
            var since = alert.LastTriggeredAt ?? alert.CreatedAt;
            var query = _dbContext.SentimentAnalyses
                .Where(sa => sa.StockId == alert.StockId && sa.AnalyzedAt > since);

            if (!string.IsNullOrWhiteSpace(alert.ReportKeyword))
            {
                var keyword = alert.ReportKeyword.Trim();
                query = query.Where(sa => sa.Source.Contains(keyword) || sa.SentimentLabel.Contains(keyword));
            }

            var report = await query.OrderByDescending(sa => sa.AnalyzedAt).FirstOrDefaultAsync(cancellationToken);
            if (report is null)
            {
                return null;
            }

            return new TriggerResult(report.SentimentScore,
                $"New report detected: {report.Source} ({report.SentimentLabel}).");
        }

        private sealed record TriggerResult(decimal? TriggerValue, string Details);
    }
}
