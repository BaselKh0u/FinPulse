namespace Server.Services
{
    public interface IStockIngestionService
    {
        Task IngestAsync(CancellationToken cancellationToken);
    }
}
