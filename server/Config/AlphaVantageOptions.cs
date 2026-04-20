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

        /// <summary>Pause between HTTP calls within the same symbol (quote → news → Finnhub, etc.). Also spaces Yahoo/Stooq.</summary>
        public int DelayBetweenAlphaVantageCallsSeconds { get; set; } = 15;

        /// <summary>
        /// Quote-only job: process at most this many symbols per tick, rotating through the full set (0 = all symbols every tick).
        /// </summary>
        public int MaxSymbolsPerQuoteBatch { get; set; } = 0;

        /// <summary>
        /// Extended job: max symbols per tick for news/social (0 = all every run).
        /// </summary>
        public int MaxSymbolsPerExtendedBatch { get; set; } = 0;

        /// <summary>
        /// Minimum wall-clock seconds between Alpha Vantage SYMBOL_SEARCH calls when the DB has no hits (0 = no limit).
        /// </summary>
        public int AlphaVantageSymbolSearchMinIntervalSeconds { get; set; } = 0;
    }
}
