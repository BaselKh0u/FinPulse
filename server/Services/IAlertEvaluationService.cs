namespace Server.Services
{
    public interface IAlertEvaluationService
    {
        Task EvaluateAndTriggerAsync(CancellationToken cancellationToken);
    }
}
