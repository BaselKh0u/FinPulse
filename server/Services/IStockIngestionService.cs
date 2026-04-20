namespace Server.Services
{
    public interface IStockIngestionService
    {
        Task IngestAsync(CancellationToken cancellationToken, IngestionScope scope = IngestionScope.Full);
    }
}
