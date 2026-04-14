namespace Server.Config
{
    public class AlphaVantageOptions
    {
        public const string SectionName = "AlphaVantage";

        public string ApiKey { get; set; } = string.Empty;
        public string BaseUrl { get; set; } = "https://www.alphavantage.co";
        public List<string> Symbols { get; set; } = [];
        public int PollingIntervalMinutes { get; set; } = 5;
        public int NewsPageSize { get; set; } = 10;

        /// <summary>Wait this many seconds after host start before the first ingestion run (lets Swagger / Kestrel respond first).</summary>
        public int StartupDelaySeconds { get; set; } = 15;
    }
}
