namespace Server.Config
{
    public class AlphaVantageOptions
    {
        public const string SectionName = "AlphaVantage";

        public string ApiKey { get; set; } = string.Empty;
        public List<string> ApiKeys { get; set; } = [];
        public string BaseUrl { get; set; } = "https://www.alphavantage.co";
        public List<string> Symbols { get; set; } = [];
        public int PollingIntervalMinutes { get; set; } = 1440;
        public int NewsPageSize { get; set; } = 10;

        /// <summary>Wait this many seconds after host start before the first ingestion run (lets Swagger / Kestrel respond first).</summary>
        public int StartupDelaySeconds { get; set; } = 15;

        /// <summary>Pause after finishing one symbol before starting the next (reduces Alpha Vantage rate-limit hits).</summary>
        public int DelayBetweenSymbolIngestionSeconds { get; set; } = 15;

        /// <summary>Pause between consecutive Alpha Vantage HTTP calls within the same symbol (quote, news).</summary>
        public int DelayBetweenAlphaVantageCallsSeconds { get; set; } = 15;
    }
}
